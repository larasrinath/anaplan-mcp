import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthManager } from "./manager.js";

describe("AuthManager", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.ANAPLAN_USERNAME;
    delete process.env.ANAPLAN_PASSWORD;
    delete process.env.ANAPLAN_CLIENT_ID;
    delete process.env.ANAPLAN_CLIENT_SECRET;
    delete process.env.ANAPLAN_CERTIFICATE_PATH;
    delete process.env.ANAPLAN_PRIVATE_KEY_PATH;
    delete process.env.ANAPLAN_CERTIFICATE_ENCODED_DATA_FORMAT;
    delete process.env.ANAPLAN_OAUTH_AUTHORIZATION_CODE;
    delete process.env.ANAPLAN_OAUTH_REDIRECT_URI;
    delete process.env.ANAPLAN_REFRESH_TOKEN;
  });

  it("returns deferred provider when no credentials are configured", async () => {
    const manager = AuthManager.fromEnv();
    expect(manager.getProviderType()).toBe("none");
    await expect(manager.getAuthHeaders()).rejects.toThrow("No Anaplan credentials");
  });

  it("selects basic auth when username/password are set", () => {
    process.env.ANAPLAN_USERNAME = "user";
    process.env.ANAPLAN_PASSWORD = "pass";
    const manager = AuthManager.fromEnv();
    expect(manager).toBeInstanceOf(AuthManager);
  });

  it("prefers certificate over basic when both are set", () => {
    process.env.ANAPLAN_USERNAME = "user";
    process.env.ANAPLAN_PASSWORD = "pass";
    process.env.ANAPLAN_CERTIFICATE_PATH = "/cert.pem";
    process.env.ANAPLAN_PRIVATE_KEY_PATH = "/key.pem";
    const manager = AuthManager.fromEnv();
    expect(manager.getProviderType()).toBe("certificate");
  });

  it("throws on invalid certificate encoded data format", () => {
    process.env.ANAPLAN_CERTIFICATE_PATH = "/cert.pem";
    process.env.ANAPLAN_PRIVATE_KEY_PATH = "/key.pem";
    process.env.ANAPLAN_CERTIFICATE_ENCODED_DATA_FORMAT = "v3";
    expect(() => AuthManager.fromEnv()).toThrow("encoded data format");
  });

  it("ignores authorization code env vars and still starts device grant", async () => {
    process.env.ANAPLAN_CLIENT_ID = "cid";
    process.env.ANAPLAN_CLIENT_SECRET = "csecret";
    process.env.ANAPLAN_OAUTH_AUTHORIZATION_CODE = "authcode";
    process.env.ANAPLAN_OAUTH_REDIRECT_URI = "https://example.com/callback";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        device_code: "dc",
        user_code: "ABCD-1234",
        verification_uri: "https://example.com/device",
        expires_in: 300,
        interval: 5,
      }),
    } as Response);

    const manager = AuthManager.fromEnv();
    expect(manager.getProviderType()).toBe("oauth");
    await expect(manager.getAuthHeaders()).rejects.toThrow("Anaplan authorization required");
    expect(fetchSpy.mock.calls[0]?.[0]).toContain("device/code");
  });

  it("selects oauth device grant when only client_id is set", () => {
    process.env.ANAPLAN_CLIENT_ID = "cid";
    const manager = AuthManager.fromEnv();
    expect(manager.getProviderType()).toBe("oauth");
  });

  it("builds remote HTTP auth from OAuth client env only", () => {
    process.env.ANAPLAN_CLIENT_ID = "cid";
    process.env.ANAPLAN_USERNAME = "user";
    process.env.ANAPLAN_PASSWORD = "pass";

    const manager = AuthManager.fromRemoteHttpEnv();

    expect(manager.getProviderType()).toBe("oauth");
  });

  it("throws when remote HTTP auth is missing ANAPLAN_CLIENT_ID", () => {
    expect(() => AuthManager.fromRemoteHttpEnv()).toThrow("Remote HTTP mode requires ANAPLAN_CLIENT_ID");
  });

  it("uses ANAPLAN_REFRESH_TOKEN to skip device grant on first auth call", async () => {
    process.env.ANAPLAN_CLIENT_ID = "cid";
    process.env.ANAPLAN_REFRESH_TOKEN = "stored-refresh";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "bearer-token",
        token_type: "Bearer",
        expires_in: 2100,
        refresh_token: "new-refresh",
      }),
    } as Response);

    const manager = AuthManager.fromEnv();
    expect(manager.getProviderType()).toBe("oauth");
    const headers = await manager.getAuthHeaders();
    expect(headers.Authorization).toBe("Bearer bearer-token");
  });

  it("returns auth headers with token after authenticate", async () => {
    process.env.ANAPLAN_USERNAME = "user";
    process.env.ANAPLAN_PASSWORD = "pass";

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "SUCCESS",
        tokenInfo: {
          tokenId: "tid",
          tokenValue: "mytoken",
          expiresAt: Date.now() + 2100000,
          refreshTokenId: "rid",
        },
      }),
    } as Response);

    const manager = AuthManager.fromEnv();
    const headers = await manager.getAuthHeaders();
    expect(headers.Authorization).toBe("AnaplanAuthToken mytoken");
  });

  it("refreshes token when close to expiry", async () => {
    process.env.ANAPLAN_USERNAME = "user";
    process.env.ANAPLAN_PASSWORD = "pass";

    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          status: "SUCCESS",
          tokenInfo: {
            tokenId: `tid${callCount}`,
            tokenValue: callCount === 1 ? "original" : "refreshed",
            expiresAt: callCount === 1 ? Date.now() - 1000 : Date.now() + 2100000,
            refreshTokenId: `rid${callCount}`,
          },
        }),
      } as Response;
    });

    const manager = AuthManager.fromEnv();
    await manager.getAuthHeaders();
    const headers = await manager.getAuthHeaders();
    expect(headers.Authorization).toBe("AnaplanAuthToken refreshed");
  });

  it("forces re-auth via device grant after 60 min OAuth inactivity", async () => {
    process.env.ANAPLAN_CLIENT_ID = "cid";
    process.env.ANAPLAN_REFRESH_TOKEN = "stored-refresh";

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // First call: initial auth via refresh token
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "bearer-token",
        token_type: "Bearer",
        expires_in: 7200,
        refresh_token: "new-refresh",
      }),
    } as Response);

    // Second call: device code request after inactivity expires
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        device_code: "dc",
        user_code: "ABCD-1234",
        verification_uri: "https://example.com/device",
        expires_in: 300,
        interval: 5,
      }),
    } as Response);

    const manager = AuthManager.fromEnv();
    await manager.getAuthHeaders();

    // Simulate 61 minutes of inactivity
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61 * 60 * 1000);

    // Next call should attempt device grant → throws DeviceAuthorizationRequiredError
    await expect(manager.getAuthHeaders()).rejects.toThrow("Anaplan authorization required");
  });

  it("surfaces a clearer message when OAuth refresh is rejected and reauth is needed", async () => {
    process.env.ANAPLAN_CLIENT_ID = "cid";
    process.env.ANAPLAN_REFRESH_TOKEN = "stored-refresh";

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "bearer-token",
          token_type: "Bearer",
          expires_in: 60,
          refresh_token: "new-refresh",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          device_code: "dc",
          user_code: "ABCD-1234",
          verification_uri: "https://example.com/device",
          expires_in: 300,
          interval: 5,
        }),
      } as Response);

    const manager = AuthManager.fromEnv();
    await manager.getAuthHeaders();

    let message = "";
    try {
      await manager.getAuthHeaders();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("Anaplan OAuth reauthorization required");
    expect(message).toContain("can reach Anaplan auth");
  });

  it("does not force re-auth when OAuth is used within 60 min", async () => {
    process.env.ANAPLAN_CLIENT_ID = "cid";
    process.env.ANAPLAN_REFRESH_TOKEN = "stored-refresh";

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "bearer-token",
        token_type: "Bearer",
        expires_in: 7200,
        refresh_token: "new-refresh",
      }),
    } as Response);

    const manager = AuthManager.fromEnv();
    await manager.getAuthHeaders();

    // Simulate 30 minutes of activity (within window)
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 30 * 60 * 1000);

    const headers = await manager.getAuthHeaders();
    expect(headers.Authorization).toBe("Bearer bearer-token");
  });
});
