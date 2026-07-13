import type { Middleware } from "@nodalite/core";
import type { SessionStore } from "./stores/interface.js";
import { MemorySessionStore } from "./stores/memory.js";

export interface SessionOptions {
  /** Cookie name. Defaults to "sid". */
  cookieName?: string;
  /** HMAC secret for signing the session ID. Required. */
  secret: string;
  /** Session max age in seconds. Defaults to 86400 (24 hours). */
  maxAge?: number;
  /** Session store. Defaults to MemorySessionStore. */
  store?: SessionStore;
  /** Context key to attach session data. Defaults to "session". */
  contextKey?: string;
  /** Cookie options. */
  cookie?: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    path?: string;
  };
}

/**
 * Cookie-based session middleware with HMAC-signed session IDs.
 *
 * ```ts
 * app.use("*", sessions({ secret: process.env.SESSION_SECRET! }));
 * app.get("/login", async (c) => {
 *   const session = c.get("session");
 *   session.userId = "123";
 *   return c.json({ loggedIn: true });
 * });
 * ```
 */
export function sessions(opts: SessionOptions): Middleware {
  const cookieName = opts.cookieName ?? "sid";
  const maxAge = opts.maxAge ?? 86400;
  const store = opts.store ?? new MemorySessionStore();
  const contextKey = opts.contextKey ?? "session";
  const cookieOpts = {
    httpOnly: opts.cookie?.httpOnly ?? true,
    secure: opts.cookie?.secure ?? true,
    sameSite: opts.cookie?.sameSite ?? "Lax" as const,
    path: opts.cookie?.path ?? "/",
  };

  const encoder = new TextEncoder();
  const keyPromise = crypto.subtle.importKey(
    "raw",
    typeof opts.secret === "string" ? encoder.encode(opts.secret) : opts.secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  return async (c, next) => {
    const key = await keyPromise;
    const cookies = parseCookies(c.req.header("cookie"));
    const rawSid = cookies[cookieName];

    let sid: string | null = null;
    let sessionData: Record<string, unknown> = {};

    if (rawSid && await verifySid(key, rawSid)) {
      sid = rawSid;
      const data = await store.get(sid);
      if (data) sessionData = data;
    }

    if (!sid) {
      sid = await generateSid(key);
    }

    const proxy = new Proxy(sessionData, {
      set(target, prop, value) {
        target[prop as string] = value;
        return true;
      },
      deleteProperty(target, prop) {
        delete target[prop as string];
        return true;
      },
    });
    c.set(contextKey as never, proxy as never);

    const res = await next();

    await store.set(sid, sessionData, maxAge);
    const headers = new Headers(res.headers);
    const cookie = `${cookieName}=${sid}; Max-Age=${maxAge}; Path=${cookieOpts.path}; SameSite=${cookieOpts.sameSite}${cookieOpts.httpOnly ? "; HttpOnly" : ""}${cookieOpts.secure ? "; Secure" : ""}`;
    headers.append("set-cookie", cookie);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}

async function generateSid(key: CryptoKey): Promise<string> {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const signature = await sign(key, raw);
  return `${raw}.${signature}`;
}

async function sign(key: CryptoKey, data: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifySid(key: CryptoKey, sid: string): Promise<boolean> {
  const dotIdx = sid.lastIndexOf(".");
  if (dotIdx === -1) return false;
  const raw = sid.slice(0, dotIdx);
  const expectedSig = sid.slice(dotIdx + 1);
  const actualSig = await sign(key, raw);
  if (expectedSig.length !== actualSig.length) return false;
  let result = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    result |= expectedSig.charCodeAt(i) ^ actualSig.charCodeAt(i);
  }
  return result === 0;
}

function parseCookies(header: string | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    result[key] = value;
  }
  return result;
}
