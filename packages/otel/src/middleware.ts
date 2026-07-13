import { trace, context, propagation, SpanStatusCode, SpanKind, metrics as otelMetrics } from "@opentelemetry/api";
import type { Middleware } from "@nodalite/core";
import type { OtelOptions, OtelMetrics } from "./types.js";

const SPAN_KEY = "__otel_span" as const;

function createInstruments(serviceName: string): OtelMetrics {
  const meter = otelMetrics.getMeter(serviceName);

  return {
    meter,
    requestDuration: meter.createHistogram("http.server.request.duration", {
      unit: "ms",
      description: "Duration of HTTP server requests",
    }),
    activeRequests: meter.createUpDownCounter("http.server.active_requests", {
      description: "Number of active HTTP server requests",
    }),
    requestCount: meter.createCounter("http.server.request.count", {
      description: "Total number of HTTP server requests",
    }),
    requestBodySize: meter.createHistogram("http.server.request.body.size", {
      unit: "By",
      description: "Size of HTTP server request bodies",
    }),
    responseBodySize: meter.createHistogram("http.server.response.body.size", {
      unit: "By",
      description: "Size of HTTP server response bodies",
    }),
  };
}

/**
 * OpenTelemetry middleware for Nodalite. Creates HTTP server spans and records
 * metrics for every request. Works across all runtimes (Node, Lambda, Edge).
 *
 * Requires `@opentelemetry/api` (included as a dependency) and a configured
 * OTel SDK (user's responsibility) to export spans and metrics.
 *
 * ```ts
 * import { otel } from "@nodalite/otel";
 * app.use("*", otel({ serviceName: "my-api" }));
 * ```
 */
export function otel(opts: OtelOptions = {}): Middleware {
  const serviceName = opts.serviceName ?? "nodalite-app";
  const enableTracing = opts.tracing !== false;
  const enableMetrics = opts.metrics !== false;
  const ignoredPaths = new Set(opts.ignoredPaths ?? []);

  const tracer = enableTracing ? trace.getTracer(serviceName) : null;
  const instruments = enableMetrics ? createInstruments(serviceName) : null;

  return async (c, next) => {
    const pathname = c.req.url.pathname;

    // Skip instrumentation for ignored paths
    if (ignoredPaths.has(pathname)) {
      return next();
    }

    const method = c.req.method;
    const startTime = performance.now();

    // Extract incoming trace context from headers
    const incomingHeaders: Record<string, string> = {};
    c.req.raw.headers.forEach((value, key) => {
      incomingHeaders[key.toLowerCase()] = value;
    });
    const extractedContext = propagation.extract(context.active(), incomingHeaders);

    // Track active requests
    instruments?.activeRequests.add(1, { "http.request.method": method });

    if (!tracer) {
      // Metrics-only mode (no tracing)
      try {
        const res = await next();
        const duration = performance.now() - startTime;
        const route = c.req.url.pathname;
        instruments?.requestCount.add(1, { "http.request.method": method, "http.route": route });
        instruments?.requestDuration.record(duration, {
          "http.request.method": method,
          "http.response.status_code": res.status,
          "http.route": route,
        });
        recordResponseBodySize(instruments, res, method, route);
        return res;
      } catch (err) {
        instruments?.requestCount.add(1, { "http.request.method": method, "http.route": pathname });
        instruments?.requestDuration.record(performance.now() - startTime, {
          "http.request.method": method,
          "http.response.status_code": 500,
          "http.route": pathname,
        });
        throw err;
      } finally {
        instruments?.activeRequests.add(-1, { "http.request.method": method });
      }
    }

    // Create span within the extracted context
    return context.with(extractedContext, async () => {
      const spanName = opts.getSpanName?.(c) ?? method;
      const span = tracer.startSpan(spanName, {
        kind: SpanKind.SERVER,
        attributes: {
          "http.request.method": method,
          "url.full": c.req.url.toString(),
          "url.path": pathname,
          "url.scheme": c.req.url.protocol.replace(":", ""),
          "server.address": c.req.url.hostname,
          "server.port": Number(c.req.url.port) || (c.req.url.protocol === "https:" ? 443 : 80),
        },
      });

      // Store span in context for downstream use
      c.set(SPAN_KEY as never, span as never);

      // Optionally record request headers
      if (opts.recordHeaders) {
        for (const [key, value] of Object.entries(incomingHeaders)) {
          span.setAttribute(`http.request.header.${key}`, value);
        }
      }

      try {
        const res = await next();
        const duration = performance.now() - startTime;
        const route = c.req.url.pathname;
        const statusCode = res.status;

        span.setAttribute("http.response.status_code", statusCode);
        span.setStatus({
          code: statusCode < 400 ? SpanStatusCode.OK : SpanStatusCode.ERROR,
        });

        // Record metrics
        instruments?.requestCount.add(1, { "http.request.method": method, "http.route": route });
        instruments?.requestDuration.record(duration, {
          "http.request.method": method,
          "http.response.status_code": statusCode,
          "http.route": route,
        });
        recordResponseBodySize(instruments, res, method, route);

        // Optionally record response headers
        if (opts.recordResponseHeaders) {
          res.headers.forEach((value, key) => {
            span.setAttribute(`http.response.header.${key}`, value);
          });
        }

        return res;
      } catch (err) {
        const duration = performance.now() - startTime;

        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : "Unknown error",
        });
        span.recordException(err instanceof Error ? err : new Error(String(err)));

        instruments?.requestCount.add(1, { "http.request.method": method, "http.route": pathname });
        instruments?.requestDuration.record(duration, {
          "http.request.method": method,
          "http.response.status_code": 500,
          "http.route": pathname,
        });

        throw err;
      } finally {
        instruments?.activeRequests.add(-1, { "http.request.method": method });
        span.end();
      }
    });
  };
}

function recordResponseBodySize(
  instruments: OtelMetrics | null,
  res: Response,
  method: string,
  route: string,
): void {
  if (!instruments) return;
  const contentLength = res.headers.get("content-length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size)) {
      instruments.responseBodySize.record(size, {
        "http.request.method": method,
        "http.response.status_code": res.status,
        "http.route": route,
      });
    }
  }
}

export { SPAN_KEY };
