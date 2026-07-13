import type Redis from "ioredis";
import type { RateLimitStore } from "../rate-limit.js";

export interface RedisRateLimitStoreOptions {
  /** ioredis client instance. */
  client: Redis;
  /** Key prefix to avoid collisions with other Redis keys. Defaults to `"rl:"`. */
  prefix?: string;
}

/**
 * Atomic Lua script for rate-limit increment.
 *
 * - First call for a key: creates the key with value 1 and sets a PX expiry.
 * - Subsequent calls: atomically increments and reads the remaining TTL.
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
 * Redis-backed rate-limit store using [ioredis](https://github.com/redis/ioredis).
 *
 * Uses an atomic Lua script (INCR + conditional PEXPIRE + PTTL) to guarantee
 * correct counting without race conditions, even under concurrent requests.
 *
 * Requires a running Redis server (>= 2.6 for Lua scripting).
 *
 * ```ts
 * import Redis from "ioredis";
 * import { RedisRateLimitStore } from "@nodalite/middleware/rate-limit/redis";
 *
 * const redis = new Redis(process.env.REDIS_URL!);
 * app.use(rateLimit({
 *   max: 100,
 *   windowMs: 60_000,
 *   store: new RedisRateLimitStore({ client: redis }),
 * }));
 * ```
 */
export class RedisRateLimitStore implements RateLimitStore {
  private client: Redis;
  private prefix: string;

  constructor(opts: RedisRateLimitStoreOptions) {
    if (!opts.client) throw new Error("RedisRateLimitStore: client is required");
    this.client = opts.client;
    this.prefix = opts.prefix ?? "rl:";
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetMs: number }> {
    if (windowMs <= 0) throw new Error("RedisRateLimitStore: windowMs must be positive");
    const fullKey = this.prefix + key;
    const result = await this.client.eval(INCR_SCRIPT, 1, fullKey, String(windowMs));
    if (!isLuaResult(result)) {
      throw new Error("RedisRateLimitStore: unexpected response from Redis");
    }
    return {
      count: result[0],
      resetMs: result[1] > 0 ? result[1] : windowMs,
    };
  }

  /** Gracefully close the Redis connection. Call on shutdown. */
  async destroy(): Promise<void> {
    await this.client.quit();
  }
}
