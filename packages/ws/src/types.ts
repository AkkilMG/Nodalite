import type { WsConnection } from "./connection.js";

/**
 * A message that can be sent over a WebSocket connection.
 * Supports strings (text frames) and binary data (ArrayBuffer/ArrayBufferView).
 */
export type WsMessage = string | ArrayBuffer | ArrayBufferView;

/** Options for constructing a {@link WsServer}. */
export interface WsServerOptions {
  /**
   * Maximum payload size in bytes.
   * Messages exceeding this limit will cause the connection to close with code 1009.
   * @default 1048576 (1 MB)
   */
  maxPayload?: number;

  /**
   * Heartbeat configuration for detecting stale connections.
   * Set to `false` to disable heartbeat entirely.
   * @default { interval: 30000, timeout: 10000 }
   */
  heartbeat?:
    | false
    | {
        /** Milliseconds between heartbeat pings. @default 30000 */
        interval?: number;
        /** Milliseconds to wait for a pong before terminating the connection. @default 10000 */
        timeout?: number;
        /**
         * Custom heartbeat payload generator.
         * @default Sends `{"t":"ping"}` as a text frame.
         */
        payload?: () => WsMessage;
      };

  /**
   * Maximum number of concurrent WebSocket connections.
   * New upgrade requests will receive HTTP 429 when this limit is reached.
   * @default 0 (unlimited)
   */
  maxConnections?: number;

  /**
   * Allowed origins for WebSocket upgrade requests.
   * - `string[]`: exact match against the `Origin` header.
   * - `(origin: string) => boolean`: custom predicate.
   * - `undefined`: allow all origins.
   */
  allowedOrigins?: string[] | ((origin: string) => boolean);
}

/**
 * A set of lifecycle handlers for a WebSocket path.
 *
 * ```ts
 * ws.path('/chat', {
 *   open(conn) { conn.join('general'); },
 *   message(conn, data) { conn.to('general').emit(data); },
 *   close(conn, code, reason) { /* cleanup *\/ },
 * });
 * ```
 */
export interface WsHandlerSet<Env extends Record<string, unknown> = Record<string, unknown>> {
  /** Called when a client completes the WebSocket handshake. */
  open?: (conn: WsConnection<Env>) => void | Promise<void>;
  /** Called when a message is received from a client. */
  message?: (conn: WsConnection<Env>, data: WsMessage, isBinary: boolean) => void | Promise<void>;
  /** Called when a client disconnects. */
  close?: (conn: WsConnection<Env>, code: number, reason: string) => void | Promise<void>;
  /** Called when a connection-level error occurs. */
  error?: (conn: WsConnection<Env>, error: Error) => void;
}

/**
 * A middleware that runs on every message for a connection.
 * Middlewares are executed in registration order before the message handler.
 *
 * ```ts
 * ws.use((conn, data, next) => {
 *   console.log('Message received:', data);
 *   return next();
 * });
 * ```
 */
export type WsMiddleware<Env extends Record<string, unknown> = Record<string, unknown>> = (
  conn: WsConnection<Env>,
  data: WsMessage,
  next: () => void | Promise<void>,
) => void | Promise<void>;

/**
 * Adapter-supplied platform information attached to each connection.
 * Contains runtime-specific details useful for logging, analytics, and routing.
 */
export interface WsPlatform {
  /** Runtime identifier (e.g. `"node"`, `"edge"`, `"bun"`, `"deno"`, `"aws-lambda"`). */
  runtime: string;
  /** Client IP address, if available from the runtime. */
  ip?: string;
  /** Any additional adapter-specific data (e.g. `env`, `waitUntil`, `connectionId`). */
  [key: string]: unknown;
}
