/**
 * Connection store interface for Lambda WebSocket adapters.
 *
 * Since Lambda functions are stateless, all connection state must be
 * stored externally. Implement this interface for your preferred
 * storage backend (DynamoDB, Redis, Postgres, etc.).
 */
export interface ConnectionStore {
  /** Store a new connection with its metadata. */
  set(connectionId: string, metadata: ConnectionMetadata): Promise<void>;
  /** Retrieve connection metadata by connection ID. */
  get(connectionId: string): Promise<ConnectionMetadata | null>;
  /** Remove a connection from the store. */
  delete(connectionId: string): Promise<void>;
  /** Find connections by a metadata field value (e.g., `{ userId: "123" })`. */
  findBy(key: string, value: unknown): Promise<ConnectionMetadata[]>;
  /** Remove stale connections older than the given age (ms). Returns count removed. */
  cleanup?(olderThanMs: number): Promise<number>;
}

/** Metadata stored for each WebSocket connection. */
export interface ConnectionMetadata {
  connectionId: string;
  connectedAt: number;
  /** Arbitrary metadata (userId, rooms, custom data, etc.). */
  data?: Record<string, unknown>;
}
