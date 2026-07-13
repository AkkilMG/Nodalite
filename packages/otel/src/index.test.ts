import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { App } from "@nodalite/core";
import { SpanStatusCode } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { SimpleSpanProcessor, InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { otel, getSpan, withSpan } from "./index.js";

function req(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init);
}

const exporter = new InMemorySpanExporter();
let provider: NodeTracerProvider;

beforeAll(() => {
  provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register();
});

afterAll(async () => {
  await provider.shutdown();
});

beforeEach(() => {
  exporter.reset();
});

function getSpans() {
  return exporter.getFinishedSpans();
}

describe("otel middleware", () => {

  it("creates a server span for each request", async () => {
    const app = new App();
    app.use("*", otel({ serviceName: "test-service" }));
    app.get("/api/test", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/api/test"));
    expect(res.status).toBe(200);

    const spans = getSpans();
    expect(spans.length).toBeGreaterThanOrEqual(1);

    const serverSpan = spans.find((s) => s.kind === 1);
    expect(serverSpan).toBeDefined();
    expect(serverSpan!.name).toBe("GET");
    expect(serverSpan!.attributes["http.request.method"]).toBe("GET");
    expect(serverSpan!.attributes["url.path"]).toBe("/api/test");
    expect(serverSpan!.attributes["http.response.status_code"]).toBe(200);
  });

  it("records error status on exception", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = new App();
    app.use("*", otel({ serviceName: "test-service" }));
    app.get("/api/error", () => {
      throw new Error("boom");
    });

    const res = await app.handle(req("/api/error"));
    expect(res.status).toBe(500);

    const spans = getSpans();
    const errorSpan = spans.find((s) => s.status.code === SpanStatusCode.ERROR);
    expect(errorSpan).toBeDefined();
    expect(errorSpan!.status.message).toBe("boom");
    spy.mockRestore();
  });

  it("records 4xx as ERROR status", async () => {
    const app = new App();
    app.use("*", otel({ serviceName: "test-service" }));
    app.get("/api/not-found", (c) => c.json({ error: "not found" }, { status: 404 }));

    const res = await app.handle(req("/api/not-found"));
    expect(res.status).toBe(404);

    const spans = getSpans();
    const span404 = spans.find((s) => s.attributes["http.response.status_code"] === 404);
    expect(span404).toBeDefined();
    expect(span404!.status.code).toBe(SpanStatusCode.ERROR);
  });

  it("skips instrumentation for ignored paths", async () => {
    const app = new App();
    app.use("*", otel({ serviceName: "test-service", ignoredPaths: ["/health"] }));
    app.get("/health", (c) => c.text("ok"));

    const res = await app.handle(req("/health"));
    expect(res.status).toBe(200);

    const spans = getSpans();
    expect(spans.length).toBe(0);
  });

  it("uses custom getSpanName when provided", async () => {
    const app = new App();
    app.use("*", otel({
      serviceName: "test-service",
      getSpanName: () => "custom-span",
    }));
    app.get("/api/custom", (c) => c.json({ ok: true }));

    await app.handle(req("/api/custom"));

    const spans = getSpans();
    const span = spans.find((s) => s.name === "custom-span");
    expect(span).toBeDefined();
  });

  it("records request headers when recordHeaders is enabled", async () => {
    const app = new App();
    app.use("*", otel({
      serviceName: "test-service",
      recordHeaders: true,
    }));
    app.get("/api/headers", (c) => c.json({ ok: true }));

    await app.handle(req("/api/headers", { headers: { "x-request-id": "123" } }));

    const spans = getSpans();
    const span = spans.find((s) => s.name === "GET");
    expect(span).toBeDefined();
    expect(span!.attributes["http.request.header.x-request-id"]).toBe("123");
  });

  it("records response headers when recordResponseHeaders is enabled", async () => {
    const app = new App();
    app.use("*", otel({
      serviceName: "test-service",
      recordResponseHeaders: true,
    }));
    app.get("/api/resp-headers", (_c) => {
      return new Response("ok", { headers: { "x-custom": "val" } });
    });

    await app.handle(req("/api/resp-headers"));

    const spans = getSpans();
    const span = spans.find((s) => s.name === "GET");
    expect(span).toBeDefined();
    expect(span!.attributes["http.response.header.x-custom"]).toBe("val");
  });

  it("propagates trace context from incoming headers", async () => {
    const app = new App();
    app.use("*", otel({ serviceName: "test-service" }));
    app.get("/api/propagated", (c) => c.json({ ok: true }));

    const traceId = "0af7651916cd43dd8448eb211c80319c";
    const spanId = "00f067aa0ba902b7";
    const traceparent = `00-${traceId}-${spanId}-01`;

    await app.handle(req("/api/propagated", { headers: { traceparent } }));

    const spans = getSpans();
    expect(spans.length).toBeGreaterThanOrEqual(1);
  });

  it("returns response correctly in tracing mode", async () => {
    const app = new App();
    app.use("*", otel({ serviceName: "test-service" }));
    app.get("/api/return", (c) => c.json({ data: 42 }));

    const res = await app.handle(req("/api/return"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ data: 42 });
  });

  it("records response body size when content-length is present", async () => {
    const app = new App();
    app.use("*", otel({ serviceName: "test-service" }));
    app.get("/api/sized", (_c) => {
      const body = '{"ok":true}';
      return new Response(body, {
        headers: { "content-type": "application/json", "content-length": String(body.length) },
      });
    });

    const res = await app.handle(req("/api/sized"));
    expect(res.status).toBe(200);

    const spans = getSpans();
    expect(spans.length).toBeGreaterThanOrEqual(1);
  });

  it("works in metrics-only mode (tracing disabled)", async () => {
    const app = new App();
    app.use("*", otel({ serviceName: "test-service", tracing: false }));
    app.get("/api/metrics-only", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/api/metrics-only"));
    expect(res.status).toBe(200);

    const spans = getSpans();
    expect(spans.length).toBe(0);
  });
});

describe("getSpan", () => {
  it("returns span from context when otel middleware is active", async () => {
    const app = new App();
    app.use("*", otel({ serviceName: "test-service" }));
    app.get("/api/span", (c) => {
      const span = getSpan(c);
      return c.json({ hasSpan: span !== undefined });
    });

    const res = await app.handle(req("/api/span"));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.hasSpan).toBe(true);
  });

  it("returns undefined when no otel middleware is active", async () => {
    const app = new App();
    app.get("/api/no-otel", (c) => {
      const span = getSpan(c);
      return c.json({ hasSpan: span !== undefined });
    });

    const res = await app.handle(req("/api/no-otel"));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.hasSpan).toBe(false);
  });

  it("allows setting attributes on the span", async () => {
    const app = new App();
    app.use("*", otel({ serviceName: "test-service" }));
    app.get("/api/attrs", (c) => {
      const span = getSpan(c);
      span?.setAttribute("custom.key", "custom-value");
      return c.json({ ok: true });
    });

    await app.handle(req("/api/attrs"));

    const spans = getSpans();
    const span = spans.find((s) => s.attributes["custom.key"] === "custom-value");
    expect(span).toBeDefined();
  });
});

