import { HttpError, type Middleware } from "@nodalite/core";

export interface RequestTimeoutOptions {
  /** Timeout in milliseconds. */
  ms: number;
  /** Custom rejection message. */
  message?: string;
}

/**
 * Enforces a per-request timeout using Promise.race. If the handler
 * chain doesn't complete within the specified duration, the request is
 * aborted and a 408 response is returned.
 *
 * ```ts
 * app.use("*", requestTimeout({ ms: 10_000 })); // 10 second timeout
 * ```
 */
export function requestTimeout(opts: RequestTimeoutOptions): Middleware {
  return async (c, next) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.ms);

    // Store abort signal on platform so handlers can use it
    (c.platform as Record<string, unknown>).__abortSignal = controller.signal;

    try {
      const res = await Promise.race([
        next(),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(HttpError.requestTimeout(opts.message ?? `Request timed out after ${opts.ms}ms`));
          }, { once: true });
        }),
      ]);
      return res;
    } finally {
      clearTimeout(timer);
    }
  };
}
