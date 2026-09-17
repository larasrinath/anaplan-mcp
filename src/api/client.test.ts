import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnaplanApiError, AnaplanClient } from "./client.js";

const mockAuthManager = {
  getAuthHeaders: vi.fn().mockResolvedValue({ Authorization: "AnaplanAuthToken test" }),
};

describe("AnaplanClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockAuthManager.getAuthHeaders.mockResolvedValue({ Authorization: "AnaplanAuthToken test" });
  });

  it("makes GET request with auth headers to correct URL", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ workspaces: [] }),
    } as Response);

    const client = new AnaplanClient(mockAuthManager as any);
    const result = await client.get("/workspaces");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.anaplan.com/2/0/workspaces",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "AnaplanAuthToken test" }),
      })
    );
    expect(result).toEqual({ workspaces: [] });
  });

  it("sends Accept: application/json header", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    const client = new AnaplanClient(mockAuthManager as any);
    await client.get("/test");

    expect(fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/json" }),
      })
    );
  });

  it("preserves HTTP status for discovery errors without parsing the message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      status: { code: 404, message: "Not found" },
    }), { status: 404 }));

    const client = new AnaplanClient(mockAuthManager as any);
    const error = await client.get("/models/missing").catch((error: unknown) => error);

    expect(error).toBeInstanceOf(AnaplanApiError);
    expect(error).toMatchObject({
      status: 404,
      message: 'Anaplan API error (404): {"status":{"code":404,"message":"Not found"}}',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("getRaw returns text response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "raw,csv,data",
    } as Response);

    const client = new AnaplanClient(mockAuthManager as any);
    const result = await client.getRaw("/files/123/chunks/0");

    expect(result).toBe("raw,csv,data");
  });

  it("getRawBytes returns the exact response bytes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => Uint8Array.from([0x50, 0x4b, 0x03, 0x04]).buffer,
    } as Response);

    const client = new AnaplanClient(mockAuthManager as any);
    const result = await client.getRawBytes("/files/123/chunks/0");

    expect(Buffer.isBuffer(result)).toBe(true);
    expect([...result]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("retries on 429 with backoff", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers({ "Retry-After": "0" }), json: async () => ({}) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response);

    const client = new AnaplanClient(mockAuthManager as any);
    const result = await client.get("/test");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
  });

  it("retries on 5xx errors up to 3 times", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ message: "fail" }) } as Response)
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ message: "fail" }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response);

    const client = new AnaplanClient(mockAuthManager as any);
    const result = await client.get("/test");

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ ok: true });
  }, 15000);

  it("throws after max retries", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "server error" }),
    } as Response);

    const client = new AnaplanClient(mockAuthManager as any);
    await expect(client.get("/test")).rejects.toThrow();
  }, 30000);

  it("makes POST request with JSON body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ task: { taskId: "t1" } }),
    } as Response);

    const client = new AnaplanClient(mockAuthManager as any);
    const result = await client.post("/actions", { localeName: "en_US" });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.anaplan.com/2/0/actions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ localeName: "en_US" }),
      })
    );
  });

  it("treats 204 No Content as successful empty response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    } as Response);

    const client = new AnaplanClient(mockAuthManager as any);
    const result = await client.delete("/workspaces/w/models/m/files/f");
    expect(result).toEqual({});
  });

  describe("getAll", () => {
    it("returns all items from a single page", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { paging: { currentPageSize: 2, offset: 0, totalSize: 2 } },
          items: [{ id: "1" }, { id: "2" }],
        }),
      } as Response);

      const client = new AnaplanClient(mockAuthManager as any);
      const result = await client.getAll<any>("/test", "items");
      expect(result).toEqual([{ id: "1" }, { id: "2" }]);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("fetches multiple pages and concatenates results", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({
            meta: { paging: { currentPageSize: 2, offset: 0, totalSize: 5 } },
            items: [{ id: "1" }, { id: "2" }],
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({
            meta: { paging: { currentPageSize: 2, offset: 2, totalSize: 5 } },
            items: [{ id: "3" }, { id: "4" }],
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({
            meta: { paging: { currentPageSize: 1, offset: 4, totalSize: 5 } },
            items: [{ id: "5" }],
          }),
        } as Response);

      const client = new AnaplanClient(mockAuthManager as any);
      const result = await client.getAll<any>("/test", "items");
      expect(result).toEqual([{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }, { id: "5" }]);
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("handles response without paging metadata (single page)", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ items: [{ id: "1" }] }),
      } as Response);

      const client = new AnaplanClient(mockAuthManager as any);
      const result = await client.getAll<any>("/test", "items");
      expect(result).toEqual([{ id: "1" }]);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("returns empty array when key is missing", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({}),
      } as Response);

      const client = new AnaplanClient(mockAuthManager as any);
      const result = await client.getAll<any>("/test", "items");
      expect(result).toEqual([]);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("supports fallback keys and uses first array key found", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ users: [{ id: "u1" }] }),
      } as Response);

      const client = new AnaplanClient(mockAuthManager as any);
      const result = await client.getAll<any>("/users", ["users", "user"]);
      expect(result).toEqual([{ id: "u1" }]);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("appends offset param correctly to URL with existing query params", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({
            meta: { paging: { currentPageSize: 2, offset: 0, totalSize: 3 } },
            items: [{ id: "1" }, { id: "2" }],
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({
            meta: { paging: { currentPageSize: 1, offset: 2, totalSize: 3 } },
            items: [{ id: "3" }],
          }),
        } as Response);

      const client = new AnaplanClient(mockAuthManager as any);
      await client.getAll<any>("/test?foo=bar", "items");
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/test?foo=bar&offset=2"),
        expect.anything()
      );
    });
  });
});
