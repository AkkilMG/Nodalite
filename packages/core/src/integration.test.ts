/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — cross-package source imports for integration testing; resolved at runtime by vitest
import { describe, expect, it } from "vitest";
import { App, HttpError } from "./index.js";
import { cors, securityHeaders, rateLimit, MemoryRateLimitStore, logger, jwtAuth, signJwt } from "../../middleware/src/index.js";
import { serve } from "../../adapter-node/src/serve.js";
import { createEdgeHandler } from "../../adapter-edge/src/index.js";
import { openapi } from "../../openapi/src/openapi.js";
import { z } from "zod";

function req(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init);
}

describe("core + middleware integration", () => {
  it("applies cors, securityHeaders, and logger together on a request", async () => {
    const lines: Record<string, unknown>[] = [];
    const app = new App();
    app.use("*", logger({ write: (line) => lines.push(line) }));
    app.use("*", cors({ origin: "https://app.example.com" }));
    app.use("*", securityHeaders());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/test", { headers: { origin: "https://app.example.com" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ method: "GET", path: "/test", status: 200 });
  });

  it("rate limiter blocks after threshold while logger still logs", async () => {
    const lines: Record<string, unknown>[] = [];
    const app = new App();
    app.use("*", logger({ write: (line) => lines.push(line) }));
    app.use("*", rateLimit({ windowMs: 60_000, max: 1, store: new MemoryRateLimitStore() }));
    app.get("/", (c) => c.json({ ok: true }));

    const headers = { "x-forwarded-for": "10.0.0.1" };
    const r1 = await app.handle(req("/", { headers }));
    expect(r1.status).toBe(200);

    const r2 = await app.handle(req("/", { headers }));
    expect(r2.status).not.toBe(200);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ status: 200 });
    expect(lines[1]).toMatchObject({ error: true });
  });

  it("jwtAuth + validate work together in a route group", async () => {
    const secret = "integration-test-secret-key-32bytes!";
    const app = new App();

    app.group("/api", (g) => {
      g.use(jwtAuth({ secret }));
      g.get(
        "/profile",
        (c) => c.json({ user: c.get("user") }),
      );
      g.post(
        "/update",
        async (c) => {
          const body = await c.req.json<{ name: string }>();
          return c.json({ updated: body.name });
        },
      );
    });

    const token = await signJwt({ sub: "user_42", name: "Test" }, { secret, expiresIn: "5m" });
    const authHeaders = { authorization: `Bearer ${token}` };

    const getRes = await app.handle(req("/api/profile", { headers: authHeaders }));
    expect(getRes.status).toBe(200);
    const profile = await getRes.json() as { user: { sub: string } };
    expect(profile.user.sub).toBe("user_42");

    const postRes = await app.handle(
      req("/api/update", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      })
    );
    expect(postRes.status).toBe(200);
    expect(await postRes.json()).toEqual({ updated: "Updated" });

    const unauthRes = await app.handle(req("/api/profile"));
    expect(unauthRes.status).not.toBe(200);
  });
});

describe("core + openapi integration", () => {
  it("registers routes with openapi metadata and serves the spec", async () => {
    const app = new App();
    const docs = openapi(app, {
      info: { title: "Integration Test API", version: "1.0.0" },
    });

    docs.get("/users", () => new Response("list"), {
      openapi: { summary: "List users", tags: ["users"], responses: { 200: { description: "User list" } } },
    });

    docs.post("/users", () => new Response("created", { status: 201 }), {
      openapi: {
        summary: "Create user",
        tags: ["users"],
        request: { body: z.object({ name: z.string() }) },
        responses: { 201: { description: "Created" } },
      },
    });

    const specRes = await app.handle(req("/openapi.json"));
    expect(specRes.status).toBe(200);
    const spec = await specRes.json() as Record<string, unknown>;
    expect(spec.openapi).toBe("3.1.0");
    expect((spec.paths as Record<string, unknown>)["/users"]).toBeDefined();

    const swaggerRes = await app.handle(req("/swagger"));
    expect(swaggerRes.status).toBe(200);
    expect((await swaggerRes.text())).toContain("swagger-ui");
  });

  it("openapi does not interfere with normal route handling", async () => {
    const app = new App();
    openapi(app, { info: { title: "Test", version: "1.0.0" } });

    app.get("/api/data", (c) => c.json({ data: 42 }));

    const res = await app.handle(req("/api/data"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: 42 });
  });
});

