import { WsConnection } from "./connection.js";
import { RoomManager } from "./rooms.js";
import { HeartbeatManager } from "./heartbeat.js";
import { WsBroadcaster } from "./broadcaster.js";
import type { WsServerOptions, WsHandlerSet, WsMiddleware, WsMessage, WsPlatform } from "./types.js";

/**
 * Runtime-agnostic WebSocket server.
 *
 * Manages connections, rooms, heartbeat, and path-based routing.
 * Adapters (Node, edge, Lambda) call the internal `_handle*` methods
 * to bridge native runtime events into this server's lifecycle.
 *
 * ```ts
 * const ws = new WsServer();
 * ws.path('/chat', {
 *   open(conn) { conn.join('general'); },
 *   message(conn, data) { conn.to('general').emit(data); },
 *   close(conn) { /* cleanup *\/ },
 * });
 * ```
 */
export class WsServer<Env extends Record<string, unknown> = Record<string, unknown>> {
  /** @internal */ _connections = new Map<string, WsConnection<Env>>();
  /** @internal */ _rooms = new RoomManager();
  /** @internal */ _heartbeat: HeartbeatManager | undefined;
  /** @internal */ _paths = new Map<string, WsHandlerSet<Env>>();
  /** @internal */ _globalHandlers: WsHandlerSet<Env> = {};
  private _middlewares: WsMiddleware<Env>[] = [];
  private _maxPayload: number;
  private _maxConnections: number;
  private _allowedOrigins?: string[] | ((origin: string) => boolean);
  private _heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  constructor(opts: WsServerOptions = {}) {
    this._maxPayload = opts.maxPayload ?? 1_048_576;
    this._maxConnections = opts.maxConnections ?? 0;
    this._allowedOrigins = opts.allowedOrigins;

    if (opts.heartbeat !== false) {
      this._heartbeat = new HeartbeatManager({
        interval: opts.heartbeat?.interval ?? 30_000,
        timeout: opts.heartbeat?.timeout ?? 10_000,
        payload: opts.heartbeat?.payload,
      });
    }
  }

  /** Register a handler for a specific WebSocket path. */
  path(pattern: string, handlers: WsHandlerSet<Env>): this {
    this._paths.set(pattern, handlers);
    return this;
  }

  /** Register a global event handler (runs for all paths). */
  on(event: "connection", handler: (conn: WsConnection<Env>) => void | Promise<void>): this;
  on(event: "error", handler: (error: Error, conn?: WsConnection<Env>) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (...args: any[]) => void): this {
    if (event === "connection") {
      const h = handler as (conn: WsConnection<Env>) => void | Promise<void>;
      this._globalHandlers.open = h;
    } else if (event === "error") {
      const h = handler as (error: Error, conn?: WsConnection<Env>) => void;
      this._globalHandlers.error = (conn, error) => {
        h(error, conn);
      };
    }
    return this;
  }

  /** Register a message middleware (runs on every message for all paths). */
  use(middleware: WsMiddleware<Env>): this {
    this._middlewares.push(middleware);
    return this;
  }

  /** All active connections. */
  get connections(): ReadonlySet<WsConnection<Env>> {
    return new Set(this._connections.values());
  }

  /** Get a connection by ID. */
  getConnection(id: string): WsConnection<Env> | undefined {
    return this._connections.get(id);
  }

  /** Get all connections in a room. */
  getRoom(room: string): ReadonlySet<WsConnection<Env>> {
    const ids = this._rooms.get(room);
    const result = new Set<WsConnection<Env>>();
    for (const id of ids) {
      const conn = this._connections.get(id);
      if (conn) result.add(conn);
    }
    return result;
  }

  /** Broadcast a message to all connected clients. */
  broadcast(data: WsMessage): void {
    for (const conn of this._connections.values()) {
      conn.send(data);
    }
  }

  /** Get a broadcaster scoped to a specific room. */
  toRoom(room: string): WsBroadcaster {
    return new WsBroadcaster(
      () => this._rooms.get(room).values(),
      (connId, data) => {
        this._connections.get(connId)?.send(data);
      },
    );
  }

  /** Number of active connections. */
  get size(): number {
    return this._connections.size;
  }

  /**
   * @internal Find the handler set for a pathname (supports exact match + wildcard patterns).
   * Returns `undefined` if no handler is registered for the path.
   */
  _findHandler(pathname: string): WsHandlerSet<Env> | undefined {
    let handlerSet = this._paths.get(pathname);
    if (!handlerSet) {
      for (const [pattern, h] of this._paths) {
        if (pattern.endsWith("*") && pathname.startsWith(pattern.slice(0, -1))) {
          handlerSet = h;
          break;
        }
      }
    }
    return handlerSet;
  }

