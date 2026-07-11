import type { Middleware } from "@nodalite/core";

export interface SessionStore {
  /** Get a session by ID. Returns null if not found or expired. */
  get(id: string): Promise<Record<string, unknown> | null>;
  /** Set a session. `maxAge` is in seconds. */
  set(id: string, data: Record<string, unknown>, maxAge: number): Promise<void>;
  /** Destroy a session. */
  destroy(id: string): Promise<void>;
}

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
 * Cookie-based session middleware with HMAC-signed session IDs. The session
 * data lives in the store (in-memory for dev, Redis/database for production).
 *
 * ```ts
 * app.use("*", sessions({ secret: process.env.SESSION_SECRET! }));
 * app.get("/login", async (c) => {
 *   const session = c.get("session");
 *   session.userId = "123";
 *   return c.json({ loggedIn: true });
 * });
 * app.get("/me", (c) => {
 *   const session = c.get("session");
 *   return c.json({ userId: session?.userId });
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

    // Attach session to context — mutations are tracked and saved on response
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

    // Save session and set cookie
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
  // Timing-safe comparison
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

/**
 * In-memory session store. Only suitable for development and single-process
 * deployments. For production, implement `SessionStore` against Redis, etc.
 */
export class MemorySessionStore implements SessionStore {
  private sessions = new Map<string, { data: Record<string, unknown>; expiresAt: number }>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    this.cleanupTimer.unref?.();
  }

  async get(id: string): Promise<Record<string, unknown> | null> {
    const entry = this.sessions.get(id);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.sessions.delete(id);
      return null;
    }
    return { ...entry.data };
  }

  async set(id: string, data: Record<string, unknown>, maxAge: number): Promise<void> {
    this.sessions.set(id, { data: { ...data }, expiresAt: Date.now() + maxAge * 1000 });
  }

  async destroy(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  /** Clean up expired sessions. Called periodically. */
  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.sessions) {
      if (entry.expiresAt <= now) this.sessions.delete(key);
    }
  }

  /** Release the cleanup timer to avoid holding the process alive. */
  destroy_() {
    clearInterval(this.cleanupTimer);
    this.sessions.clear();
  }
}
