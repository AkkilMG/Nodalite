import type { Ratelimit } from "@upstash/ratelimit";
import type { RateLimitStore } from "../rate-limit.js";

export interface UpstashRateLimitStoreOptions {
  /** A pre-configured `@upstash/ratelimit` `Ratelimit` instance. */
  client: Ratelimit;
}

/**
 * Rate-limit store that wraps
 * [`@upstash/ratelimit`](https://github.com/upstash/ratelimit).
 *
 * `@upstash/ratelimit` manages its own sliding-window counters and expiry.
 * The `windowMs` parameter passed to `increment()` is intentionally ignored —
 * configure the window via the `Ratelimit` constructor's `limiter` option
 * instead (e.g. `Ratelimit.slidingWindow(100, "60 s")`).
 *
 * The `max` value passed to `rateLimit()` should match the limit configured
 * in the `Ratelimit` constructor so that the middleware's limit check stays
 * consistent.
 *
 * ```ts
 * import { Ratelimit } from "@upstash/ratelimit";
 * import { Redis } from "@upstash/redis";
 * import { UpstashRateLimitStore } from "@nodalite/middleware/rate-limit/upstash";
 *
 * const ratelimit = new Ratelimit({
 *   redis: new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! }),
 *   limiter: Ratelimit.slidingWindow(100, "60 s"),
 * });
 *
 * app.use(rateLimit({
 *   max: 100,          // must match the Ratelimit's configured limit
 *   windowMs: 60_000,  // informational only — Upstash manages its own window
 *   store: new UpstashRateLimitStore({ client: ratelimit }),
 * }));
 * ```
 */
export class UpstashRateLimitStore implements RateLimitStore {
  private ratelimit: Ratelimit;

  constructor(opts: UpstashRateLimitStoreOptions) {
    if (!opts.client) throw new Error("UpstashRateLimitStore: client is required");
    this.ratelimit = opts.client;
  }

  async increment(key: string, _windowMs: number): Promise<{ count: number; resetMs: number }> {
    const result = await this.ratelimit.limit(key);
    const count = result.limit - result.remaining;
    const resetMs = Math.max(0, result.reset - Date.now());
    return { count, resetMs };
  }

  /** No-op — Upstash manages its own HTTP connection. Provided for interface conformance. */
  async destroy(): Promise<void> {}
}