  /**
   * @internal Check if any registered path pattern matches the given pathname.
   */
  _matchesPath(pathname: string): boolean {
    for (const pattern of this._paths.keys()) {
      if (pattern.endsWith("*")) {
        const prefix = pattern.slice(0, -1);
        if (pathname.startsWith(prefix)) return true;
      } else {
        if (pathname === pattern) return true;
      }
    }
    return false;
  }

  /**
   * @internal Wire up a WsConnection with lifecycle handlers and register it.
   * Called by adapters after creating the connection.
   */
  _bridgeConnection(
    conn: WsConnection<Env>,
    opts: {
      send: (data: WsMessage) => void;
      close: (code?: number, reason?: string) => void;
    },
  ): void {
    conn._sendFn = opts.send;
    conn._closeFn = opts.close;
    conn._broadcasterSendFn = (connId, data) => {
      this.getConnection(connId)?.send(data);
    };
    conn._broadcastFn = (excludeId, data) => {
      for (const [id, c] of this._connections) {
        if (id !== excludeId) c.send(data);
      }
    };
    this._connections.set(conn.id, conn);

    if (this._heartbeat) {
      this._heartbeat.register(conn.id);
      this._ensureHeartbeatRunning();
    }
  }

  /**
   * @internal Run open handlers (global + path-scoped) for a connection.
   */
  async _runOpenHandlers(conn: WsConnection<Env>): Promise<void> {
    const url = new URL(conn.request.url);
    const handlerSet = this._findHandler(url.pathname);
    try {
      await this._globalHandlers.open?.(conn);
      await handlerSet?.open?.(conn);
    } catch (err) {
      this._handleError(conn, err instanceof Error ? err : new Error(String(err)));
    }
  }

  /** @internal Check if the origin is allowed. */
  _isOriginAllowed(origin: string | null): boolean {
    if (!origin) return true;
    if (!this._allowedOrigins) return true;
    if (typeof this._allowedOrigins === "function") return this._allowedOrigins(origin);
    return this._allowedOrigins.includes(origin);
  }

  /**
   * @internal Validate whether a new upgrade should be accepted.
   * Returns `null` if ok, or a `Response` to send back as rejection.
   */
  _validateUpgrade(request: Request): Response | null {
    if (this._maxConnections > 0 && this._connections.size >= this._maxConnections) {
      return new Response(null, { status: 429, statusText: "Too Many Connections" });
    }
    const origin = request.headers.get("origin");
    if (!this._isOriginAllowed(origin)) {
      return new Response(null, { status: 403, statusText: "Forbidden" });
    }
    return null;
  }

  /** @internal Get the max payload size. */
  _getMaxPayload(): number {
    return this._maxPayload;
  }

  /**
   * @internal Called by adapters when a WebSocket upgrade is requested.
   */
  _handleUpgrade(
    request: Request,
    upgradeFn: (response: Response | null) => void,
    platform?: WsPlatform,
  ): void {
    if (this._maxConnections > 0 && this._connections.size >= this._maxConnections) {
      upgradeFn(new Response(null, { status: 429, statusText: "Too Many Connections" }));
      return;
    }

    const origin = request.headers.get("origin");
    if (!this._isOriginAllowed(origin)) {
      upgradeFn(new Response(null, { status: 403, statusText: "Forbidden" }));
      return;
    }

    const url = new URL(request.url);
    const handlerSet = this._findHandler(url.pathname);

    const conn = new WsConnection<Env>({
      request,
      remoteAddress: platform?.ip ?? "unknown",
      platform: platform ?? { runtime: "unknown" },
      roomManager: this._rooms,
    });

    conn._broadcastFn = (excludeId, data) => {
      for (const [id, c] of this._connections) {
        if (id !== excludeId) c.send(data);
      }
    };

    if (this._heartbeat) {
      this._heartbeat.register(conn.id);
      this._ensureHeartbeatRunning();
    }

    this._connections.set(conn.id, conn);

    upgradeFn(null);

    const runOpen = async (): Promise<void> => {
      try {
        await this._globalHandlers.open?.(conn);
        await handlerSet?.open?.(conn);
      } catch (err) {
        this._handleError(conn, err instanceof Error ? err : new Error(String(err)));
      }
    };
    runOpen();
  }

