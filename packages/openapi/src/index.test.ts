import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { App } from "@nodalite/core";
import { openapi } from "./openapi.js";
import { toOpenAPISchema } from "./schema.js";
import { generateSpec } from "./spec.js";
import { swaggerUIHTML, redocHTML } from "./templates.js";
import type { StoredRoute, OpenAPIOptions } from "./types.js";

// ── Helpers ──
function req(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init);
}

// ── Schema conversion ──
describe("toOpenAPISchema", () => {
  it("converts z.string()", () => {
    expect(toOpenAPISchema(z.string())).toEqual({ type: "string" });
  });

  it("converts z.number()", () => {
    expect(toOpenAPISchema(z.number())).toEqual({ type: "number" });
  });

  it("converts z.boolean()", () => {
    expect(toOpenAPISchema(z.boolean())).toEqual({ type: "boolean" });
  });

  it("converts z.object()", () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = toOpenAPISchema(schema);
    expect(result).toMatchObject({
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
    });
  });

  it("marks optional fields correctly", () => {
    const schema = z.object({ name: z.string(), nickname: z.string().optional() });
    const result = toOpenAPISchema(schema) as Record<string, unknown>;
    expect(result.type).toBe("object");
    expect((result.properties as Record<string, unknown>).nickname).toEqual({ type: "string" });
    expect(result.required).toEqual(["name"]);
  });

  it("converts z.array()", () => {
    expect(toOpenAPISchema(z.array(z.string()))).toEqual({
      type: "array",
      items: { type: "string" },
    });
  });

  it("converts z.enum()", () => {
    const schema = z.enum(["a", "b", "c"]);
    expect(toOpenAPISchema(schema)).toEqual({
      type: "string",
      enum: ["a", "b", "c"],
    });
  });

  it("returns empty object for null/undefined", () => {
    expect(toOpenAPISchema(null)).toEqual({});
    expect(toOpenAPISchema(undefined)).toEqual({});
  });

  it("passes through raw JSON Schema objects", () => {
    const schema = { type: "string", pattern: "^foo" };
    expect(toOpenAPISchema(schema)).toEqual(schema);
  });
});

// ── OpenAPI spec generation ──
describe("generateSpec", () => {
  const defaultOptions: OpenAPIOptions = {
    info: { title: "Test API", version: "1.0.0" },
    servers: [{ url: "http://localhost:3000" }],
  };

  it("generates a valid OpenAPI document", () => {
    const routes: StoredRoute[] = [
      {
        method: "GET",
        path: "/users/:id",
        handler: async () => new Response(),
        middlewares: [],
        openapi: {
          summary: "Get user",
          tags: ["users"],
          path: "/users/:id",
          method: "GET",
          responses: { 200: { description: "A user" } },
        },
      },
    ];

    const spec = generateSpec(routes, defaultOptions);
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("Test API");
    expect(spec.servers).toEqual([{ url: "http://localhost:3000" }]);
  });

  it("converts :param style paths to {param} style", () => {
    const routes: StoredRoute[] = [
      {
        method: "GET",
        path: "/users/:userId/posts/:postId",
        handler: async () => new Response(),
        middlewares: [],
        openapi: {
          path: "/users/:userId/posts/:postId",
          method: "GET",
          responses: { 200: { description: "OK" } },
        },
      },
    ];

    const spec = generateSpec(routes, defaultOptions);
    expect(spec.paths["/users/{userId}/posts/{postId}"]).toBeDefined();
  });

  it("excludes routes without openapi metadata", () => {
    const routes: StoredRoute[] = [
      {
        method: "GET",
        path: "/public",
        handler: async () => new Response(),
        middlewares: [],
      },
      {
        method: "GET",
        path: "/docs",
        handler: async () => new Response(),
        middlewares: [],
        openapi: {
          path: "/docs",
          method: "GET",
          responses: { 200: { description: "OK" } },
        },
      },
    ];

    const spec = generateSpec(routes, defaultOptions);
    expect(Object.keys(spec.paths)).toEqual(["/docs"]);
  });

  it("generates path parameters from request.params schema", () => {
    const routes: StoredRoute[] = [
      {
        method: "GET",
        path: "/users/:id",
        handler: async () => new Response(),
        middlewares: [],
        openapi: {
          path: "/users/:id",
          method: "GET",
          request: {
            params: z.object({ id: z.string() }),
          },
          responses: { 200: { description: "User" } },
        },
      },
    ];

    const spec = generateSpec(routes, defaultOptions);
    const pathItem = spec.paths["/users/{id}"]?.get;
    expect(pathItem?.parameters).toHaveLength(1);
    expect(pathItem?.parameters?.[0]).toMatchObject({
      name: "id",
      in: "path",
      required: true,
    });
  });

  it("generates query parameters from request.query schema", () => {
    const routes: StoredRoute[] = [
      {
        method: "GET",
        path: "/search",
        handler: async () => new Response(),
        middlewares: [],
        openapi: {
          path: "/search",
          method: "GET",
          request: {
            query: z.object({ q: z.string(), page: z.number().optional() }),
          },
          responses: { 200: { description: "Results" } },
        },
      },
    ];

    const spec = generateSpec(routes, defaultOptions);
    const params = spec.paths["/search"]?.get?.parameters ?? [];
    expect(params).toHaveLength(2);
    expect(params.find((p) => p.name === "q")?.in).toBe("query");
    expect(params.find((p) => p.name === "q")?.required).toBe(true);
    expect(params.find((p) => p.name === "page")?.required).toBe(false);
  });

  it("generates request body from request.body schema", () => {
    const userSchema = z.object({ name: z.string(), email: z.string() });
    const routes: StoredRoute[] = [
      {
        method: "POST",
        path: "/users",
        handler: async () => new Response(),
        middlewares: [],
        openapi: {
          path: "/users",
          method: "POST",
          request: {
            body: userSchema,
          },
          responses: { 201: { description: "Created" } },
        },
      },
    ];

    const spec = generateSpec(routes, defaultOptions);
    const pathItem = spec.paths["/users"]?.post;
    expect(pathItem?.requestBody).toBeDefined();
    expect(pathItem?.requestBody?.content?.["application/json"]).toBeDefined();
    expect((pathItem?.requestBody?.content?.["application/json"]?.schema as Record<string, unknown>)?.$ref).toContain("components/schemas/");
  });

  it("places schemas in components.schemas with $ref references", () => {
    const userSchema = z.object({ name: z.string(), email: z.string() });
    const routes: StoredRoute[] = [
      {
        method: "POST",
        path: "/users",
        handler: async () => new Response(),
        middlewares: [],
        openapi: {
          path: "/users",
          method: "POST",
          request: { body: userSchema },
          responses: { 201: { description: "Created" } },
        },
      },
    ];

    const spec = generateSpec(routes, defaultOptions);
    expect(spec.components?.schemas).toBeDefined();
    const schemaKeys = Object.keys(spec.components!.schemas!);
    expect(schemaKeys.length).toBeGreaterThan(0);
  });
});

