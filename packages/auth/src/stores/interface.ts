import type { TokenEntry } from "../types.js";

export interface TokenStore {
  get(tokenId: string): Promise<TokenEntry | null>;
  set(tokenId: string, entry: TokenEntry, ttlMs: number): Promise<void>;
  delete(tokenId: string): Promise<void>;
  /** Revoke all tokens in a family. */
  revokeFamily(family: string): Promise<void>;
  /** Clean up expired entries. */
  cleanup?(): Promise<void>;
}

export interface SessionStore {
  get(id: string): Promise<Record<string, unknown> | null>;
  set(id: string, data: Record<string, unknown>, maxAge: number): Promise<void>;
  destroy(id: string): Promise<void>;
}
