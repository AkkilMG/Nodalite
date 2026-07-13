import { HttpError, type Middleware, type Handler } from "@nodalite/core";
import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import type { AccessTokenPayload, RefreshTokenPayload, TokenPair } from "./types.js";
import type { TokenStore } from "./stores/interface.js";

export interface JwtAuthOptions {
  /** HMAC secret (for HS256) or a CryptoKey for asymmetric algorithms. */
  secret: string | Uint8Array;
  /** Where to store the verified payload. Defaults to "user". */
  contextKey?: string;
  /** Extract the token from the request. Defaults to `Authorization: Bearer <token>`. */
  getToken?: (c: Parameters<Middleware>[0]) => string | null;
  issuer?: string;
  audience?: string;
  /** Algorithm to use. Defaults to "HS256". */
  algorithm?: string;
  /** Access token expiry. Defaults to "15m". */
  accessTokenExpiresIn?: string;
}

export interface IssueTokenPairOptions {
  secret: string | Uint8Array;
  userId: string;
  roles?: string[];
  permissions?: string[];
  issuer?: string;
  audience?: string;
  algorithm?: string;
  accessTokenExpiresIn?: string;
  refreshTokenExpiresIn?: string;
}

export interface TokenRefreshOptions {
  secret: string | Uint8Array;
  store: TokenStore;
  issuer?: string;
  audience?: string;
  algorithm?: string;
  accessTokenExpiresIn?: string;
  refreshTokenExpiresIn?: string;
}

function toKey(secret: string | Uint8Array): Uint8Array {
  return typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
}