// ── Templates ──
describe("templates", () => {
  it("swaggerUIHTML contains swagger-ui-bundle script", () => {
    const html = swaggerUIHTML("/openapi.json", "Test API");
    expect(html).toContain("swagger-ui-bundle.js");
    expect(html).toContain("/openapi.json");
    expect(html).toContain("Test API");
  });

  it("redocHTML contains redoc.standalone script", () => {
    const html = redocHTML("/openapi.json", "Test API");
    expect(html).toContain("redoc.standalone.js");
    expect(html).toContain("/openapi.json");
  });
});

// ── Full integration ──
describe("OpenAPIApp (integration)", () => {
  it("registering a route with openapi metadata exposes it in the spec", async () => {
    const app = new App();
    const docs = openapi(app, {
      info: { title: "Integration", version: "1.0.0" },
    });

    docs.get("/hello", () => new Response("ok"), {
      openapi: {
        summary: "Say hello",
        tags: ["greetings"],
        responses: { 200: { description: "Greeting" } },
      },
    });

    const res = await app.handle(req("/openapi.json"));
    expect(res.status).toBe(200);
    const spec = (await res.json()) as Record<string, unknown>;
    expect(spec.openapi).toBe("3.1.0");
    expect((spec.paths as Record<string, unknown>)["/hello"]).toBeDefined();
  });

  it("swagger UI endpoint returns HTML", async () => {
    const app = new App();
    openapi(app, {
      info: { title: "HTML Test", version: "1.0.0" },
    });

    const res = await app.handle(req("/swagger"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const text = await res.text();
    expect(text).toContain("swagger-ui");
  });

  it("redoc endpoint returns HTML", async () => {
    const app = new App();
    openapi(app, {
      info: { title: "ReDoc Test", version: "1.0.0" },
    });

    const res = await app.handle(req("/redoc"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("redoc");
  });

  it("routes without openapi metadata do not appear", async () => {
    const app = new App();
    const docs = openapi(app, {
      info: { title: "Selective", version: "1.0.0" },
    });

    docs.get("/visible", () => new Response("ok"), {
      openapi: {
        responses: { 200: { description: "Visible" } },
      },
    });
    docs.get("/hidden", () => new Response("ok"));

    const res = await app.handle(req("/openapi.json"));
    const spec = (await res.json()) as Record<string, unknown>;
    const paths = spec.paths as Record<string, unknown>;
    expect(paths["/visible"]).toBeDefined();
    expect(paths["/hidden"]).toBeUndefined();
  });

  it("group() registers routes with prefix in spec", async () => {
    const app = new App();
    const docs = openapi(app, {
      info: { title: "Group Test", version: "1.0.0" },
    });

    docs.group("/api", (g) => {
      g.get("/items", () => new Response("ok"), {
        openapi: {
          summary: "List items",
          responses: { 200: { description: "Items" } },
        },
      });
    });

    const res = await app.handle(req("/openapi.json"));
    const spec = (await res.json()) as Record<string, unknown>;
    expect((spec.paths as Record<string, unknown>)["/api/items"]).toBeDefined();
  });

  it("works with custom spec/docs paths", async () => {
    const app = new App();
    const docs = openapi(app, {
      info: { title: "Custom", version: "1.0.0" },
      specPath: "/api/swagger.json",
      docsPath: "/api/swagger",
    });

    docs.get("/ping", () => new Response("pong"), {
      openapi: {
        responses: { 200: { description: "Pong" } },
      },
    });

    const specRes = await app.handle(req("/api/swagger.json"));
    expect(specRes.status).toBe(200);

    const docsRes = await app.handle(req("/api/swagger"));
    expect(docsRes.status).toBe(200);
    expect((await docsRes.text())).toContain("swagger-ui");
  });

  it("generates complete spec with request body and responses", async () => {
    const userSchema = z.object({ name: z.string(), email: z.string().email() });
    const app = new App();
    const docs = openapi(app, {
      info: { title: "User API", version: "1.0.0" },
    });

    docs.post("/users", () => new Response("created", { status: 201 }), {
      openapi: {
        summary: "Create user",
        tags: ["users"],
        request: { body: userSchema },
        responses: {
          201: { description: "User created", schema: userSchema },
          400: { description: "Validation error" },
        },
      },
    });

    const res = await app.handle(req("/openapi.json"));
    const spec = (await res.json()) as Record<string, unknown>;
    const post = (spec.paths as Record<string, unknown>)[
      "/users"
    ] as Record<string, unknown>;

    expect(post.post).toBeDefined();
    expect((post.post as Record<string, unknown>).summary).toBe("Create user");
    expect((post.post as Record<string, unknown>).requestBody).toBeDefined();
    expect((post.post as Record<string, unknown>).responses).toBeDefined();
  });
});

// ── Reserved routes ──
describe("Reserved routes", () => {
  it("reserve() marks a path as reserved", () => {
    const app = new App();
    app.reserve("/swagger");
    expect(app.isReserved("/swagger")).toBe(true);
  });

  it("isReserved() returns false for unreserved paths", () => {
    const app = new App();
    expect(app.isReserved("/swagger")).toBe(false);
  });

  it("overriding a reserved path emits a warning and original handler stays", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = new App();

    app.get("/swagger", () => new Response("original"));
    app.reserve("/swagger");
    app.get("/swagger", () => new Response("override"));

    const res = await app.handle(req("/swagger"));
    const text = await res.text();
    expect(text).toBe("original");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]![0]).toContain("/swagger");
    expect(warnSpy.mock.calls[0]![0]).toContain("reserved");
    warnSpy.mockRestore();
  });

  it("warn message suggests an alternative path", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = new App();

    app.reserve("/swagger");
    app.get("/swagger", () => new Response("nope"));

    expect(warnSpy).toHaveBeenCalledOnce();
    const msg = warnSpy.mock.calls[0]![0] as string;
    expect(msg).toContain("/swagger-1");
    warnSpy.mockRestore();
  });

  it("reserved paths are case-sensitive", () => {
    const app = new App();
    app.reserve("/Swagger");
    expect(app.isReserved("/Swagger")).toBe(true);
    expect(app.isReserved("/swagger")).toBe(false);
  });

  it("multiple reserved paths are tracked independently", () => {
    const app = new App();
    app.reserve("/swagger");
    app.reserve("/redoc");
    app.reserve("/openapi.json");
    expect(app.isReserved("/swagger")).toBe(true);
    expect(app.isReserved("/redoc")).toBe(true);
    expect(app.isReserved("/openapi.json")).toBe(true);
    expect(app.isReserved("/api")).toBe(false);
  });

  it("openapi() reserves the default /swagger, /redoc, and /openapi.json paths", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = new App();
    openapi(app, { info: { title: "Reserved Test", version: "1.0.0" } });

    expect(app.isReserved("/swagger")).toBe(true);
    expect(app.isReserved("/redoc")).toBe(true);
    expect(app.isReserved("/openapi.json")).toBe(true);

    app.get("/swagger", () => new Response("nope"));
    expect(warnSpy).toHaveBeenCalledOnce();

    const res = await app.handle(req("/swagger"));
    const text = await res.text();
    expect(text).toContain("swagger-ui");
    warnSpy.mockRestore();
  });

  it("custom paths are reserved when configured", () => {
    const app = new App();
    openapi(app, {
      info: { title: "Custom Reserved", version: "1.0.0" },
      docsPath: "/api/docs",
      specPath: "/api/spec.json",
      redocPath: "/api/redoc",
    });

    expect(app.isReserved("/api/docs")).toBe(true);
    expect(app.isReserved("/api/spec.json")).toBe(true);
    expect(app.isReserved("/api/redoc")).toBe(true);
    expect(app.isReserved("/swagger")).toBe(false);
  });
});
