import type { App } from "@nodalite/core";
import type { WsServer } from "./server.js";
import { WsConnection } from "./connection.js";
import type { WsMessage, WsPlatform } from "./types.js";

// Bun-specific WebSocket type
interface BunWs {
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
  data: { pathname: string; headers: Record<string, string>; hostname: string };
}

/**
 * Create a Bun-compatible configuration object for `Bun.serve()`.
 *
 * Handles both HTTP and WebSocket connections using Bun's native WebSocket support.
 *
 * ```ts
 * import { App } from '@nodalite/core';
 * import { WsServer } from '@nodalite/ws';
 * import { createBunWsHandler } from '@nodalite/ws/bun';
 *
 * const app = new App();
 * const ws = new WsServer();
 *
 * Bun.serve({ ...createBunWsHandler(app, ws), port: 3000 });
 * ```
 */
export function createBunWsHandler(app: App, wsServer: WsServer) {
  const connections = new Map<BunWs, WsConnection>();
  let heartbeatStarted = false;

  return {
    async fetch(
      req: Request,
      server: { upgrade: (req: Request, opts?: { data: { pathname: string; headers: Record<string, string>; hostname: string } }) => boolean },
    ): Promise<Response | undefined> {
      const url = new URL(req.url);

      if (wsServer._matchesPath(url.pathname)) {
        // Forward original request headers through data so they are
        // available when the websocket.open handler creates WsConnection.
        const headers: Record<string, string> = {};
        req.headers.forEach((value, key) => {
          headers[key] = value;
        });

        const upgraded = server.upgrade(req, {
          data: { pathname: url.pathname, headers, hostname: url.hostname },
        });
        if (upgraded) return undefined;
        return new Response("Upgrade Failed", { status: 500 });
      }

      return app.handle(req, { runtime: "bun" });
    },

    websocket: {
      open(ws: BunWs) {
        const { pathname, headers, hostname } = ws.data;
        const request = new Request(`ws://${hostname}${pathname}`, { headers });
        const platform: WsPlatform = { runtime: "bun" };

        const conn = new WsConnection({
          request,
          remoteAddress: "unknown",
          platform,
          roomManager: (wsServer as unknown as { _rooms: import("./rooms.js").RoomManager })._rooms,
        });

        wsServer._bridgeConnection(conn, {
          send: (data: WsMessage) => {
            ws.send(typeof data === "string" ? data : data as ArrayBuffer);
          },
          close: (code?: number, reason?: string) => {
            ws.close(code ?? 1000, reason ?? "");
          },
        });

        conn._setRaw(ws);
        connections.set(ws, conn);

        // Start centralized heartbeat (once) — uses application-level JSON pings
        if (!heartbeatStarted) {
          heartbeatStarted = true;
          wsServer._startHeartbeat({
            onTimedOut: (ids) => {
              for (const id of ids) {
                wsServer.getConnection(id)?.close(1001, "Heartbeat timeout");
              }
            },
          });
        }

        wsServer._runOpenHandlers(conn);
      },

      message(ws: BunWs, message: string | Buffer | ArrayBuffer) {
        const conn = connections.get(ws);
        if (conn) {
          const isBinary = typeof message !== "string";
          wsServer._handleMessage(conn, message as WsMessage, isBinary);
        }
      },

      close(ws: BunWs, code: number, reason: string) {
        const conn = connections.get(ws);
        if (conn) {
          wsServer._handleClose(conn, code, reason);
          connections.delete(ws);
        }
      },
    },
  };
}
