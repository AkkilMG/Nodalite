import { metrics as otelMetrics } from "@opentelemetry/api";
import type { OtelMetrics } from "./types.js";

export interface CreateMetricsOptions {
  /** Service name. Defaults to "nodalite-app". */
  serviceName?: string;
}

/**
 * Create OTel metric instruments for HTTP server observability.
 * Use this when you need custom metrics beyond what the `otel()` middleware provides.
 *
 * ```ts
 * import { createMetrics } from "@nodalite/otel";
 * const metrics = createMetrics({ serviceName: "my-api" });
 *
 * app.get("/api/jobs", async (c) => {
 *   metrics.jobsProcessed.add(1, { status: "success" });
 *   return c.json({ ok: true });
 * });
 * ```
 */
export function createMetrics(opts: CreateMetricsOptions = {}): OtelMetrics {
  const serviceName = opts.serviceName ?? "nodalite-app";
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
