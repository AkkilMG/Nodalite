import type Redis from "ioredis";
import type { TokenEntry } from "../types.js";
import type { TokenStore, SessionStore } from "./interface.js";

export interface RedisTokenStoreOptions {
  prefix?: string;
}

export class RedisTokenStore implements TokenStore {
  private prefix: string;

  constructor(private redis: Redis, opts?: RedisTokenStoreOptions) {
    this.prefix = opts?.prefix ?? "auth:token:";
  }

  private key(tokenId: string): string {
    return this.prefix + tokenId;
  }

  private familyKey(family: string): string {
    return this.prefix + "family:" + family;
  }

  async get(tokenId: string): Promise<TokenEntry | null> {
    const raw = await this.redis.get(this.key(tokenId));
    if (!raw) return null;
    return JSON.parse(raw) as TokenEntry;
  }

  async set(tokenId: string, entry: TokenEntry, ttlMs: number): Promise<void> {
    const ttlSec = Math.ceil(ttlMs / 1000);
    const pipeline = this.redis.pipeline();
    pipeline.set(this.key(tokenId), JSON.stringify(entry), "PX", ttlMs);
    pipeline.sadd(this.familyKey(entry.family), tokenId);
    pipeline.expire(this.familyKey(entry.family), ttlSec);
    await pipeline.exec();
  }

  async delete(tokenId: string): Promise<void> {
    const entry = await this.get(tokenId);
    if (entry) {
      const pipeline = this.redis.pipeline();
      pipeline.del(this.key(tokenId));
      pipeline.srem(this.familyKey(entry.family), tokenId);
      await pipeline.exec();
    }
  }

  async revokeFamily(family: string): Promise<void> {
    const tokenIds = await this.redis.smembers(this.familyKey(family));
    if (tokenIds.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const id of tokenIds) {
      const raw = await this.redis.get(this.key(id));
      if (raw) {
        const entry = JSON.parse(raw) as TokenEntry;
        entry.revoked = true;
        pipeline.set(this.key(id), JSON.stringify(entry), "PX", Math.max(1, entry.expiresAt - Date.now()));
      }
    }
    await pipeline.exec();
  }

  async cleanup(): Promise<void> {
    // Redis handles expiration via TTL; no-op.
  }
}

export interface RedisSessionStoreOptions {
  prefix?: string;
}

export class RedisSessionStore implements SessionStore {
  private prefix: string;

  constructor(private redis: Redis, opts?: RedisSessionStoreOptions) {
    this.prefix = opts?.prefix ?? "auth:session:";
  }

  async get(id: string): Promise<Record<string, unknown> | null> {
    const raw = await this.redis.get(this.prefix + id);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  }

  async set(id: string, data: Record<string, unknown>, maxAge: number): Promise<void> {
    await this.redis.set(this.prefix + id, JSON.stringify(data), "EX", maxAge);
  }

  async destroy(id: string): Promise<void> {
    await this.redis.del(this.prefix + id);
  }
}