describe("withSpan", () => {
  it("creates a child span and returns result", async () => {
    const result = await withSpan("test-operation", (span) => {
      span.setAttribute("test.key", "test-value");
      return 42;
    });
    expect(result).toBe(42);

    const spans = getSpans();
    const opSpan = spans.find((s) => s.name === "test-operation");
    expect(opSpan).toBeDefined();
    expect(opSpan!.attributes["test.key"]).toBe("test-value");
    expect(opSpan!.status.code).toBe(SpanStatusCode.OK);
  });

  it("records exceptions on error", async () => {
    await expect(
      withSpan("failing-op", async () => { throw new Error("op failed"); }),
    ).rejects.toThrow("op failed");

    const spans = getSpans();
    const failSpan = spans.find((s) => s.name === "failing-op");
    expect(failSpan).toBeDefined();
    expect(failSpan!.status.code).toBe(SpanStatusCode.ERROR);
    expect(failSpan!.status.message).toBe("op failed");
  });

  it("sets attributes from opts", async () => {
    await withSpan("attributed-op", () => {}, { attributes: { "db.system": "postgresql" } });

    const spans = getSpans();
    const span = spans.find((s) => s.name === "attributed-op");
    expect(span).toBeDefined();
    expect(span!.attributes["db.system"]).toBe("postgresql");
  });
});
