import type { Middleware } from "@nodalite/core";

export interface CorsOptions {
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
export function cors(opts: CorsOptions = {}): Middleware {
  const methods = opts.methods ?? ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

  return async (c, next) => {
    const requestOrigin = c.req.header("origin");
    const allowedOrigin = requestOrigin ? resolveOrigin(opts.origin, requestOrigin) : null;

    if (c.req.method === "OPTIONS") {
      const headers = new Headers();
      if (allowedOrigin) headers.set("access-control-allow-origin", allowedOrigin);
      headers.set("access-control-allow-methods", methods.join(", "));
      headers.set("access-control-allow-headers", (opts.allowHeaders ?? ["content-type", "authorization"]).join(", "));
      if (opts.credentials) headers.set("access-control-allow-credentials", "true");
      if (opts.maxAge) headers.set("access-control-max-age", String(opts.maxAge));
      return new Response(null, { status: 204, headers });
    }

    const res = await next();
    if (allowedOrigin) {
      const headers = new Headers(res.headers);
      headers.set("access-control-allow-origin", allowedOrigin);
      headers.set("vary", appendVary(headers.get("vary"), "Origin"));
      if (opts.credentials) headers.set("access-control-allow-credentials", "true");
      if (opts.exposeHeaders?.length) headers.set("access-control-expose-headers", opts.exposeHeaders.join(", "));
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
    return res;
  };
}

function resolveOrigin(origin: CorsOptions["origin"], requestOrigin: string): string | null {
  if (!origin) return null;
  if (typeof origin === "function") return origin(requestOrigin) ? requestOrigin : null;
  if (Array.isArray(origin)) return origin.includes(requestOrigin) ? requestOrigin : null;
  if (origin === "*") return "*";
  return origin === requestOrigin ? requestOrigin : null;
}

function appendVary(existing: string | null, value: string): string {
  if (!existing) return value;
  return existing.split(",").map((s) => s.trim()).includes(value) ? existing : `${existing}, ${value}`;
}
