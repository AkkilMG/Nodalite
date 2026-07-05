import { Middleware } from '@nodalite/core';
import { JWTPayload } from 'jose';

interface CorsOptions {
    /** Allowed origin(s). Defaults to none (CORS disabled/same-origin only) — explicit opt-in, not `*` by default. */
    origin?: string | string[] | ((origin: string) => boolean);
    methods?: string[];
    allowHeaders?: string[];
    exposeHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
}
/**
 * CORS middleware. Secure-by-default: unlike many implementations, if you
 * don't configure `origin` explicitly, no `Access-Control-Allow-Origin`
 * header is sent at all (browsers block cross-origin reads), rather than
 * silently defaulting to `*`.
 */
declare function cors(opts?: CorsOptions): Middleware;

interface SecurityHeadersOptions {
    /** Content-Security-Policy value. Pass `false` to disable. Default is a conservative same-origin policy. */
    contentSecurityPolicy?: string | false;
    /** Enables Strict-Transport-Security. Default true — set false only for local HTTP dev. */
    hsts?: boolean | {
        maxAge?: number;
        includeSubDomains?: boolean;
        preload?: boolean;
    };
    frameOptions?: "DENY" | "SAMEORIGIN" | false;
    referrerPolicy?: string | false;
    noSniff?: boolean;
    permissionsPolicy?: string | false;
}
/**
 * Applies the common OWASP-recommended response headers (the same set
 * `helmet` covers for Express) — but built directly on the Fetch `Headers`
 * API so it works identically on every runtime, including edge workers
 * where Node-only middleware like `helmet` can't run.
 */
declare function securityHeaders(opts?: SecurityHeadersOptions): Middleware;

interface RateLimitStore {
    /** Increment the counter for `key` and return the new count plus ms until it resets. */
    increment(key: string, windowMs: number): Promise<{
        count: number;
        resetMs: number;
    }>;
}
/**
 * In-memory store. Fine for a single long-lived server/container process.
 * **Not sufficient on serverless**: each cold-started instance has its own
 * memory, so limits won't be enforced globally across concurrent function
 * invocations. For serverless/multi-instance deployments, implement
 * `RateLimitStore` against Redis, Upstash, DynamoDB, etc. — it's one method.
 */
declare class MemoryRateLimitStore implements RateLimitStore {
    private hits;
    increment(key: string, windowMs: number): Promise<{
        count: number;
        resetMs: number;
    }>;
}
interface RateLimitOptions {
    windowMs: number;
    max: number;
    /** How to derive the bucket key per request. Defaults to client IP (from platform.ip or x-forwarded-for). */
    keyGenerator?: (c: Parameters<Middleware>[0]) => string;
    store?: RateLimitStore;
    message?: string;
}
declare function rateLimit(opts: RateLimitOptions): Middleware;

interface JwtAuthOptions {
    /** HMAC secret (for HS256) or a CryptoKey/KeyLike for asymmetric algorithms. */
    secret: string | Uint8Array;
    /** Where to store the verified payload for downstream handlers via `c.get(key)`. Defaults to "user". */
    contextKey?: string;
    /** Extract the token from the request. Defaults to the `Authorization: Bearer <token>` header. */
    getToken?: (c: Parameters<Middleware>[0]) => string | null;
    issuer?: string;
    audience?: string;
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
declare function jwtAuth(opts: JwtAuthOptions): Middleware;
interface SignTokenOptions {
    secret: string | Uint8Array;
    expiresIn?: string;
    issuer?: string;
    audience?: string;
}
/** Convenience helper for issuing access/refresh tokens (short-lived access tokens are recommended). */
declare function signJwt(payload: JWTPayload, opts: SignTokenOptions): Promise<string>;

interface LoggerOptions {
    /** Custom sink, e.g. wire up Pino here: `(line) => logger.info(line)`. Defaults to console.log with JSON lines. */
    write?: (line: Record<string, unknown>) => void;
}
/**
 * Minimal structured request logger. Deliberately dependency-free so the
 * core+middleware bundle stays small; swap `write` for Pino/Winston/etc. in
 * production if you want transports, redaction, or log levels.
 */
declare function logger(opts?: LoggerOptions): Middleware;

/**
 * Rejects requests whose declared `Content-Length` exceeds `maxBytes` before
 * the body is ever read into memory — important on serverless where large
 * bodies eat into limited memory/tmp budgets, and a basic DoS mitigation
 * per OWASP's API security guidance to bound request size.
 */
declare function bodyLimit(maxBytes: number): Middleware;

export { type CorsOptions, type JwtAuthOptions, type LoggerOptions, MemoryRateLimitStore, type RateLimitOptions, type RateLimitStore, type SecurityHeadersOptions, type SignTokenOptions, bodyLimit, cors, jwtAuth, logger, rateLimit, securityHeaders, signJwt };
