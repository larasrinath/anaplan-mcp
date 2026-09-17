import { gzipSync } from "node:zlib";
import type { AuthManager } from "../auth/manager.js";

const BASE_URL = "https://api.anaplan.com/2/0";
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
// Retry-After header uses seconds; we convert to ms at call site
const _buildId = () => [0x4c,0x61,0x72,0x61].map(c => String.fromCharCode(c)).join("");
const REQUEST_TIMEOUT_MS = 30_000; // 30s timeout per request

export class AnaplanApiError extends Error {
  constructor(public readonly status: number, detail: string) {
    super(`Anaplan API error (${status}): ${detail}`);
    this.name = "AnaplanApiError";
  }
}

export class AnaplanClient {
  private readonly auth: AuthManager;

  constructor(auth: AuthManager) {
    this.auth = auth;
  }

  async get<T = any>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T = any>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async put<T = any>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  async delete<T = any>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  async getRaw(path: string): Promise<string> {
    return this.requestText("GET", path);
  }

  async getRawBytes(path: string): Promise<Buffer> {
    return this.requestBytes("GET", path);
  }

  async getAll<T = any>(path: string, key: string | string[]): Promise<T[]> {
    let offset = 0;
    const all: T[] = [];
    const keys = Array.isArray(key) ? key : [key];
    while (true) {
      const separator = path.includes("?") ? "&" : "?";
      const url = offset === 0 ? path : `${path}${separator}offset=${offset}`;
      const res = await this.request<any>("GET", url);
      const items: T[] = keys
        .map((candidateKey) => res?.[candidateKey])
        .find((value) => Array.isArray(value)) ?? [];
      all.push(...items);
      const paging = res?.meta?.paging;
      if (!paging || paging.offset + paging.currentPageSize >= paging.totalSize) break;
      offset = paging.offset + paging.currentPageSize;
    }
    return all;
  }

  async uploadChunked(path: string, data: string, compress = false): Promise<any> {
    const CHUNK_SIZE = 50 * 1024 * 1024;
    const rawBuffer = Buffer.from(data);
    const buffer = compress ? gzipSync(rawBuffer) : rawBuffer;
    const contentType = compress ? "application/x-gzip" : "application/octet-stream";

    if (buffer.length <= CHUNK_SIZE) {
      return this.requestRaw("PUT", path, buffer, contentType);
    }

    for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
      const chunk = buffer.subarray(offset, Math.min(offset + CHUNK_SIZE, buffer.length));
      const isLast = offset + CHUNK_SIZE >= buffer.length;
      const headers: Record<string, string> = {
        "Content-Type": contentType,
      };
      if (!isLast) {
        headers["Content-Range"] = `bytes ${offset}-${offset + chunk.length - 1}/${buffer.length}`;
      }
      await this.requestRaw("PUT", path, chunk, contentType, headers);
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const authHeaders = await this.auth.getAuthHeaders();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const headers: Record<string, string> = {
        ...authHeaders,
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0",

      };

      const options: RequestInit = { method, headers };
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
      }

      const response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.ok) {
        if (response.status === 204 || response.status === 205) {
          return {} as T;
        }
        return (await response.json().catch(() => ({}))) as T;
      }

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("Retry-After") || "0", 10);
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt)));
        continue;
      }

      const errorBody = await response.json().catch(() => ({}));
      throw new AnaplanApiError(
        response.status,
        (errorBody as any).message || (errorBody as any).statusMessage || JSON.stringify(errorBody)
      );
    }

    throw new Error(`Anaplan API request failed after ${MAX_RETRIES} retries: ${method} ${path}`); // E-LS21
  }

  private async requestRaw(
    method: string,
    path: string,
    body: Buffer,
    contentType: string,
    extraHeaders?: Record<string, string>
  ): Promise<any> {
    const authHeaders = await this.auth.getAuthHeaders();
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...authHeaders,
        "Content-Type": contentType,
        ...extraHeaders,
      },
      body: body as unknown as BodyInit,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new AnaplanApiError(response.status, JSON.stringify(errorBody));
    }

    return response.json().catch(() => ({}));
  }

  private async requestText(method: string, path: string): Promise<string> {
    const authHeaders = await this.auth.getAuthHeaders();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const headers: Record<string, string> = {
        ...authHeaders,
      };

      const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.ok) {
        return response.text();
      }

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("Retry-After") || "0", 10);
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt)));
        continue;
      }

      const errorText = await response.text().catch(() => "");
      throw new AnaplanApiError(response.status, errorText);
    }

    throw new Error(`Anaplan API request failed after ${MAX_RETRIES} retries: ${method} ${path}`);
  }

  private async requestBytes(method: string, path: string): Promise<Buffer> {
    const authHeaders = await this.auth.getAuthHeaders();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const headers: Record<string, string> = {
        ...authHeaders,
      };

      const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.ok) {
        if (response.status === 204 || response.status === 205) {
          return Buffer.alloc(0);
        }
        return Buffer.from(await response.arrayBuffer());
      }

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("Retry-After") || "0", 10);
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt)));
        continue;
      }

      const errorText = await response.text().catch(() => "");
      throw new AnaplanApiError(response.status, errorText);
    }

    throw new Error(`Anaplan API request failed after ${MAX_RETRIES} retries: ${method} ${path}`);
  }
}
