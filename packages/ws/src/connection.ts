import { RoomManager } from "./rooms.js";
import { WsBroadcaster } from "./broadcaster.js";
import type { WsMessage, WsPlatform } from "./types.js";

/**
 * Generate a unique ID without requiring Node.js-specific APIs.
 * Uses the Web Crypto API (available in Node 19+, CF Workers, Deno, Bun, browsers)
 * with a Math.random fallback for older Node versions.
 */
function generateId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * A unified wrapper around a native WebSocket connection.
 *
 * Provides room management, typed per-connection state, and a
 * consistent API across all runtimes. Adapters set the underlying
 * native socket via `_setRaw()` and map runtime events to the
 * WsServer lifecycle methods.
 */
export class WsConnection<Env extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  readonly request: Request;
  readonly remoteAddress: string;
  readonly connectedAt: number;
  readonly platform: WsPlatform;

  private _protocol: string | undefined;
  private _raw: unknown;
  private _open = true;
  private _closed = false;
  private _store = new Map<string, unknown>();
  private _roomManager: RoomManager;
  /** @internal */ _sendFn: ((data: WsMessage) => void) | undefined;
  /** @internal */ _closeFn: ((code?: number, reason?: string) => void) | undefined;

  constructor(opts: {
    id?: string;
    request: Request;
    remoteAddress: string;
    platform: WsPlatform;
    roomManager: RoomManager;
    protocol?: string;
  }) {
    this.id = opts.id ?? generateId();
    this.request = opts.request;
    this.remoteAddress = opts.remoteAddress;
    this.platform = opts.platform;
    this._protocol = opts.protocol;
    this._roomManager = opts.roomManager;
    this.connectedAt = Date.now();
  }

  get protocol(): string | undefined {
    return this._protocol;
  }

  get rooms(): ReadonlySet<string> {
    return this._roomManager.getConnRooms(this.id);
  }

  get isOpen(): boolean {
    return this._open && !this._closed;
  }

  /** Set a value for this connection's per-connection state. */
  set<K extends keyof Env>(key: K, value: Env[K]): void {
    this._store.set(key as string, value);
  }

  /** Get a value from this connection's per-connection state. */
  get<K extends keyof Env>(key: K): Env[K] | undefined {
    return this._store.get(key as string) as Env[K] | undefined;
  }

  /** Send a message to this client. */
  send(data: WsMessage): void {
    if (!this.isOpen) return;
    this._sendFn?.(data);
  }

  /** Close the connection with an optional code and reason. */
  close(code?: number, reason?: string): void {
    if (this._closed) return;
    this._closed = true;
    this._open = false;
    this._closeFn?.(code, reason);
  }

  /** Join one or more rooms. */
  join(...roomNames: string[]): this {
    this._roomManager.join(this.id, ...roomNames);
    return this;
  }

  /** Leave one or more rooms. */
  leave(...roomNames: string[]): this {
    this._roomManager.leave(this.id, ...roomNames);
    return this;
  }

  /** Check if this connection is in a room. */
  isJoined(room: string): boolean {
    return this._roomManager.getConnRooms(this.id).has(room);
  }

  /**
   * Get a broadcaster scoped to specific rooms.
   *
   * ```ts
   * conn.to('chat:general').emit('hello');
   * ```
   */
  to(...roomNames: string[]): WsBroadcaster {
    // Collect unique connection IDs from the target rooms, excluding self.
    const getTargets = (): IterableIterator<string> => {
      const seen = new Set<string>();
      for (const room of roomNames) {
        for (const connId of this._roomManager.get(room)) {
          if (connId !== this.id) seen.add(connId);
        }
      }
      return seen.values();
    };

    return new WsBroadcaster(getTargets, (connId, data) => {
      this._broadcasterSendFn?.(connId, data);
    });
  }

  /** @internal */ _broadcasterSendFn?: (connId: string, data: WsMessage) => void;

  /** Broadcast to all connected clients except this one. */
  broadcast(data: WsMessage): void {
    this._broadcastFn?.(this.id, data);
  }

  /** @internal */ _broadcastFn?: (excludeId: string, data: WsMessage) => void;

  /** @internal Set the native WebSocket object. */
  _setRaw(raw: unknown): void {
    this._raw = raw;
  }

  /** @internal Get the native WebSocket object. */
  _getRaw<T>(): T {
    return this._raw as T;
  }

  /** @internal Mark the connection as closed (called by adapter). */
  _markClosed(): void {
    this._open = false;
    this._closed = true;
  }
}
