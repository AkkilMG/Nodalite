import { HttpError, type Middleware } from "@nodalite/core";

export interface ApiKeyStore {
  /** Validate a key and return its metadata, or null if invalid. */
  validate(key: string): Promise<{ id: string; metadata?: Record<string, unknown> } | null>;
}

export interface ApiKeyOptions {
  /** Where to extract the key from. Defaults to "header". */
  extractFrom?: "header" | "query" | "both";
  /** Header name to read. Defaults to "X-API-Key". */
  headerName?: string;
  /** Query param name to read. Defaults to "api_key". */
  queryParam?: string;
  /** The key store to validate against. Required. */
  store: ApiKeyStore;
  /** Context key to attach the validated key info. Defaults to "apiKey". */
  contextKey?: string;
}

/**
 * API key authentication middleware. Validates incoming API keys against
 * a pluggable store (in-memory for dev, Redis/database for production).
 *
 * ```ts
 * const store = new MemoryApiKeyStore();
 * store.add("my-secret-key", { plan: "pro" });
 *
 * app.use("/api/*", apiKey({ store }));
 * app.get("/api/data", (c) => {
 *   const key = c.get("apiKey");
 *   return c.json({ plan: key?.metadata?.plan });
 * });
 * ```
 */
export function apiKey(opts: ApiKeyOptions): Middleware {
  const extractFrom = opts.extractFrom ?? "header";
  const headerName = opts.headerName ?? "X-API-Key";
  const queryParam = opts.queryParam ?? "api_key";
  const contextKey = opts.contextKey ?? "apiKey";

  return async (c, next) => {
    let key: string | null = null;

    if (extractFrom === "header" || extractFrom === "both") {
      key = c.req.header(headerName.toLowerCase());
    }
    if (!key && (extractFrom === "query" || extractFrom === "both")) {
      key = c.req.query(queryParam);
    }

    if (!key) {
      throw HttpError.unauthorized("Missing API key");
    }

    const result = await opts.store.validate(key);
    if (!result) {
      throw HttpError.forbidden("Invalid API key");
    }

    c.set(contextKey as never, result as never);
    return next();
  };
}

/**
 * In-memory API key store. Suitable for development and single-process
 * deployments. For production with multiple instances, implement `ApiKeyStore`
 * against Redis, DynamoDB, etc.
 */
export class MemoryApiKeyStore implements ApiKeyStore {
  private keys = new Map<string, { id: string; metadata?: Record<string, unknown> }>();

  /** Register a key with optional metadata. */
  add(key: string, metadata?: Record<string, unknown>): void {
    this.keys.set(key, { id: key.slice(0, 8) + "...", metadata });
  }

  /** Remove a key. */
  remove(key: string): boolean {
    return this.keys.delete(key);
  }

  async validate(key: string): Promise<{ id: string; metadata?: Record<string, unknown> } | null> {
    return this.keys.get(key) ?? null;
  }

  /** Clear all keys and release resources. Call on graceful shutdown. */
  destroy() {
    this.keys.clear();
  }
}
