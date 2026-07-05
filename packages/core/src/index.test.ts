import { describe, expect, it } from "vitest";
import { App, HttpError } from "./index.js";

function req(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init);
}

describe("routing", () => {
  it("matches static and param routes", async () => {
    const app = new App();
    app.get("/health", (c) => c.json({ ok: true }));
    app.get("/users/:id", (c) => c.json({ id: c.req.param("id") }));

    const r1 = await app.handle(req("/health"));
    expect(await r1.json()).toEqual({ ok: true });

    const r2 = await app.handle(req("/users/42"));
    expect(await r2.json()).toEqual({ id: "42" });
  });

  it("returns 404 for unmatched routes by default", async () => {
    const app = new App();
    const res = await app.handle(req("/nope"));
    expect(res.status).toBe(404);
  });

  it("supports wildcard routes", async () => {
    const app = new App();
    app.get("/files/*", (c) => c.json({ path: c.req.param("*") }));
    const res = await app.handle(req("/files/a/b/c.png"));
    expect(await res.json()).toEqual({ path: "a/b/c.png" });
  });
});

describe("middleware", () => {
  it("runs global middleware in onion order around the handler", async () => {
    const events: string[] = [];
    const app = new App();
    app.use("*", async (c, next) => {
      events.push("mw1-before");
      const res = await next();
      events.push("mw1-after");
      return res;
    });
    app.use("*", async (c, next) => {
      events.push("mw2-before");
      const res = await next();
      events.push("mw2-after");
      return res;
    });
    app.get("/", (c) => {
      events.push("handler");
      return c.json({});
    });

    await app.handle(req("/"));
    expect(events).toEqual(["mw1-before", "mw2-before", "handler", "mw2-after", "mw1-after"]);
  });

  it("a middleware can short-circuit without calling next", async () => {
    const app = new App();
    app.use("*", async (c) => c.status(401).json({ error: "nope" }));
    app.get("/", (c) => c.json({ reached: true }));

    const res = await app.handle(req("/"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "nope" });
  });

  it("scopes prefixed middleware to matching paths only", async () => {
    const hit: string[] = [];
    const app = new App();
    app.use("/api/*", async (c, next) => {
      hit.push(c.req.url.pathname);
      return next();
    });
    app.get("/api/thing", (c) => c.json({}));
    app.get("/other", (c) => c.json({}));

    await app.handle(req("/api/thing"));
    await app.handle(req("/other"));
    expect(hit).toEqual(["/api/thing"]);
  });
});

describe("errors", () => {
  it("turns thrown HttpError into a matching JSON response", async () => {
    const app = new App();
    app.get("/boom", () => {
      throw HttpError.forbidden("nope");
    });
    const res = await app.handle(req("/boom"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "nope", status: 403 });
  });

  it("hides internal error messages by default", async () => {
    const app = new App();
    app.get("/boom", () => {
      throw new Error("leaked secret");
    });
    const res = await app.handle(req("/boom"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Internal Server Error");
  });

  it("supports a custom error handler", async () => {
    const app = new App();
    app.onError((err, c) => c.status(418).json({ teapot: true }));
    app.get("/boom", () => {
      throw new Error("x");
    });
    const res = await app.handle(req("/boom"));
    expect(res.status).toBe(418);
  });
});

describe("route groups", () => {
  it("prefixes routes and scopes group middleware", async () => {
    const app = new App();
    app.group("/api/v1", (g) => {
      g.use(async (c, next) => {
        c.header("x-api-version", "1");
        return next();
      });
      g.get("/ping", (c) => c.json({ pong: true }));
    });

    const res = await app.handle(req("/api/v1/ping"));
    expect(await res.json()).toEqual({ pong: true });
    expect(res.headers.get("x-api-version")).toBe("1");
  });
});
