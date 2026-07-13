import type { WsMessage } from "./types.js";

/** Default heartbeat payload used when no custom payload is provided. */
const DEFAULT_PAYLOAD: WsMessage = '{"t":"ping"}';

/**
 * Manages heartbeat state for WebSocket connections.
 * Tracks which connections are alive and which have timed out.
 *
 * This class is a **pure state tracker** — it has no timers.
 * The WsServer owns the single heartbeat interval timer and
 * calls the appropriate methods in the correct order:
 *
 * 1. `getTimedOut()` — get connections that didn't respond since last cycle
 * 2. Terminate timed-out connections (adapter responsibility)
 * 3. Send pings to all tracked connections (adapter responsibility)
 * 4. `markAll()` — mark all as "needs ping" for the next cycle
 * 5. `markAlive(connId)` is called by the adapter when pong is received
 */
export class HeartbeatManager {
  private readonly _interval: number;
  private readonly _timeout: number;
  private readonly _payload: () => WsMessage;
  private _alive = new Map<string, boolean>();

  constructor(opts: { interval: number; timeout: number; payload?: () => WsMessage }) {
    this._interval = opts.interval;
    this._timeout = opts.timeout;
    this._payload = opts.payload ?? (() => DEFAULT_PAYLOAD);
  }

  /** Register a new connection for heartbeat tracking. */
  register(connId: string): void {
    this._alive.set(connId, true);
  }

  /** Mark a connection as alive (called when pong received). No-op if not registered. */
  markAlive(connId: string): void {
    if (this._alive.has(connId)) {
      this._alive.set(connId, true);
    }
  }

  /** Mark all current connections as needing a ping. */
  markAll(): void {
    for (const connId of this._alive.keys()) {
      this._alive.set(connId, false);
    }
  }

  /** Remove a connection from tracking. */
  unregister(connId: string): void {
    this._alive.delete(connId);
  }

  /** Get the heartbeat payload to send. */
  getPayload(): WsMessage {
    return this._payload();
  }

  /**
   * Get all connection IDs that have not responded within the timeout.
   * Call this **before** `markAll()` to get connections that timed out
   * from the previous cycle.
   */
  getTimedOut(): string[] {
    const timedOut: string[] = [];
    for (const [connId, isAlive] of this._alive) {
      if (!isAlive) timedOut.push(connId);
    }
    return timedOut;
  }

  /** Number of tracked connections. */
  get size(): number {
    return this._alive.size;
  }

  /** The configured interval in milliseconds between heartbeat pings. */
  get intervalMs(): number {
    return this._interval;
  }
}