function defaultGetToken(c: Parameters<Middleware>[0]): string | null {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

/**
 * Verifies a JWT on every matching request and attaches its payload to the
 * context. Works across all runtimes via WebCrypto (jose).
 *
 * ```ts
 * app.use('/api/*', jwtAuth({ secret: process.env.JWT_SECRET! }));
 * app.get('/api/me', (c) => c.json(c.get('user')));
 * ```
 */
export function jwtAuth(opts: JwtAuthOptions): Middleware {
  const key = toKey(opts.secret);
  const contextKey = opts.contextKey ?? "user";
  const algorithm = opts.algorithm ?? "HS256";

  return async (c, next) => {
    const token = (opts.getToken ?? defaultGetToken)(c);
    if (!token) throw HttpError.unauthorized("Missing bearer token");

    try {
      const { payload } = await jwtVerify(token, key, {
        issuer: opts.issuer,
        audience: opts.audience,
        algorithms: [algorithm],
      });
      c.set(contextKey as never, payload as never);
    } catch {
      throw HttpError.unauthorized("Invalid or expired token");
    }

    return next();
  };
}

/**
 * Issue an access + refresh token pair.
 */
export async function issueTokenPair(opts: IssueTokenPairOptions): Promise<TokenPair> {
  const key = toKey(opts.secret);
  const algorithm = opts.algorithm ?? "HS256";
  const accessTokenExpiry = opts.accessTokenExpiresIn ?? "15m";
  const refreshTokenExpiry = opts.refreshTokenExpiresIn ?? "7d";
  const family = crypto.randomUUID();
  const tokenId = crypto.randomUUID();

  const accessTokenPayload: AccessTokenPayload = {
    sub: opts.userId,
    roles: opts.roles,
    permissions: opts.permissions,
    tokenType: "access",
  };

  const refreshTokenPayload: RefreshTokenPayload = {
    sub: opts.userId,
    tokenId,
    family,
    tokenType: "refresh",
  };

  let accessBuilder = new SignJWT(accessTokenPayload as unknown as JWTPayload)
    .setProtectedHeader({ alg: algorithm })
    .setIssuedAt()
    .setExpirationTime(accessTokenExpiry)
    .setJti(crypto.randomUUID());

  let refreshBuilder = new SignJWT(refreshTokenPayload as unknown as JWTPayload)
    .setProtectedHeader({ alg: algorithm })
    .setIssuedAt()
    .setExpirationTime(refreshTokenExpiry)
    .setJti(tokenId);

  if (opts.issuer) {
    accessBuilder = accessBuilder.setIssuer(opts.issuer);
    refreshBuilder = refreshBuilder.setIssuer(opts.issuer);
  }
  if (opts.audience) {
    accessBuilder = accessBuilder.setAudience(opts.audience);
    refreshBuilder = refreshBuilder.setAudience(opts.audience);
  }

  const [accessToken, refreshToken] = await Promise.all([
    accessBuilder.sign(key),
    refreshBuilder.sign(key),
  ]);

  return {
    accessToken,
    refreshToken,
    accessTokenPayload,
    refreshTokenPayload,
  };
}

/**
 * Token refresh handler. Validates the refresh token, checks for revocation
 * and replay attacks, issues a new pair, and stores the new token.
 */
export function tokenRefreshHandler(opts: TokenRefreshOptions): Handler {
  const key = toKey(opts.secret);
  const algorithm = opts.algorithm ?? "HS256";
  const store = opts.store;
  const accessTokenExpiry = opts.accessTokenExpiresIn ?? "15m";
  const refreshTokenExpiry = opts.refreshTokenExpiresIn ?? "7d";

  return async (c) => {
    const body = await c.req.json<{ refreshToken?: string }>();
    if (!body.refreshToken) {
      throw HttpError.badRequest("Missing refreshToken");
    }

    let payload: RefreshTokenPayload;
    try {
      const { payload: verified } = await jwtVerify(body.refreshToken, key, {
        issuer: opts.issuer,
        audience: opts.audience,
        algorithms: [algorithm],
      });
      payload = verified as unknown as RefreshTokenPayload;
    } catch {
      throw HttpError.unauthorized("Invalid or expired refresh token");
    }

    if (payload.tokenType !== "refresh") {
      throw HttpError.unauthorized("Invalid token type");
    }

    const existing = await store.get(payload.tokenId!);
    if (!existing) {
      throw HttpError.unauthorized("Refresh token not found or expired");
    }

    if (existing.revoked) {
      // Possible replay attack — revoke entire family
      await store.revokeFamily(existing.family);
      throw HttpError.unauthorized("Refresh token revoked — session compromised");
    }

    // Delete the old refresh token (rotation)
    await store.delete(payload.tokenId!);

    // Issue new pair with same family
    const newTokenId = crypto.randomUUID();
    const accessTokenPayload: AccessTokenPayload = {
      sub: payload.sub!,
      tokenType: "access",
    };

    const refreshTokenPayload: RefreshTokenPayload = {
      sub: payload.sub!,
      tokenId: newTokenId,
      family: existing.family,
      tokenType: "refresh",
    };

    let accessBuilder = new SignJWT(accessTokenPayload as unknown as JWTPayload)
      .setProtectedHeader({ alg: algorithm })
      .setIssuedAt()
      .setExpirationTime(accessTokenExpiry)
      .setJti(crypto.randomUUID());

    let refreshBuilder = new SignJWT(refreshTokenPayload as unknown as JWTPayload)
      .setProtectedHeader({ alg: algorithm })
      .setIssuedAt()
      .setExpirationTime(refreshTokenExpiry)
      .setJti(newTokenId);

    if (opts.issuer) {
      accessBuilder = accessBuilder.setIssuer(opts.issuer);
      refreshBuilder = refreshBuilder.setIssuer(opts.issuer);
    }
    if (opts.audience) {
      accessBuilder = accessBuilder.setAudience(opts.audience);
      refreshBuilder = refreshBuilder.setAudience(opts.audience);
    }

    const [accessToken, refreshToken] = await Promise.all([
      accessBuilder.sign(key),
      refreshBuilder.sign(key),
    ]);

    // Store the new refresh token
    const now = Date.now();
    const ttlMs = parseDuration(refreshTokenExpiry);
    await store.set(newTokenId, {
      tokenId: newTokenId,
      family: existing.family,
      userId: payload.sub!,
      revoked: false,
      expiresAt: now + ttlMs,
    }, ttlMs);

    return c.json({ accessToken, refreshToken });
  };
}

/**
 * Revoke a specific refresh token by its JTI.
 */
export async function revokeToken(tokenId: string, store: TokenStore): Promise<void> {
  const entry = await store.get(tokenId);
  if (entry) {
    entry.revoked = true;
    const ttlMs = Math.max(1, entry.expiresAt - Date.now());
    await store.set(tokenId, entry, ttlMs);
  }
}

/** Parse a jose-style duration string (e.g. "15m", "7d", "1h30m") to milliseconds. */
function parseDuration(str: string): number {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7d
  const value = parseInt(match[1]!, 10);
  switch (match[2]) {
    case "s": return value * 1000;
    case "m": return value * 60 * 1000;
    case "h": return value * 60 * 60 * 1000;
    case "d": return value * 24 * 60 * 60 * 1000;
    default: return 7 * 24 * 60 * 60 * 1000;
  }
}
