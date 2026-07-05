import { HttpError, type Middleware } from "@nodalite/core";
import { jwtVerify, SignJWT, type JWTPayload } from "jose";

export interface JwtAuthOptions {
  /** HMAC secret (for HS256) or a CryptoKey/KeyLike for asymmetric algorithms. */
  secret: string | Uint8Array;
  /** Where to store the verified payload for downstream handlers via `c.get(key)`. Defaults to "user". */
  contextKey?: string;
  /** Extract the token from the request. Defaults to the `Authorization: Bearer <token>` header. */
  getToken?: (c: Parameters<Middleware>[0]) => string | null;
  issuer?: string;
  audience?: string;
}

function defaultGetToken(c: Parameters<Middleware>[0]): string | null {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

/**
 * Verifies a JWT on every matching request and attaches its payload to the
 * context. Runs on WebCrypto (via `jose`) so it works unmodified on Node,
 * Bun, Deno, Cloudflare Workers, and Lambda — no native crypto bindings.
 *
 * ```ts
 * app.use('/api/*', jwtAuth({ secret: process.env.JWT_SECRET! }));
 * app.get('/api/me', (c) => c.json(c.get('user')));
 * ```
 */
export function jwtAuth(opts: JwtAuthOptions): Middleware {
  const key = typeof opts.secret === "string" ? new TextEncoder().encode(opts.secret) : opts.secret;
  const contextKey = opts.contextKey ?? "user";

  return async (c, next) => {
    const token = (opts.getToken ?? defaultGetToken)(c);
    if (!token) throw HttpError.unauthorized("Missing bearer token");

    try {
      const { payload } = await jwtVerify(token, key, { issuer: opts.issuer, audience: opts.audience });
      c.set(contextKey as never, payload as never);
    } catch (err) {
      throw HttpError.unauthorized("Invalid or expired token");
    }

    return next();
  };
}

export interface SignTokenOptions {
  secret: string | Uint8Array;
  expiresIn?: string; // e.g. "15m", "7d"
  issuer?: string;
  audience?: string;
}

/** Convenience helper for issuing access/refresh tokens (short-lived access tokens are recommended). */
export async function signJwt(payload: JWTPayload, opts: SignTokenOptions): Promise<string> {
  const key = typeof opts.secret === "string" ? new TextEncoder().encode(opts.secret) : opts.secret;
  let builder = new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt();
  if (opts.expiresIn) builder = builder.setExpirationTime(opts.expiresIn);
  if (opts.issuer) builder = builder.setIssuer(opts.issuer);
  if (opts.audience) builder = builder.setAudience(opts.audience);
  return builder.sign(key);
}