describe("core + adapter-node full HTTP roundtrip", () => {
  it("serves a complete app with middleware through a real HTTP server", async () => {
    const lines: Record<string, unknown>[] = [];
    const app = new App();
    app.use("*", logger({ write: (line) => lines.push(line) }));
    app.use("*", securityHeaders());

    app.get("/health", (c) => c.json({ status: "ok" }));
    app.get("/users/:id", (c) => c.json({ id: c.req.param("id") }));
    app.post("/echo", async (c) => {
      const body = await c.req.json<{ msg: string }>();
      return c.json({ echo: body.msg });
    });

    const handle = serve(app, { port: 0 });
    await new Promise<void>((r) => handle.server.once("listening", r));
    const address = handle.server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    try {
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      expect(health.status).toBe(200);
      expect(health.headers.get("x-content-type-options")).toBe("nosniff");
      expect(await health.json()).toEqual({ status: "ok" });

      const user = await fetch(`http://127.0.0.1:${port}/users/123`);
      expect(await user.json()).toEqual({ id: "123" });

      const echo = await fetch(`http://127.0.0.1:${port}/echo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ msg: "hello" }),
      });
      expect(await echo.json()).toEqual({ echo: "hello" });

      expect(lines).toHaveLength(3);
      expect(lines[0]).toMatchObject({ method: "GET", path: "/health", status: 200 });
      expect(lines[1]).toMatchObject({ method: "GET", path: "/users/123", status: 200 });
      expect(lines[2]).toMatchObject({ method: "POST", path: "/echo", status: 200 });
    } finally {
      await handle.close();
    }
  });

  it("returns 404 for unmatched routes", async () => {
    const app = new App();
    app.get("/exists", (c) => c.json({ ok: true }));

    const handle = serve(app, { port: 0 });
    await new Promise<void>((r) => handle.server.once("listening", r));
    const address = handle.server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/does-not-exist`);
      expect(res.status).toBe(404);
    } finally {
      await handle.close();
    }
  });
});

describe("core + adapter-edge full request lifecycle", () => {
  it("processes a request through edge adapter with env and logging", async () => {
    const lines: Record<string, unknown>[] = [];
    const app = new App();
    app.use("*", logger({ write: (line) => lines.push(line) }));
    app.get("/config", (c) => c.json({
      runtime: c.platform.runtime,
      apiKey: (c.platform.env as Record<string, unknown>)?.API_KEY,
    }));

    const worker = createEdgeHandler(app);
    const res = await worker.fetch(
      new Request("https://example.com/config"),
      { API_KEY: "secret-123" },
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { runtime: string; apiKey: string };
    expect(body.runtime).toBe("edge");
    expect(body.apiKey).toBe("secret-123");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ method: "GET", path: "/config", status: 200 });
  });
});

describe("core + openapi + middleware full stack", () => {
  it("openapi spec reflects routes with middleware and error handling", async () => {
    const app = new App();
    app.use("*", cors({ origin: "https://app.example.com" }));

    const docs = openapi(app, {
      info: { title: "Full Stack API", version: "2.0.0" },
      servers: [{ url: "https://api.example.com" }],
    });

    docs.get("/health", () => new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    }), {
      openapi: { summary: "Health check", responses: { 200: { description: "OK" } } },
    });

    docs.get("/items/:id", (c) => {
      const id = c.req.param("id");
      if (id === "missing") throw HttpError.notFound("Item not found");
      return new Response(JSON.stringify({ id }), {
        headers: { "content-type": "application/json" },
      });
    }, {
      openapi: {
        summary: "Get item by ID",
        request: { params: z.object({ id: z.string() }) },
        responses: { 200: { description: "Item" }, 404: { description: "Not found" } },
      },
    });

    const specRes = await app.handle(req("/openapi.json"));
    const spec = await specRes.json() as Record<string, unknown>;
    expect(spec.info).toEqual({ title: "Full Stack API", version: "2.0.0" });

     const itemRes = await app.handle(req("/items/42", { headers: { origin: "https://app.example.com" } }));
    expect(itemRes.status).toBe(200);
    expect(itemRes.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    expect(await itemRes.json()).toEqual({ id: "42" });

    const missingRes = await app.handle(req("/items/missing"));
    expect(missingRes.status).toBe(404);
  });
});
