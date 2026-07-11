import { HttpError, type Middleware } from "@nodalite/core";

export interface RateLimitStore {
  /** Increment the counter for `key` and return the new count plus ms until it resets. */
  increment(key: string, windowMs: number): Promise<{ count: number; resetMs: number }>;
}

/**
 * In-memory store. Fine for a single long-lived server/container process.
 * **Not sufficient on serverless**: each cold-started instance has its own
 * memory, so limits won't be enforced globally across concurrent function
 * invocations. For serverless/multi-instance deployments, implement
 * `RateLimitStore` against Redis, Upstash, DynamoDB, etc. — it's one method.
 *
 * Includes automatic periodic cleanup of expired entries to prevent
 * unbounded memory growth. Call `destroy()` on graceful shutdown to
 * release the timer.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private hits = new Map<string, { count: number; resetAt: number }>();
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(opts?: { cleanupIntervalMs?: number }) {
    // Periodic cleanup of expired entries — default every 60s
    const interval = opts?.cleanupIntervalMs ?? 60_000;
    if (interval > 0) {
      this.cleanupTimer = setInterval(() => this.cleanup(), interval);
      this.cleanupTimer.unref?.();
    }
  }

  async increment(key: string, windowMs: number) {
    const now = Date.now();
    const existing = this.hits.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      this.hits.set(key, { count: 1, resetAt });
      return { count: 1, resetMs: windowMs };
    }
    existing.count += 1;
    return { count: existing.count, resetMs: existing.resetAt - now };
  }

  /** Clean up expired entries to free memory. Called automatically on interval. */
  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
  }

  /** Release resources. Call this on graceful shutdown. */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.hits.clear();
  }
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** How to derive the bucket key per request. Defaults to client IP (from platform.ip or x-forwarded-for). */
  keyGenerator?: (c: Parameters<Middleware>[0]) => string;
  store?: RateLimitStore;
  message?: string;
}

export function rateLimit(opts: RateLimitOptions): Middleware {
  const store = opts.store ?? new MemoryRateLimitStore();
  const keyGenerator = opts.keyGenerator ?? defaultKeyGenerator;

  return async (c, next) => {
    const key = keyGenerator(c);
    const { count, resetMs } = await store.increment(key, opts.windowMs);

    if (count > opts.max) {
      const retryAfterSeconds = Math.ceil(resetMs / 1000);
      throw HttpError.tooManyRequests(opts.message ?? "Too many requests, please try again later.", retryAfterSeconds);
    }

    const res = await next();
    const headers = new Headers(res.headers);
    headers.set("x-ratelimit-limit", String(opts.max));
    headers.set("x-ratelimit-remaining", String(Math.max(0, opts.max - count)));
    headers.set("x-ratelimit-reset", String(Math.ceil(resetMs / 1000)));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}

function defaultKeyGenerator(c: Parameters<Middleware>[0]): string {
  const platformIp = (c.platform as { ip?: string }).ip;
  return platformIp ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
