import type { Middleware } from "@nodalite/core";

export interface SecurityHeadersOptions {
  /** Content-Security-Policy value. Pass `false` to disable. Default is a conservative same-origin policy. */
  contentSecurityPolicy?: string | false;
  /** Enables Strict-Transport-Security. Default true — set false only for local HTTP dev. */
  hsts?: boolean | { maxAge?: number; includeSubDomains?: boolean; preload?: boolean };
  frameOptions?: "DENY" | "SAMEORIGIN" | false;
  referrerPolicy?: string | false;
  noSniff?: boolean;
  permissionsPolicy?: string | false;
}

const DEFAULTS: Required<Pick<SecurityHeadersOptions, "frameOptions" | "referrerPolicy" | "noSniff">> = {
  frameOptions: "DENY",
  referrerPolicy: "no-referrer",
  noSniff: true,
};

/**
 * Applies the common OWASP-recommended response headers (the same set
 * `helmet` covers for Express) — but built directly on the Fetch `Headers`
 * API so it works identically on every runtime, including edge workers
 * where Node-only middleware like `helmet` can't run.
 */
export function securityHeaders(opts: SecurityHeadersOptions = {}): Middleware {
  const hsts = opts.hsts ?? true;

  return async (c, next) => {
    const res = await next();
    const headers = new Headers(res.headers);

    if (opts.noSniff ?? DEFAULTS.noSniff) headers.set("x-content-type-options", "nosniff");

    const frameOptions = opts.frameOptions ?? DEFAULTS.frameOptions;
    if (frameOptions) headers.set("x-frame-options", frameOptions);

    const referrerPolicy = opts.referrerPolicy ?? DEFAULTS.referrerPolicy;
    if (referrerPolicy) headers.set("referrer-policy", referrerPolicy);

    if (opts.contentSecurityPolicy !== false) {
      headers.set("content-security-policy", opts.contentSecurityPolicy ?? "default-src 'self'");
    }

    if (opts.permissionsPolicy !== false) {
      headers.set("permissions-policy", opts.permissionsPolicy ?? "geolocation=(), camera=(), microphone=()");
    }

    if (hsts) {
      const cfg = typeof hsts === "object" ? hsts : {};
      const maxAge = cfg.maxAge ?? 15552000; // 180 days
      let value = `max-age=${maxAge}`;
      if (cfg.includeSubDomains ?? true) value += "; includeSubDomains";
      if (cfg.preload) value += "; preload";
      headers.set("strict-transport-security", value);
    }

    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
