import { trace, context, SpanStatusCode } from "@opentelemetry/api";
import type { Span } from "@opentelemetry/api";
import type { Context } from "@nodalite/core";
import { SPAN_KEY } from "./middleware.js";

/**
 * Retrieve the current OTel span from the Nodalite context.
 * Returns undefined if no `otel()` middleware is active or no span exists.
 *
 * ```ts
 * app.get("/api/data", async (c) => {
 *   const span = getSpan(c);
 *   span?.setAttribute("custom.key", "value");
 *   return c.json({ ok: true });
 * });
 * ```
 */
export function getSpan(c: Context): Span | undefined {
  return c.get(SPAN_KEY as never) as Span | undefined;
}

export interface WithSpanOptions {
  /** Attributes to set on the span at creation time. */
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Execute a function within a new child span. The span is automatically ended
 * when the function completes, and exceptions are recorded.
 *
 * ```ts
 * app.get("/api/users/:id", async (c) => {
 *   return withSpan("db-query", async (span) => {
 *     const user = await db.findUser(c.req.param("id"));
 *     span.setAttribute("db.system", "postgresql");
 *     return c.json(user);
 *   });
 * });
 * ```
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  opts?: WithSpanOptions,
): Promise<T> {
  const tracer = trace.getTracer("nodalite-app");
  const parentContext = context.active();

  const span = tracer.startSpan(name, {
    attributes: opts?.attributes,
  }, parentContext);

  try {
    const result = await context.with(trace.setSpan(parentContext, span), () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : "Unknown error",
    });
    span.recordException(err instanceof Error ? err : new Error(String(err)));
    throw err;
  } finally {
    span.end();
  }
}
