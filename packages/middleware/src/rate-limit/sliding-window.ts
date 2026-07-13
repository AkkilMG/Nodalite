import type Redis from "ioredis";
import type { RateLimitStore } from "../rate-limit.js";

export interface RedisSlidingWindowRateLimitStoreOptions {
  /** ioredis client instance. */
  client: Redis;
  /** Key prefix to avoid collisions with other Redis keys. Defaults to `"rl:sw:"`. */
  prefix?: string;
}

/**
 * Atomic Lua script for sliding-window rate-limit increment.
 *
 * Uses a sorted set where scores are timestamps in milliseconds:
 * 1. Remove all entries outside the current window.
 * 2. Add the current request timestamp.
 * 3. Count remaining entries in the window.
 * 4. Set TTL on the key for automatic cleanup.
 *
 * Returns `[count, windowEnd]` where `windowEnd` is the epoch ms when the
 * oldest allowed request expires.
 */
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local windowMs = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local windowStart = now - windowMs

redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
redis.call('ZADD', key, now, now .. '-' .. math.random(1000000))
redis.call('PEXPIRE', key, windowMs)

local count = redis.call('ZCARD', key)
local windowEnd = now + windowMs
return {count, windowEnd}
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
 * Sliding-window rate-limit store using [ioredis](https://github.com/redis/ioredis)
 * sorted sets.
 *
 * More accurate than fixed-window stores because it counts requests within a
 * true rolling window. For example, a 60-second window will count all requests
 * from `now - 60s` to `now`, avoiding the "boundary problem" where requests at
 * the end/start of adjacent fixed windows can double the effective rate.
 *
 * **Trade-off:** Uses more Redis memory than the fixed-window
 * {@link RedisRateLimitStore} because each request is stored as a separate
 * sorted-set entry (vs. a single counter). Suitable for high-value rate limits
 * where accuracy matters more than memory.
 *
 * Requires a running Redis server (>= 2.6 for Lua scripting).
 *
 * ```ts
 * import Redis from "ioredis";
 * import { RedisSlidingWindowRateLimitStore } from "@nodalite/middleware/rate-limit/sliding-window";
 *
 * const redis = new Redis(process.env.REDIS_URL!);
 * app.use(rateLimit({
 *   max: 100,
 *   windowMs: 60_000,
 *   store: new RedisSlidingWindowRateLimitStore({ client: redis }),
 * }));
 * ```
 */
export class RedisSlidingWindowRateLimitStore implements RateLimitStore {
  private client: Redis;
  private prefix: string;

  constructor(opts: RedisSlidingWindowRateLimitStoreOptions) {
    if (!opts.client) throw new Error("RedisSlidingWindowRateLimitStore: client is required");
    this.client = opts.client;
    this.prefix = opts.prefix ?? "rl:sw:";
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetMs: number }> {
    if (windowMs <= 0) throw new Error("RedisSlidingWindowRateLimitStore: windowMs must be positive");
    const fullKey = this.prefix + key;
    const now = Date.now();
    const result = await this.client.eval(SLIDING_WINDOW_SCRIPT, 1, fullKey, String(windowMs), String(now));
    if (!isLuaResult(result)) {
      throw new Error("RedisSlidingWindowRateLimitStore: unexpected response from Redis");
    }
    const count = result[0];
    const windowEnd = result[1];
    return {
      count,
      resetMs: Math.max(0, windowEnd - now),
    };
  }

  /** Gracefully close the Redis connection. Call on shutdown. */
  async destroy(): Promise<void> {
    await this.client.quit();
  }
}
