import type { TokenEntry } from "../types.js";
import type { TokenStore, SessionStore } from "./interface.js";

export class MemoryTokenStore implements TokenStore {
  private store = new Map<string, TokenEntry>();
  private families = new Map<string, Set<string>>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    this.cleanupTimer.unref?.();
  }

  async get(tokenId: string): Promise<TokenEntry | null> {
    const entry = this.store.get(tokenId);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.store.delete(tokenId);
      return null;
    }
    return { ...entry };
  }

  async set(tokenId: string, entry: TokenEntry, _ttlMs: number): Promise<void> {
    this.store.set(tokenId, { ...entry });
    const familySet = this.families.get(entry.family) ?? new Set<string>();
    familySet.add(tokenId);
    this.families.set(entry.family, familySet);
  }

  async delete(tokenId: string): Promise<void> {
    const entry = this.store.get(tokenId);
    if (entry) {
      const familySet = this.families.get(entry.family);
      familySet?.delete(tokenId);
    }
    this.store.delete(tokenId);
  }

  async revokeFamily(family: string): Promise<void> {
    const familySet = this.families.get(family);
    if (!familySet) return;
    for (const tokenId of familySet) {
      const entry = this.store.get(tokenId);
      if (entry) {
        entry.revoked = true;
        this.store.set(tokenId, entry);
      }
    }
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    for (const [id, entry] of this.store) {
      if (entry.expiresAt <= now) {
        this.store.delete(id);
        const familySet = this.families.get(entry.family);
        familySet?.delete(id);
      }
    }
  }

  destroy_(): void {
    clearInterval(this.cleanupTimer);
    this.store.clear();
    this.families.clear();
  }
}

export class MemorySessionStore implements SessionStore {
  private store = new Map<string, { data: Record<string, unknown>; expiresAt: number }>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    this.cleanupTimer.unref?.();
  }

  async get(id: string): Promise<Record<string, unknown> | null> {
    const entry = this.store.get(id);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.store.delete(id);
      return null;
    }
    return { ...entry.data };
  }

  async set(id: string, data: Record<string, unknown>, maxAge: number): Promise<void> {
    this.store.set(id, { data: { ...data }, expiresAt: Date.now() + maxAge * 1000 });
  }

  async destroy(id: string): Promise<void> {
    this.store.delete(id);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
  }

  destroy_(): void {
    clearInterval(this.cleanupTimer);
    this.store.clear();
  }
}