  /**
   * @internal Called by adapters when a message is received.
   */
  _handleMessage(conn: WsConnection<Env>, data: WsMessage, isBinary: boolean): void {
    if (!conn.isOpen) return;

    const byteLength =
      typeof data === "string" ? new TextEncoder().encode(data).byteLength : data.byteLength;
    if (byteLength > this._maxPayload) {
      conn.close(1009, "Message too large");
      return;
    }

    const url = new URL(conn.request.url);
    const handlerSet = this._findHandler(url.pathname);

    const finalHandler = (): void => {
      const result = handlerSet?.message?.(conn, data, isBinary);
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch((err: unknown) => {
          this._handleError(conn, err instanceof Error ? err : new Error(String(err)));
        });
      }
    };

    if (this._middlewares.length > 0) {
      let idx = 0;
      const next = (): void | Promise<void> => {
        if (idx >= this._middlewares.length) {
          finalHandler();
          return;
        }
        const mw = this._middlewares[idx++]!;
        return mw(conn, data, next);
      };
      const result = next();
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch((err: unknown) => {
          this._handleError(conn, err instanceof Error ? err : new Error(String(err)));
        });
      }
    } else {
      finalHandler();
    }
  }

  /**
   * @internal Called by adapters when a connection closes.
   */
  _handleClose(conn: WsConnection<Env>, code: number, reason: string): void {
    this._heartbeat?.unregister(conn.id);
    this._rooms.leaveAll(conn.id);
    conn._markClosed();
    this._connections.delete(conn.id);

    if (this._heartbeat && this._connections.size === 0) {
      this._stopHeartbeatTimer();
    }

    const url = new URL(conn.request.url);
    const handlerSet = this._findHandler(url.pathname);

    const result = handlerSet?.close?.(conn, code, reason);
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch((err: unknown) => {
        this._handleError(conn, err instanceof Error ? err : new Error(String(err)));
      });
    }
  }

  /**
   * @internal Called by adapters when a connection error occurs.
   */
  _handleError(conn: WsConnection<Env>, error: Error): void {
    const url = new URL(conn.request.url);
    const handlerSet = this._findHandler(url.pathname);

    handlerSet?.error?.(conn, error);
    this._globalHandlers.error?.(conn, error);
  }

  /** @internal Mark a connection as alive (pong received). */
  _markAlive(connId: string): void {
    this._heartbeat?.markAlive(connId);
  }

  /**
   * @internal Start the centralized heartbeat timer.
   *
   * The timer implements the correct heartbeat cycle:
   * 1. Get timed-out connections from the previous cycle
   * 2. Terminate them via the onTimedOut callback
   * 3. Send pings to all tracked connections (via onPing or conn.send with payload)
   * 4. Mark all connections as "needs ping" for the next cycle
   *
   * This method is idempotent — multiple calls are safe.
   */
  _startHeartbeat(opts: {
    onTimedOut: (connIds: string[]) => void;
    onPing?: (conn: WsConnection<Env>) => void;
  }): void {
    this._heartbeatOnTimedOut = opts.onTimedOut;
    this._heartbeatOnPing = opts.onPing;
    this._ensureHeartbeatRunning();
  }

  /** @internal Callback for handling timed-out connections. */
  private _heartbeatOnTimedOut?: (connIds: string[]) => void;
  /** @internal Callback for sending protocol-level pings (Node.js only). */
  private _heartbeatOnPing?: (conn: WsConnection<Env>) => void;

  /** Ensure the heartbeat timer is running (idempotent). */
  private _ensureHeartbeatRunning(): void {
    if (!this._heartbeat || this._heartbeatTimer) return;

    this._heartbeatTimer = setInterval(() => {
      if (!this._heartbeat) return;

      // 1. Get connections that timed out from the PREVIOUS cycle
      const timedOut = this._heartbeat.getTimedOut();
      if (timedOut.length > 0) {
        this._heartbeatOnTimedOut?.(timedOut);
      }

      // 2. Send pings to all tracked connections
      const payload = this._heartbeat.getPayload();
      for (const conn of this._connections.values()) {
        if (this._heartbeatOnPing) {
          this._heartbeatOnPing(conn);
        } else {
          conn.send(payload);
        }
      }

      // 3. Mark all as "needs ping" for the NEXT cycle
      this._heartbeat.markAll();
    }, this._heartbeat.intervalMs);
  }

  /** Stop the heartbeat timer. */
  private _stopHeartbeatTimer(): void {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = undefined;
    }
  }

  /** Close all connections and stop accepting new ones. */
  async close(): Promise<void> {
    this._stopHeartbeatTimer();
    for (const conn of this._connections.values()) {
      conn.close(1001, "Server shutting down");
    }
    this._connections.clear();
    this._rooms = new RoomManager();
  }
}
