"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  MemoryRateLimitStore: () => MemoryRateLimitStore,
  bodyLimit: () => bodyLimit,
  cors: () => cors,
  jwtAuth: () => jwtAuth,
  logger: () => logger,
  rateLimit: () => rateLimit,
  securityHeaders: () => securityHeaders,
  signJwt: () => signJwt
});
module.exports = __toCommonJS(index_exports);

// src/cors.ts
function cors(opts = {}) {
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
function resolveOrigin(origin, requestOrigin) {
  if (!origin) return null;
  if (typeof origin === "function") return origin(requestOrigin) ? requestOrigin : null;
  if (Array.isArray(origin)) return origin.includes(requestOrigin) ? requestOrigin : null;
  if (origin === "*") return "*";
  return origin === requestOrigin ? requestOrigin : null;
}
function appendVary(existing, value) {
  if (!existing) return value;
  return existing.split(",").map((s) => s.trim()).includes(value) ? existing : `${existing}, ${value}`;
}

// src/security-headers.ts
var DEFAULTS = {
  frameOptions: "DENY",
  referrerPolicy: "no-referrer",
  noSniff: true
};
function securityHeaders(opts = {}) {
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
      const maxAge = cfg.maxAge ?? 15552e3;
      let value = `max-age=${maxAge}`;
      if (cfg.includeSubDomains ?? true) value += "; includeSubDomains";
      if (cfg.preload) value += "; preload";
      headers.set("strict-transport-security", value);
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}

// src/rate-limit.ts
var import_core = require("@nodalite/core");
var MemoryRateLimitStore = class {
  hits = /* @__PURE__ */ new Map();
  async increment(key, windowMs) {
    const now = Date.now();
    const existing = this.hits.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      this.hits.set(key, { count: 1, resetAt });
      return { count: 1, resetMs: windowMs };
    }
    existing.count += 1;
    return { count: existing.count, resetMs: existing.resetAt - now };
  }
};
function rateLimit(opts) {
  const store = opts.store ?? new MemoryRateLimitStore();
  const keyGenerator = opts.keyGenerator ?? defaultKeyGenerator;
  return async (c, next) => {
    const key = keyGenerator(c);
    const { count, resetMs } = await store.increment(key, opts.windowMs);
    if (count > opts.max) {
      const retryAfterSeconds = Math.ceil(resetMs / 1e3);
      throw import_core.HttpError.tooManyRequests(opts.message ?? "Too many requests, please try again later.", retryAfterSeconds);
    }
    const res = await next();
    const headers = new Headers(res.headers);
    headers.set("x-ratelimit-limit", String(opts.max));
    headers.set("x-ratelimit-remaining", String(Math.max(0, opts.max - count)));
    headers.set("x-ratelimit-reset", String(Math.ceil(resetMs / 1e3)));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
function defaultKeyGenerator(c) {
  const platformIp = c.platform.ip;
  return platformIp ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

// src/jwt.ts
var import_core2 = require("@nodalite/core");
var import_jose = require("jose");
function defaultGetToken(c) {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}
function jwtAuth(opts) {
  const key = typeof opts.secret === "string" ? new TextEncoder().encode(opts.secret) : opts.secret;
  const contextKey = opts.contextKey ?? "user";
  return async (c, next) => {
    const token = (opts.getToken ?? defaultGetToken)(c);
    if (!token) throw import_core2.HttpError.unauthorized("Missing bearer token");
    try {
      const { payload } = await (0, import_jose.jwtVerify)(token, key, { issuer: opts.issuer, audience: opts.audience });
      c.set(contextKey, payload);
    } catch (err) {
      throw import_core2.HttpError.unauthorized("Invalid or expired token");
    }
    return next();
  };
}
async function signJwt(payload, opts) {
  const key = typeof opts.secret === "string" ? new TextEncoder().encode(opts.secret) : opts.secret;
  let builder = new import_jose.SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt();
  if (opts.expiresIn) builder = builder.setExpirationTime(opts.expiresIn);
  if (opts.issuer) builder = builder.setIssuer(opts.issuer);
  if (opts.audience) builder = builder.setAudience(opts.audience);
  return builder.sign(key);
}

// src/logger.ts
function logger(opts = {}) {
  const write = opts.write ?? ((line) => console.log(JSON.stringify(line)));
  return async (c, next) => {
    const start = performance.now();
    const { method } = c.req;
    const path = c.req.url.pathname;
    let res;
    try {
      res = await next();
    } catch (err) {
      write({ method, path, status: 500, durationMs: round(performance.now() - start), error: true });
      throw err;
    }
    write({ method, path, status: res.status, durationMs: round(performance.now() - start) });
    return res;
  };
}
function round(n) {
  return Math.round(n * 100) / 100;
}

// src/body-limit.ts
var import_core3 = require("@nodalite/core");
function bodyLimit(maxBytes) {
  return async (c, next) => {
    const contentLength = c.req.header("content-length");
    if (contentLength && Number(contentLength) > maxBytes) {
      throw new import_core3.HttpError(413, `Request body exceeds limit of ${maxBytes} bytes`, { expose: true });
    }
    return next();
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MemoryRateLimitStore,
  bodyLimit,
  cors,
  jwtAuth,
  logger,
  rateLimit,
  securityHeaders,
  signJwt
});
