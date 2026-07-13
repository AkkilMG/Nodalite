import type { Context } from "@nodalite/core";
import type { Meter, Histogram, Counter, UpDownCounter } from "@opentelemetry/api";

export interface OtelOptions {
  /** Service name for OTel resource. Defaults to "nodalite-app". */
  serviceName?: string;
  /** Enable tracing. Defaults to true. */
  tracing?: boolean;
  /** Enable metrics. Defaults to true. */
  metrics?: boolean;
  /** Record request headers as span attributes. Defaults to false. */
  recordHeaders?: boolean;
  /** Record response headers as span attributes. Defaults to false. */
  recordResponseHeaders?: boolean;
  /** Paths to skip instrumentation (e.g. health checks). */
  ignoredPaths?: string[];
  /** Custom span naming function. Defaults to just the HTTP method. */
  getSpanName?: (c: Context) => string;
}

export interface OtelMetrics {
  requestDuration: Histogram;
  activeRequests: UpDownCounter;
  requestCount: Counter;
  requestBodySize: Histogram;
  responseBodySize: Histogram;
  /** The underlying OTel Meter for creating custom instruments. */
  meter: Meter;
}
