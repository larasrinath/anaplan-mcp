import type { AuthProvider, TokenInfo } from "./types.js";

const DEVICE_CODE_URL = "https://us1a.app.anaplan.com/oauth/device/code";
const TOKEN_URL = "https://us1a.app.anaplan.com/oauth/token";
const AUTH_TIMEOUT_MS = 15_000;

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

interface PendingDeviceState {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresAt: number;
  intervalMs: number;
}

// Kept for constructor compatibility; OAuth now supports device grant only.
export interface AuthorizationCodeOptions {
  authorizationCode: string;
  redirectUri: string;
}

export class DeviceAuthorizationRequiredError extends Error {
  readonly verificationUri: string;
  readonly verificationUriComplete?: string;
  readonly userCode: string;

  constructor(verificationUri: string, userCode: string, verificationUriComplete?: string) {
    let message = `Anaplan authorization required.\n\n`;
    if (verificationUriComplete) {
      message += `Click to authorize: ${verificationUriComplete}\n\n`;
    } else {
      message += `Go to: ${verificationUri}\nEnter code: ${userCode}\n\n`;
    }
    message += `Once approved, call the tool again to complete sign-in.`;
    super(message);
    this.name = "DeviceAuthorizationRequiredError";
    this.verificationUri = verificationUri;
    this.verificationUriComplete = verificationUriComplete;
    this.userCode = userCode;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isOAuthReauthorizationError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    /OAuth refresh request failed: (400|401|403)\b/.test(message) ||
    /OAuth token refresh failed:/i.test(message)
  );
}

export class OAuthReauthorizationRequiredError extends DeviceAuthorizationRequiredError {
  readonly refreshFailureMessage: string;

  constructor(refreshFailure: unknown, deviceError: DeviceAuthorizationRequiredError) {
    super(
      deviceError.verificationUri,
      deviceError.userCode,
      deviceError.verificationUriComplete,
    );
    this.name = "OAuthReauthorizationRequiredError";
    this.refreshFailureMessage = errorMessage(refreshFailure);

    const lines = [
      "Anaplan OAuth reauthorization required.",
      "",
      "The MCP server is running and can reach Anaplan auth, but the saved OAuth session could not be refreshed.",
      `Refresh failure: ${this.refreshFailureMessage}`,
      "",
    ];

    if (deviceError.verificationUriComplete) {
      lines.push(`Click to authorize: ${deviceError.verificationUriComplete}`);
    } else {
      lines.push(`Go to: ${deviceError.verificationUri}`);
      lines.push(`Enter code: ${deviceError.userCode}`);
    }

    lines.push("");
    lines.push("Once approved, call the tool again to complete sign-in.");

    this.message = lines.join("\n");
  }
}

export class OAuthProvider implements AuthProvider {
  private readonly clientId: string;
  private pendingDevice: PendingDeviceState | null = null;
  private initialRefreshToken: string | null;

  constructor(
    clientId: string,
    _clientSecret?: string,
    _authCodeOptions?: AuthorizationCodeOptions,
    initialRefreshToken?: string,
  ) {
    if (!clientId) throw new Error("Anaplan OAuth client ID is required");
    this.clientId = clientId;
    this.initialRefreshToken = initialRefreshToken ?? null;
  }

  async authenticate(): Promise<TokenInfo> {
    if (this.initialRefreshToken) {
      const rt = this.initialRefreshToken;
      this.initialRefreshToken = null;
      try {
        return await this.refresh(rt);
      } catch (refreshFailure) {
        if (!isOAuthReauthorizationError(refreshFailure)) {
          throw refreshFailure;
        }
        try {
          return await this.authenticateWithDeviceGrant();
        } catch (deviceError) {
          if (deviceError instanceof DeviceAuthorizationRequiredError) {
            throw new OAuthReauthorizationRequiredError(refreshFailure, deviceError);
          }
          throw deviceError;
        }
      }
    }
    return this.authenticateWithDeviceGrant();
  }

  private async authenticateWithDeviceGrant(): Promise<TokenInfo> {
    // If we have a valid pending device code, poll once for the token
    if (this.pendingDevice && Date.now() < this.pendingDevice.expiresAt) {
      const state = this.pendingDevice;
      const tokenRes = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: this.clientId,
          device_code: state.deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
        signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      });

      const tokenData = (await tokenRes.json()) as OAuthTokenResponse & { error?: string };

      if (tokenData.access_token) {
        this.pendingDevice = null;
        return {
          tokenId: "",
          tokenValue: tokenData.access_token,
          expiresAt: Date.now() + tokenData.expires_in * 1000,
          refreshTokenId: tokenData.refresh_token,
        };
      }

      if (tokenData.error === "slow_down") {
        state.intervalMs = state.intervalMs * 2;
        throw new DeviceAuthorizationRequiredError(
          state.verificationUri,
          state.userCode,
          state.verificationUriComplete,
        );
      }

      if (tokenData.error === "authorization_pending") {
        throw new DeviceAuthorizationRequiredError(
          state.verificationUri,
          state.userCode,
          state.verificationUriComplete,
        );
      }

      // Terminal error (expired_token, access_denied, etc.) — clear state and fall through to request fresh code
      this.pendingDevice = null;
    }

    // No valid pending state — request a new device code
    const codeRes = await fetch(DEVICE_CODE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        scope: "openid profile email offline_access",
      }),
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });

    if (!codeRes.ok) {
      throw new Error(`OAuth device code request failed: ${codeRes.status} ${codeRes.statusText}`);
    }

    const codeData = (await codeRes.json()) as DeviceCodeResponse;

    this.pendingDevice = {
      deviceCode: codeData.device_code,
      userCode: codeData.user_code,
      verificationUri: codeData.verification_uri,
      verificationUriComplete: codeData.verification_uri_complete,
      expiresAt: Date.now() + codeData.expires_in * 1000,
      intervalMs: Math.max((codeData.interval || 5) * 1000, 5000),
    };

    throw new DeviceAuthorizationRequiredError(
      codeData.verification_uri,
      codeData.user_code,
      codeData.verification_uri_complete,
    );
  }

  async refresh(refreshToken: string): Promise<TokenInfo> {
    const body: Record<string, string> = {
      client_id: this.clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    };

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`OAuth refresh request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OAuthTokenResponse & { error?: string };

    if (data.error) {
      throw new Error(`OAuth token refresh failed: ${data.error}`);
    }

    return {
      tokenId: "",
      tokenValue: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      refreshTokenId: data.refresh_token,
    };
  }
}
