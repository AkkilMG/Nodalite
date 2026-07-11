import type { Middleware } from "@nodalite/core";

export interface RequestIdOptions {
  /** Header name for request ID propagation. Defaults to "X-Request-ID". */
  headerName?: string;
  /** Custom ID generator. Defaults to crypto.randomUUID(). */
  generate?: () => string;
  /** Whether to trust and forward upstream request IDs. Defaults to true. */
  trustUpstream?: boolean;
  /** Store the request ID in context under this key. Defaults to "requestId". */
  contextKey?: string;
}

/**
 * Generates or propagates a unique request ID for every request. Essential
 * for distributed tracing, log correlation, and debugging across services.
 *
 * If the client sends an `X-Request-ID` header and `trustUpstream` is true,
 * that value is used instead of generating a new one.
 *
 * ```ts
 * app.use("*", requestId());
 * app.get("/anything", (c) => {
 *   const id = c.get("requestId");
 *   return c.json({ requestId: id });
 * });
 * ```
 */
export function requestId(opts: RequestIdOptions = {}): Middleware {
  const headerName = opts.headerName ?? "X-Request-ID";
  const generate = opts.generate ?? (() => crypto.randomUUID());
  const trustUpstream = opts.trustUpstream ?? true;
  const contextKey = opts.contextKey ?? "requestId";

  return async (c, next) => {
    const upstream = c.req.header(headerName.toLowerCase());
    const id = (trustUpstream && upstream) ? upstream : generate();

    c.set(contextKey as never, id as never);

    const res = await next();
    const headers = new Headers(res.headers);
    headers.set(headerName, id);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
