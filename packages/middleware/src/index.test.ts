import { App } from "@nodalite/core";
import { describe, expect, it } from "vitest";
import { bodyLimit } from "./body-limit.js";
import { cors } from "./cors.js";
import { jwtAuth, signJwt } from "./jwt.js";
import { MemoryRateLimitStore, rateLimit } from "./rate-limit.js";
import { securityHeaders } from "./security-headers.js";

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
});
