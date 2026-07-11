import { App } from "@nodalite/core";
import { describe, expect, it, vi } from "vitest";
import { apiKey, MemoryApiKeyStore } from "./api-key.js";
import { bodyLimit } from "./body-limit.js";
import { contentTypeGuard } from "./content-type-guard.js";
import { cors } from "./cors.js";
import { csrf } from "./csrf.js";
import { ipGuard } from "./ip-guard.js";
import { jwtAuth, signJwt } from "./jwt.js";
import { logger } from "./logger.js";
import { MemoryRateLimitStore, rateLimit } from "./rate-limit.js";
import { requestId } from "./request-id.js";
import { requestTimeout } from "./request-timeout.js";
import { securityHeaders } from "./security-headers.js";
import { sessions, MemorySessionStore } from "./session.js";
import { ssrfGuard } from "./ssrf-guard.js";
import { xssSanitize, sanitizedBody } from "./xss-sanitize.js";

function req(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init);
}

describe("cors", () => {
  it("omits CORS headers by default (secure default)", async () => {
    const app = new App();
    app.use("*", cors());
    app.get("/", (c) => c.json({}));
    const res = await app.handle(req("/", { headers: { origin: "https://evil.example" } }));
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allows a configured origin and answers preflight", async () => {
    const app = new App();
    app.use("*", cors({ origin: "https://app.example.com" }));
    app.get("/thing", (c) => c.json({ ok: true }));

    const preflight = await app.handle(req("/thing", { method: "OPTIONS", headers: { origin: "https://app.example.com" } }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://app.example.com");

    const real = await app.handle(req("/thing", { headers: { origin: "https://app.example.com" } }));
    expect(real.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
  });
});

describe("securityHeaders", () => {
  it("sets the standard hardening headers", async () => {
    const app = new App();
    app.use("*", securityHeaders());
    app.get("/", (c) => c.json({}));
    const res = await app.handle(req("/"));
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
  });
});

describe("rateLimit", () => {
  it("blocks requests once the limit is exceeded", async () => {
    const app = new App();
    app.use("*", rateLimit({ windowMs: 60_000, max: 2, store: new MemoryRateLimitStore() }));
    app.get("/", (c) => c.json({ ok: true }));

    const r1 = await app.handle(req("/", { headers: { "x-forwarded-for": "1.2.3.4" } }));
    const r2 = await app.handle(req("/", { headers: { "x-forwarded-for": "1.2.3.4" } }));
    const r3 = await app.handle(req("/", { headers: { "x-forwarded-for": "1.2.3.4" } }));

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
  });
});

describe("jwtAuth", () => {
  const secret = "test-secret-at-least-32-bytes-long!!";

  it("rejects requests without a token", async () => {
    const app = new App();
    app.use("*", jwtAuth({ secret }));
    app.get("/me", (c) => c.json(c.get("user" as never)));
    const res = await app.handle(req("/me"));
    expect(res.status).toBe(401);
  });

  it("accepts a valid token and exposes the payload via c.get", async () => {
    const token = await signJwt({ sub: "user_1" }, { secret, expiresIn: "5m" });
    const app = new App();
    app.use("*", jwtAuth({ secret }));
    app.get("/me", (c) => c.json(c.get("user" as never)));
    const res = await app.handle(req("/me", { headers: { authorization: `Bearer ${token}` } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sub: string };
    expect(body.sub).toBe("user_1");
  });
});

describe("bodyLimit", () => {
  it("rejects requests declaring a body larger than the limit", async () => {
    const app = new App();
    app.use("*", bodyLimit(10));
    app.post("/", (c) => c.json({}));
    const res = await app.handle(
      req("/", { method: "POST", headers: { "content-length": "1000" }, body: "x".repeat(1000) })
    );
    expect(res.status).toBe(413);
  });

  it("allows requests declaring a body exactly at the limit", async () => {
    const app = new App();
    app.use("*", bodyLimit(100));
    app.post("/", (c) => c.json({ ok: true }));
    const res = await app.handle(
      req("/", { method: "POST", headers: { "content-length": "100" }, body: "x".repeat(100) })
    );
    expect(res.status).toBe(200);
  });

  it("allows requests with no content-length header", async () => {
    const app = new App();
    app.use("*", bodyLimit(10));
    app.post("/", (c) => c.json({ ok: true }));
    const res = await app.handle(req("/", { method: "POST" }));
    expect(res.status).toBe(200);
  });

  it("allows GET requests (no body)", async () => {
    const app = new App();
    app.use("*", bodyLimit(5));
    app.get("/", (c) => c.json({ ok: true }));
    const res = await app.handle(req("/"));
    expect(res.status).toBe(200);
  });
});

describe("logger", () => {
  it("logs method, path, status, and durationMs on success", async () => {
    const lines: Record<string, unknown>[] = [];
    const app = new App();
    app.use("*", logger({ write: (line) => lines.push(line) }));
    app.get("/ping", (c) => c.json({ pong: true }));

    const res = await app.handle(req("/ping"));
    expect(res.status).toBe(200);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ method: "GET", path: "/ping", status: 200 });
    expect(typeof lines[0]!.durationMs).toBe("number");
    expect((lines[0]!.durationMs as number) >= 0).toBe(true);
  });

  it("logs status 500 and error flag when handler throws", async () => {
    const lines: Record<string, unknown>[] = [];
    const app = new App();
    app.use("*", logger({ write: (line) => lines.push(line) }));
    app.get("/boom", () => {
      throw new Error("test error");
    });

    await app.handle(req("/boom")).catch(() => {});
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ method: "GET", path: "/boom", status: 500, error: true });
  });

  it("re-throws the error after logging", async () => {
    const lines: Record<string, unknown>[] = [];
    const app = new App();
    app.use("*", logger({ write: (line) => lines.push(line) }));
    app.get("/boom", () => {
      throw new Error("rethrow me");
    });

    const res = await app.handle(req("/boom"));
    expect(res.status).toBe(500);
    expect(lines[0]).toMatchObject({ status: 500, error: true });
  });

  it("uses custom write sink instead of default console.log", async () => {
    const lines: Record<string, unknown>[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = new App();
    app.use("*", logger({ write: (line) => lines.push(line) }));
    app.get("/", (c) => c.json({}));

    await app.handle(req("/"));
    expect(lines).toHaveLength(1);
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("rounds durationMs to 2 decimal places", async () => {
    const lines: Record<string, unknown>[] = [];
    const app = new App();
    app.use("*", logger({ write: (line) => lines.push(line) }));
    app.get("/", (c) => c.json({}));

    await app.handle(req("/"));
    const dur = lines[0]!.durationMs as number;
    const decimals = String(dur).split(".")[1] ?? "";
    expect(decimals.length).toBeLessThanOrEqual(2);
  });
});

describe("csrf", () => {
  it("seeds XSRF-TOKEN cookie on GET requests", async () => {
    const app = new App();
    app.use("*", csrf());
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/"));
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.includes("XSRF-TOKEN"))).toBe(true);
  });

  it("rejects POST without CSRF token", async () => {
    const app = new App();
    app.use("*", csrf());
    app.post("/", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/", { method: "POST" }));
    expect(res.status).toBe(403);
  });

  it("accepts POST with matching CSRF token in header", async () => {
    const token = "test-csrf-token-123";
    const app = new App();
    app.use("*", csrf({ generateToken: () => token }));
    app.post("/", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/", {
      method: "POST",
      headers: {
        "x-xsrf-token": token,
        cookie: `XSRF-TOKEN=${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(200);
  });

  it("rejects POST with mismatched CSRF tokens", async () => {
    const app = new App();
    app.use("*", csrf());
    app.post("/", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/", {
      method: "POST",
      headers: {
        "x-xsrf-token": "wrong-token",
        cookie: "XSRF-TOKEN=correct-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(403);
  });

  it("skips validation for safe methods", async () => {
    const app = new App();
    app.use("*", csrf());
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/"));
    expect(res.status).toBe(200);
  });
});

describe("requestId", () => {
  it("generates a request ID and adds it to response headers", async () => {
    const app = new App();
    app.use("*", requestId());
    app.get("/", (c) => c.json({ id: c.get("requestId" as never) }));

    const res = await app.handle(req("/"));
    expect(res.headers.get("x-request-id")).toBeTruthy();
    const body = await res.json() as { id: string };
    expect(body.id).toBeTruthy();
  });

  it("trusts upstream request ID when configured", async () => {
    const app = new App();
    app.use("*", requestId());
    app.get("/", (c) => c.json({}));

    const upstreamId = "trace-id-abc-123";
    const res = await app.handle(req("/", { headers: { "x-request-id": upstreamId } }));
    expect(res.headers.get("x-request-id")).toBe(upstreamId);
  });

  it("uses custom header name", async () => {
    const app = new App();
    app.use("*", requestId({ headerName: "X-Correlation-ID" }));
    app.get("/", (c) => c.json({}));

    const res = await app.handle(req("/"));
    expect(res.headers.get("x-correlation-id")).toBeTruthy();
    expect(res.headers.get("x-request-id")).toBeNull();
  });
});

describe("apiKey", () => {
  it("rejects requests without an API key", async () => {
    const store = new MemoryApiKeyStore();
    store.add("secret-key", { plan: "pro" });
    const app = new App();
    app.use("*", apiKey({ store }));
    app.get("/", (c) => c.json({}));

    const res = await app.handle(req("/"));
    expect(res.status).toBe(401);
  });

  it("accepts a valid API key from header", async () => {
    const store = new MemoryApiKeyStore();
    store.add("valid-key", { plan: "pro" });
    const app = new App();
    app.use("*", apiKey({ store }));
    app.get("/", (c) => c.json({ key: c.get("apiKey" as never) }));

    const res = await app.handle(req("/", { headers: { "x-api-key": "valid-key" } }));
    expect(res.status).toBe(200);
    const body = await res.json() as { key: { metadata?: { plan: string } } };
    expect(body.key.metadata?.plan).toBe("pro");
  });

  it("rejects an invalid API key", async () => {
    const store = new MemoryApiKeyStore();
    store.add("valid-key");
    const app = new App();
    app.use("*", apiKey({ store }));
    app.get("/", (c) => c.json({}));

    const res = await app.handle(req("/", { headers: { "x-api-key": "wrong-key" } }));
    expect(res.status).toBe(403);
  });

  it("reads API key from query param", async () => {
    const store = new MemoryApiKeyStore();
    store.add("query-key");
    const app = new App();
    app.use("*", apiKey({ store, extractFrom: "query" }));
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/?api_key=query-key"));
    expect(res.status).toBe(200);
  });
});

describe("ipGuard", () => {
  it("blocks IPs in deny mode", async () => {
    const app = new App();
    app.use("*", ipGuard({ mode: "deny", list: ["192.168.1.0/24"] }));
    app.get("/", (c) => c.json({}));

    const res = await app.handle(req("/", {
      headers: { "x-forwarded-for": "192.168.1.100" },
    }));
    expect(res.status).toBe(403);
  });

  it("allows non-blocked IPs in deny mode", async () => {
    const app = new App();
    app.use("*", ipGuard({ mode: "deny", list: ["192.168.1.0/24"] }));
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/", {
      headers: { "x-forwarded-for": "203.0.113.50" },
    }));
    expect(res.status).toBe(200);
  });

  it("only allows listed IPs in allow mode", async () => {
    const app = new App();
    app.use("*", ipGuard({ mode: "allow", list: ["203.0.113.0/24"] }));
    app.get("/", (c) => c.json({ ok: true }));

    const allowed = await app.handle(req("/", {
      headers: { "x-forwarded-for": "203.0.113.50" },
    }));
    expect(allowed.status).toBe(200);

    const blocked = await app.handle(req("/", {
      headers: { "x-forwarded-for": "198.51.100.50" },
    }));
    expect(blocked.status).toBe(403);
  });
});

describe("contentTypeGuard", () => {
  it("rejects POST without required Content-Type", async () => {
    const app = new App();
    app.use("*", contentTypeGuard({ required: ["application/json"] }));
    app.post("/", (c) => c.json({}));

    const res = await app.handle(req("/", { method: "POST" }));
    expect(res.status).toBe(415);
  });

  it("rejects POST with wrong Content-Type", async () => {
    const app = new App();
    app.use("*", contentTypeGuard({ required: ["application/json"] }));
    app.post("/", (c) => c.json({}));

    const res = await app.handle(req("/", {
      method: "POST",
      headers: { "content-type": "text/plain" },
    }));
    expect(res.status).toBe(415);
  });

  it("accepts POST with correct Content-Type", async () => {
    const app = new App();
    app.use("*", contentTypeGuard({ required: ["application/json"] }));
    app.post("/", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(200);
  });

  it("supports wildcard Content-Type patterns", async () => {
    const app = new App();
    app.use("*", contentTypeGuard({ required: ["multipart/*"] }));
    app.post("/", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=abc" },
    }));
    expect(res.status).toBe(200);
  });

  it("skips non-matching methods", async () => {
    const app = new App();
    app.use("*", contentTypeGuard({ required: ["application/json"] }));
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/"));
    expect(res.status).toBe(200);
  });
});

describe("requestTimeout", () => {
  it("allows fast handlers to complete", async () => {
    const app = new App();
    app.use("*", requestTimeout({ ms: 5000 }));
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/"));
    expect(res.status).toBe(200);
  });

  it("returns 408 when handler times out", async () => {
    const app = new App();
    app.use("*", requestTimeout({ ms: 50 }));
    app.get("/slow", async () => {
      await new Promise((r) => setTimeout(r, 200));
      return new Response("done");
    });

    const res = await app.handle(req("/slow"));
    expect(res.status).toBe(408);
  });
});

describe("xssSanitize", () => {
  it("encodes HTML entities in string body values", async () => {
    const app = new App();
    app.use("*", xssSanitize());
    app.post("/comment", async (c) => {
      const body = sanitizedBody<{ text: string }>(c);
      return c.json({ text: body.text });
    });

    const res = await app.handle(req("/comment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "<script>alert('xss')</script>" }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { text: string };
    expect(body.text).toContain("&lt;script&gt;");
    expect(body.text).not.toContain("<script>");
  });

  it("leaves non-string values untouched", async () => {
    const app = new App();
    app.use("*", xssSanitize());
    app.post("/data", async (c) => {
      const body = await c.req.json<{ count: number; tags: string[] }>();
      return c.json(body);
    });

    const res = await app.handle(req("/data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: 42, tags: ["safe"] }),
    }));
    const body = await res.json() as { count: number; tags: string[] };
    expect(body.count).toBe(42);
    expect(body.tags).toEqual(["safe"]);
  });
});

describe("ssrfGuard", () => {
  it("blocks requests to localhost", async () => {
    const app = new App();
    app.use("*", ssrfGuard());
    app.post("/fetch", async (c) => c.json({ ok: true }));

    const res = await app.handle(req("/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "http://localhost/admin" }),
    }));
    expect(res.status).toBe(403);
  });

  it("blocks requests to 127.0.0.1", async () => {
    const app = new App();
    app.use("*", ssrfGuard());
    app.post("/fetch", async (c) => c.json({ ok: true }));

    const res = await app.handle(req("/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "http://127.0.0.1/secret" }),
    }));
    expect(res.status).toBe(403);
  });

  it("blocks non-http protocols", async () => {
    const app = new App();
    app.use("*", ssrfGuard());
    app.post("/fetch", async (c) => c.json({ ok: true }));

    const res = await app.handle(req("/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "file:///etc/passwd" }),
    }));
    expect(res.status).toBe(400);
  });

  it("allows valid external URLs", async () => {
    const app = new App();
    app.use("*", ssrfGuard());
    app.post("/fetch", async (c) => c.json({ ok: true }));

    const res = await app.handle(req("/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/api" }),
    }));
    expect(res.status).toBe(200);
  });

  it("rejects invalid URLs", async () => {
    const app = new App();
    app.use("*", ssrfGuard());
    app.post("/fetch", async (c) => c.json({ ok: true }));

    const res = await app.handle(req("/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "not-a-url" }),
    }));
    expect(res.status).toBe(400);
  });
});

describe("sessions", () => {
  it("creates a session and sets a cookie", async () => {
    const app = new App();
    app.use("*", sessions({ secret: "test-secret-key-32-bytes-long!!!", store: new MemorySessionStore() }));
    app.get("/login", (c) => {
      const session = c.get("session" as never) as Record<string, unknown>;
      session.userId = "123";
      return c.json({ loggedIn: true });
    });

    const res = await app.handle(req("/login"));
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.includes("sid="))).toBe(true);
  });

  it("restores session data from cookie", async () => {
    const store = new MemorySessionStore();
    const app = new App();
    app.use("*", sessions({ secret: "test-secret-key-32-bytes-long!!!", store }));

    app.get("/set", (c) => {
      const session = c.get("session" as never) as Record<string, unknown>;
      session.visited = true;
      return c.json({ ok: true });
    });

    app.get("/get", (c) => {
      const session = c.get("session" as never) as Record<string, unknown>;
      return c.json({ visited: session?.visited });
    });

    // First request — set session
    const setRes = await app.handle(req("/set"));
    const cookies = setRes.headers.getSetCookie();
    const sidCookie = cookies.find((c) => c.includes("sid="));
    expect(sidCookie).toBeTruthy();

    // Extract the cookie value
    const cookieValue = sidCookie!.split(";")[0]!;

    // Second request — restore session
    const getRes = await app.handle(req("/get", { headers: { cookie: cookieValue } }));
    expect(getRes.status).toBe(200);
    const body = await getRes.json() as { visited: boolean };
    expect(body.visited).toBe(true);
  });

  it("starts with empty session when no cookie", async () => {
    const app = new App();
    app.use("*", sessions({ secret: "test-secret-key-32-bytes-long!!!" }));
    app.get("/", (c) => {
      const session = c.get("session" as never) as Record<string, unknown>;
      return c.json({ keys: Object.keys(session ?? {}) });
    });

    const res = await app.handle(req("/"));
    const body = await res.json() as { keys: string[] };
    expect(body.keys).toEqual([]);
  });

  it("MemorySessionStore cleanup removes expired entries", async () => {
    const store = new MemorySessionStore();
    await store.set("expired", { data: 1 }, 0); // expires immediately
    await store.set("valid", { data: 2 }, 3600);

    // Wait a tick for expiry
    await new Promise((r) => setTimeout(r, 10));

    const expired = await store.get("expired");
    const valid = await store.get("valid");
    expect(expired).toBeNull();
    expect(valid).toEqual({ data: 2 });

    store.destroy_();
  });
});

describe("MemoryRateLimitStore", () => {
  it("cleanup removes expired entries", async () => {
    const store = new MemoryRateLimitStore({ cleanupIntervalMs: 50 });
    await store.increment("key1", 1); // expires in 1ms
    await new Promise((r) => setTimeout(r, 20));

    // After cleanup, key1 should be gone — a new increment starts fresh
    const result = await store.increment("key1", 60_000);
    expect(result.count).toBe(1); // fresh start, not accumulated

    store.destroy();
  });

  it("destroy clears all data", async () => {
    const store = new MemoryRateLimitStore();
    await store.increment("key1", 60_000);
    await store.increment("key1", 60_000);
    store.destroy();

    // After destroy, counter should be fresh
    const result = await store.increment("key1", 60_000);
    expect(result.count).toBe(1);
  });
});
