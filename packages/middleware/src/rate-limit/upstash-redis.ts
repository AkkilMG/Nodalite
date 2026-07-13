import type { Redis } from "@upstash/redis";
import type { RateLimitStore } from "../rate-limit.js";

export interface UpstashRedisRateLimitStoreOptions {
  /** `@upstash/redis` client instance. */
  client: Redis;
  /** Key prefix to avoid collisions with other keys. Defaults to `"rl:"`. */
  prefix?: string;
}

/**
 * Atomic Lua script for rate-limit increment (same logic as the ioredis store).
 *
 * Returns `[count, pttl]` where `pttl` is milliseconds until the key expires.
 */
const INCR_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`;

function isLuaResult(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

/**
 * Rate-limit store using [`@upstash/redis`](https://github.com/upstash/upstash-redis)
 * with an atomic Lua script.
 *
 * Unlike {@link UpstashRateLimitStore} which delegates window management to
 * `@upstash/ratelimit`, this store manages its own fixed-window counters
 * directly via Redis. This gives you full control over the window and avoids
 * the redundancy of configuring limits in two places.
 *
 * Requires Upstash Redis (or any Redis-compatible server that supports Lua
 * scripting).
 *
 * ```ts
 * import { Redis } from "@upstash/redis";
 * import { UpstashRedisRateLimitStore } from "@nodalite/middleware/rate-limit/upstash-redis";
 *
 * const redis = new Redis({
 *   url: process.env.UPSTASH_REDIS_REST_URL!,
 *   token: process.env.UPSTASH_REDIS_REST_TOKEN!,
 * });
 *
 * app.use(rateLimit({
 *   max: 100,
 *   windowMs: 60_000,
 *   store: new UpstashRedisRateLimitStore({ client: redis }),
 * }));
 * ```
 */
export class UpstashRedisRateLimitStore implements RateLimitStore {
  private client: Redis;
  private prefix: string;

  constructor(opts: UpstashRedisRateLimitStoreOptions) {
    if (!opts.client) throw new Error("UpstashRedisRateLimitStore: client is required");
    this.client = opts.client;
    this.prefix = opts.prefix ?? "rl:";
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetMs: number }> {
    if (windowMs <= 0) throw new Error("UpstashRedisRateLimitStore: windowMs must be positive");
    const fullKey = this.prefix + key;
    const result = await this.client.eval(INCR_SCRIPT, [fullKey], [String(windowMs)]);
    if (!isLuaResult(result)) {
      throw new Error("UpstashRedisRateLimitStore: unexpected response from Redis");
    }
    return {
      count: result[0],
      resetMs: result[1] > 0 ? result[1] : windowMs,
    };
  }

  /** No-op — Upstash manages its own HTTP connection. Provided for interface conformance. */
  async destroy(): Promise<void> {}
}
