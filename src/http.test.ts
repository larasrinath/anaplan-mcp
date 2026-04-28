import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractHttpAccessToken,
  isHttpAccessAuthorized,
  loadHttpAuthConfig,
  loadHttpBodyLimit,
  createHttpApp,
  validateRemoteHttpEnv,
} from "./http.js";

describe("HTTP auth config", () => {
  afterEach(() => {
    delete process.env.ANAPLAN_CLIENT_ID;
    delete process.env.ANAPLAN_USERNAME;
    delete process.env.ANAPLAN_PASSWORD;
    delete process.env.ANAPLAN_CERTIFICATE_PATH;
    delete process.env.ANAPLAN_PRIVATE_KEY_PATH;
    delete process.env.ANAPLAN_MCP_HTTP_BODY_LIMIT;
    delete process.env.MCP_HTTP_BODY_LIMIT;
    vi.restoreAllMocks();
  });

  it("requires at least one credential set for remote HTTP mode", () => {
    expect(() => validateRemoteHttpEnv({} as NodeJS.ProcessEnv))
      .toThrow("Remote HTTP mode requires one of");
  });

  it("accepts ANAPLAN_CLIENT_ID alone for remote HTTP mode", () => {
    expect(() => validateRemoteHttpEnv({
      ANAPLAN_CLIENT_ID: "cid",
    } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("accepts ANAPLAN_USERNAME+ANAPLAN_PASSWORD alone for remote HTTP mode", () => {
    expect(() => validateRemoteHttpEnv({
      ANAPLAN_USERNAME: "svc-account",
      ANAPLAN_PASSWORD: "svc-pass",
    } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("accepts ANAPLAN_CERTIFICATE_PATH+ANAPLAN_PRIVATE_KEY_PATH alone for remote HTTP mode", () => {
    expect(() => validateRemoteHttpEnv({
      ANAPLAN_CERTIFICATE_PATH: "/cert.pem",
      ANAPLAN_PRIVATE_KEY_PATH: "/key.pem",
    } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("loads the optional bearer-token alias", () => {
    const config = loadHttpAuthConfig({
      MCP_HTTP_AUTH_TOKEN: "alias-token",
    } as NodeJS.ProcessEnv);

    expect(config).toEqual({
      bearerToken: "alias-token",
    });
  });

  it("defaults the HTTP body limit to 100mb", () => {
    expect(loadHttpBodyLimit({} as NodeJS.ProcessEnv)).toBe("100mb");
  });

  it("loads the HTTP body limit from env aliases", () => {
    expect(loadHttpBodyLimit({
      MCP_HTTP_BODY_LIMIT: "25mb",
    } as NodeJS.ProcessEnv)).toBe("25mb");
  });

  it("configures express.json with the resolved HTTP body limit", () => {
    process.env.ANAPLAN_CLIENT_ID = "client-id";
    process.env.ANAPLAN_MCP_HTTP_BODY_LIMIT = "32mb";

    const jsonMiddleware = (_req: unknown, _res: unknown, next: () => void) => next();
    const jsonSpy = vi.spyOn(express, "json").mockReturnValue(jsonMiddleware as never);

    createHttpApp();

    expect(jsonSpy).toHaveBeenCalledWith({ limit: "32mb" });
  });
});

describe("HTTP access token parsing", () => {
  it("extracts a bearer token from the Authorization header", () => {
    expect(extractHttpAccessToken({
      authorization: "Bearer secret-token",
    })).toBe("secret-token");
  });

  it("falls back to X-MCP-API-Key", () => {
    expect(extractHttpAccessToken({
      xMcpApiKey: "secret-token",
    })).toBe("secret-token");
  });

  it("falls back to X-API-Key", () => {
    expect(extractHttpAccessToken({
      xApiKey: "secret-token",
    })).toBe("secret-token");
  });

  it("returns null for unsupported auth headers", () => {
    expect(extractHttpAccessToken({
      authorization: "Basic abc123",
    })).toBeNull();
  });
});

describe("HTTP access authorization", () => {
  const config = { bearerToken: "secret-token" };

  it("rejects requests without the configured outer token", () => {
    expect(isHttpAccessAuthorized({}, config)).toBe(false);
  });

  it("rejects requests with the wrong bearer token", () => {
    expect(isHttpAccessAuthorized({
      authorization: "Bearer wrong-token",
    }, config)).toBe(false);
  });

  it("accepts the correct bearer token", () => {
    expect(isHttpAccessAuthorized({
      authorization: "Bearer secret-token",
    }, config)).toBe(true);
  });

  it("accepts X-MCP-API-Key as an alternative header", () => {
    expect(isHttpAccessAuthorized({
      xMcpApiKey: "secret-token",
    }, config)).toBe(true);
  });

  it("allows access when no outer bearer token is configured", () => {
    expect(isHttpAccessAuthorized({}, { bearerToken: null })).toBe(true);
  });
});
