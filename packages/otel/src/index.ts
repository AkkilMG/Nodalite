// Middleware
export { otel, SPAN_KEY } from "./middleware.js";

// Span helpers
export { withSpan, getSpan, type WithSpanOptions } from "./span.js";

// Metrics
export { createMetrics, type CreateMetricsOptions } from "./metrics.js";

// Types
export type { OtelOptions, OtelMetrics } from "./types.js";
