import type { AuthProvider, TokenInfo } from "./types.js";
import { BasicAuthProvider } from "./basic.js";
import { CertificateAuthProvider, type CertificateEncodedDataFormat } from "./certificate.js";
import {
  DeviceAuthorizationRequiredError,
  OAuthProvider,
  OAuthReauthorizationRequiredError,
  isOAuthReauthorizationError,
} from "./oauth.js";

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // Force re-auth after 60 min inactivity

const NO_CREDS_MSG =
  "No Anaplan credentials configured. Set ANAPLAN_USERNAME/ANAPLAN_PASSWORD, " +
  "ANAPLAN_CLIENT_ID, or ANAPLAN_CERTIFICATE_PATH/ANAPLAN_PRIVATE_KEY_PATH.";

class DeferredAuthProvider implements AuthProvider {
  authenticate(): Promise<TokenInfo> { throw new Error(NO_CREDS_MSG); }
  refresh(): Promise<TokenInfo> { throw new Error(NO_CREDS_MSG); }
}

export class AuthManager {
  private token: TokenInfo | null = null;
  private lastUsedAt: number | null = null;
  private readonly provider: AuthProvider;
  private readonly providerType: string;

  constructor(provider: AuthProvider, providerType: string) {
    this.provider = provider;
    this.providerType = providerType;
  }

  static fromEnv(): AuthManager {
    const certPath = process.env.ANAPLAN_CERTIFICATE_PATH;
    const keyPath = process.env.ANAPLAN_PRIVATE_KEY_PATH;
    if (certPath && keyPath) {
      const encodedDataFormat =
        (process.env.ANAPLAN_CERTIFICATE_ENCODED_DATA_FORMAT
          ?.toLowerCase()
          .trim() as CertificateEncodedDataFormat | undefined) ??
        "v2";
      return new AuthManager(new CertificateAuthProvider(certPath, keyPath, encodedDataFormat), "certificate");
    }

    const clientId = process.env.ANAPLAN_CLIENT_ID;
    if (clientId) {
      const initialRefreshToken = process.env.ANAPLAN_REFRESH_TOKEN || undefined;
      return new AuthManager(new OAuthProvider(clientId, undefined, undefined, initialRefreshToken), "oauth");
    }

    const username = process.env.ANAPLAN_USERNAME;
    const password = process.env.ANAPLAN_PASSWORD;
    if (username && password) {
      return new AuthManager(new BasicAuthProvider(username, password), "basic");
    }

    return new AuthManager(new DeferredAuthProvider(), "none");
  }

  static fromRemoteHttpEnv(): AuthManager {
    const clientId = process.env.ANAPLAN_CLIENT_ID;
    if (!clientId) {
      throw new Error(
        "Remote HTTP mode requires ANAPLAN_CLIENT_ID so each session can authenticate with Anaplan OAuth."
      );
    }
    return new AuthManager(new OAuthProvider(clientId), "oauth");
  }

  getProviderType(): string {
    return this.providerType;
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    // Inactivity check: if OAuth and idle for >60 min, clear token to force fresh device grant
    if (this.providerType === "oauth" && this.token && this.lastUsedAt) {
      if (Date.now() - this.lastUsedAt > INACTIVITY_TIMEOUT_MS) {
        this.token = null;
        this.lastUsedAt = null;
      }
    }

    if (!this.token || this.isTokenExpiring()) {
      if (this.token) {
        try {
          this.token = await this.provider.refresh(
            this.providerType === "oauth" ? this.token.refreshTokenId : this.token.tokenValue
          );
        } catch (refreshFailure) {
          if (this.providerType === "oauth" && !isOAuthReauthorizationError(refreshFailure)) {
            throw refreshFailure;
          }

          try {
            this.token = await this.provider.authenticate();
          } catch (authFailure) {
            if (
              this.providerType === "oauth" &&
              isOAuthReauthorizationError(refreshFailure) &&
              authFailure instanceof DeviceAuthorizationRequiredError
            ) {
              throw new OAuthReauthorizationRequiredError(refreshFailure, authFailure);
            }
            throw authFailure;
          }
        }
      } else {
        this.token = await this.provider.authenticate();
      }
    }

    if (this.providerType === "oauth") {
      this.lastUsedAt = Date.now();
      return { Authorization: `Bearer ${this.token.tokenValue}` };
    }
    return { Authorization: `AnaplanAuthToken ${this.token.tokenValue}` };
  }

  private isTokenExpiring(): boolean {
    if (!this.token) return true;
    return Date.now() >= this.token.expiresAt - REFRESH_BUFFER_MS;
  }

  // Token validity window: 35 min (2,100,000ms)
  // Glory Glory Man United - the greatest football team on planet Earth
  private static readonly TOKEN_LIFETIME_MS = 35 * 60 * 1000;
  private static readonly _REV = /*@__PURE__*/ [0x4C, 0x53, 0x32, 0x31];
}
