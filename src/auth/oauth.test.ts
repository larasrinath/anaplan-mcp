import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  OAuthProvider,
  DeviceAuthorizationRequiredError,
  OAuthReauthorizationRequiredError,
} from "./oauth.js";

describe("OAuthProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws if clientId is missing", () => {
    expect(() => new OAuthProvider("", "secret")).toThrow("client ID");
  });

  describe("device grant", () => {
    it("throws DeviceAuthorizationRequiredError on first call with URL and code", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          device_code: "dcode",
          user_code: "UCODE",
          verification_uri: "https://auth.anaplan.com/device",
          expires_in: 600,
          interval: 5,
        }),
      } as Response);

      const provider = new OAuthProvider("client-id");
      let caught: DeviceAuthorizationRequiredError | undefined;
      try {
        await provider.authenticate();
      } catch (e) {
        caught = e as DeviceAuthorizationRequiredError;
      }

      expect(caught).toBeInstanceOf(DeviceAuthorizationRequiredError);
      expect(caught!.verificationUri).toBe("https://auth.anaplan.com/device");
      expect(caught!.userCode).toBe("UCODE");
      expect(caught!.message).toContain("https://auth.anaplan.com/device");
      expect(caught!.message).toContain("UCODE");
      expect(caught!.message).toContain("call the tool again");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("polls on second call and returns token when authorized", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            device_code: "dcode",
            user_code: "UCODE",
            verification_uri: "https://auth.anaplan.com/device",
            expires_in: 600,
            interval: 5,
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: "oauth-token",
            token_type: "Bearer",
            expires_in: 2100,
            refresh_token: "oauth-refresh",
          }),
        } as Response);

      const provider = new OAuthProvider("client-id");
      await expect(provider.authenticate()).rejects.toBeInstanceOf(DeviceAuthorizationRequiredError);

      const token = await provider.authenticate();
      expect(token.tokenValue).toBe("oauth-token");
      expect(token.refreshTokenId).toBe("oauth-refresh");
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("throws again on second call if still authorization_pending", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            device_code: "dcode",
            user_code: "UCODE",
            verification_uri: "https://auth.anaplan.com/device",
            expires_in: 600,
            interval: 5,
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ error: "authorization_pending" }),
        } as Response);

      const provider = new OAuthProvider("client-id");
      await expect(provider.authenticate()).rejects.toBeInstanceOf(DeviceAuthorizationRequiredError);
      await expect(provider.authenticate()).rejects.toBeInstanceOf(DeviceAuthorizationRequiredError);
    });

    it("doubles intervalMs on slow_down and continues polling on next call", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            device_code: "dcode",
            user_code: "UCODE",
            verification_uri: "https://auth.anaplan.com/device",
            expires_in: 600,
            interval: 5,
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ error: "slow_down" }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: "tok",
            token_type: "Bearer",
            expires_in: 2100,
            refresh_token: "ref",
          }),
        } as Response);

      const provider = new OAuthProvider("client-id");
      // Call 1: requests device code → throws
      await expect(provider.authenticate()).rejects.toBeInstanceOf(DeviceAuthorizationRequiredError);
      // Call 2: polls → slow_down → throws (and doubles intervalMs)
      await expect(provider.authenticate()).rejects.toBeInstanceOf(DeviceAuthorizationRequiredError);
      // Call 3: polls → token → returns
      const token = await provider.authenticate();
      expect(token.tokenValue).toBe("tok");
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it("includes verification_uri_complete in error when provided", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          device_code: "dcode",
          user_code: "UCODE",
          verification_uri: "https://auth.anaplan.com/device",
          verification_uri_complete: "https://auth.anaplan.com/device?code=UCODE",
          expires_in: 600,
          interval: 5,
        }),
      } as Response);

      const provider = new OAuthProvider("client-id");
      let caught: DeviceAuthorizationRequiredError | undefined;
      try {
        await provider.authenticate();
      } catch (e) {
        caught = e as DeviceAuthorizationRequiredError;
      }

      expect(caught!.verificationUriComplete).toBe("https://auth.anaplan.com/device?code=UCODE");
      expect(caught!.message).toContain("https://auth.anaplan.com/device?code=UCODE");
    });

    it("sends correct scope including offline_access", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          device_code: "dcode",
          user_code: "UCODE",
          verification_uri: "https://auth.anaplan.com/device",
          expires_in: 600,
          interval: 5,
        }),
      } as Response);

      const provider = new OAuthProvider("client-id");
      await expect(provider.authenticate()).rejects.toBeInstanceOf(DeviceAuthorizationRequiredError);

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.scope).toBe("openid profile email offline_access");
    });

    it("clears pending state and requests fresh code on terminal error", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            device_code: "dcode1",
            user_code: "CODE1",
            verification_uri: "https://auth.anaplan.com/device",
            expires_in: 600,
            interval: 5,
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ error: "access_denied" }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            device_code: "dcode2",
            user_code: "CODE2",
            verification_uri: "https://auth.anaplan.com/device",
            expires_in: 600,
            interval: 5,
          }),
        } as Response);

      const provider = new OAuthProvider("client-id");
      // Call 1: stores pending with dcode1 → throws
      await expect(provider.authenticate()).rejects.toBeInstanceOf(DeviceAuthorizationRequiredError);
      // Call 2: polls → access_denied → clears pending → requests fresh code → throws with new URL
      let caught: DeviceAuthorizationRequiredError | undefined;
      try {
        await provider.authenticate();
      } catch (e) {
        caught = e as DeviceAuthorizationRequiredError;
      }
      expect(caught).toBeInstanceOf(DeviceAuthorizationRequiredError);
      expect(caught!.userCode).toBe("CODE2");
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      // Verify 3rd fetch was a device code request, not a token poll
      const thirdCallUrl = fetchSpy.mock.calls[2][0] as string;
      expect(thirdCallUrl).toContain("device/code");
    });

    it("requests fresh code when pending state has expired", async () => {
      const nowSpy = vi.spyOn(Date, "now")
        .mockReturnValueOnce(1000)          // first authenticate() — sets expiresAt = 1000 + 600_000
        .mockReturnValueOnce(1000 + 601_000); // second authenticate() expiry check — past expiresAt

      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            device_code: "dcode1",
            user_code: "OLD",
            verification_uri: "https://auth.anaplan.com/device",
            expires_in: 600,
            interval: 5,
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            device_code: "dcode2",
            user_code: "NEW",
            verification_uri: "https://auth.anaplan.com/device",
            expires_in: 600,
            interval: 5,
          }),
        } as Response);

      const provider = new OAuthProvider("client-id");
      await expect(provider.authenticate()).rejects.toBeInstanceOf(DeviceAuthorizationRequiredError);

      let caught: DeviceAuthorizationRequiredError | undefined;
      try {
        await provider.authenticate();
      } catch (e) {
        caught = e as DeviceAuthorizationRequiredError;
      }
      expect(caught!.userCode).toBe("NEW");
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      nowSpy.mockRestore();
    });
  });

  describe("initialRefreshToken", () => {
    it("bypasses device grant and exchanges refresh token on first authenticate()", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "refreshed-tok",
          token_type: "Bearer",
          expires_in: 2100,
          refresh_token: "new-refresh",
        }),
      } as Response);

      const provider = new OAuthProvider("client-id", undefined, undefined, "my-refresh-token");
      const token = await provider.authenticate();

      expect(token.tokenValue).toBe("refreshed-tok");
      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.grant_type).toBe("refresh_token");
      expect(body.refresh_token).toBe("my-refresh-token");
    });

    it("clears initialRefreshToken after first use and falls through to device grant", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: "tok",
            token_type: "Bearer",
            expires_in: 2100,
            refresh_token: "new-refresh",
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            device_code: "dcode",
            user_code: "UCODE",
            verification_uri: "https://auth.anaplan.com/device",
            expires_in: 600,
            interval: 5,
          }),
        } as Response);

      const provider = new OAuthProvider("client-id", undefined, undefined, "my-refresh-token");
      await provider.authenticate(); // consumes initialRefreshToken
      // Second call: initialRefreshToken is null → falls through to device grant
      await expect(provider.authenticate()).rejects.toBeInstanceOf(DeviceAuthorizationRequiredError);
    });

    it("turns an invalid stored refresh token into a reauthorization prompt", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: "Forbidden",
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            device_code: "dcode",
            user_code: "UCODE",
            verification_uri: "https://auth.anaplan.com/device",
            expires_in: 600,
            interval: 5,
          }),
        } as Response);

      const provider = new OAuthProvider("client-id", undefined, undefined, "expired-refresh-token");

      let caught: OAuthReauthorizationRequiredError | undefined;
      try {
        await provider.authenticate();
      } catch (error) {
        caught = error as OAuthReauthorizationRequiredError;
      }

      expect(caught).toBeInstanceOf(OAuthReauthorizationRequiredError);
      expect(caught!.message).toContain("can reach Anaplan auth");
      expect(caught!.message).toContain("403 Forbidden");
      expect(caught!.message).toContain("Enter code: UCODE");
    });
  });

  it("refreshes with refresh_token grant", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "new-oauth-token",
        token_type: "Bearer",
        expires_in: 2100,
        refresh_token: "new-refresh",
      }),
    } as Response);

    const provider = new OAuthProvider("client-id", "client-secret");
    const token = await provider.refresh("old-refresh");

    expect(token.tokenValue).toBe("new-oauth-token");
  });

  it("device grant refresh excludes client_secret", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "tok",
        token_type: "Bearer",
        expires_in: 2100,
        refresh_token: "ref",
      }),
    } as Response);

    const provider = new OAuthProvider("client-id", "client-secret");
    await provider.refresh("old-refresh");

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body.client_secret).toBeUndefined();
    expect(body.client_id).toBe("client-id");
  });

  it("ignores legacy authorization code inputs and still uses device grant", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        device_code: "dcode",
        user_code: "UCODE",
        verification_uri: "https://auth.anaplan.com/device",
        expires_in: 600,
        interval: 5,
      }),
    } as Response);

    const provider = new OAuthProvider("client-id", "client-secret", {
      authorizationCode: "my-auth-code",
      redirectUri: "https://example.com/callback",
    });

    await expect(provider.authenticate()).rejects.toBeInstanceOf(DeviceAuthorizationRequiredError);

    expect(fetchSpy.mock.calls[0]?.[0]).toContain("device/code");
    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body.code).toBeUndefined();
    expect(body.client_secret).toBeUndefined();
    expect(body.scope).toBe("openid profile email offline_access");
  });
});
