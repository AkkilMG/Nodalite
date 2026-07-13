import type { App } from "@nodalite/core";
import type { WsServer } from "./server.js";
import { WsConnection } from "./connection.js";
import type { WsMessage, WsPlatform } from "./types.js";

// ---------------------------------------------------------------------------
// Cloudflare Workers adapter
// ---------------------------------------------------------------------------

/**
 * Create a Cloudflare Workers-compatible handler that handles both HTTP
 * and WebSocket connections using `WebSocketPair`.
 *
 * ```ts
 * import { App } from '@nodalite/core';
 * import { WsServer } from '@nodalite/ws';
 * import { createEdgeWsHandler } from '@nodalite/ws/edge';
 *
 * const app = new App();
 * const ws = new WsServer();
 *
 * export default createEdgeWsHandler(app, ws);
 * ```
 */
export function createEdgeWsHandler(app: App, wsServer: WsServer) {
  let heartbeatStarted = false;

  return {
    async fetch(
      request: Request,
      env?: Record<string, unknown>,
      ctx?: { waitUntil(p: Promise<unknown>): void },
    ): Promise<Response> {
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader && upgradeHeader.toLowerCase() === "websocket") {
        return handleEdgeUpgrade(wsServer, request, { runtime: "edge", env, waitUntil: ctx?.waitUntil }, heartbeatStarted, () => { heartbeatStarted = true; });
      }

      // Regular HTTP request
      const platform = { runtime: "edge" as const, env, waitUntil: ctx?.waitUntil };
      return app.handle(request, platform);
    },
  };
}

function handleEdgeUpgrade(
  wsServer: WsServer,
  request: Request,
  platform: WsPlatform,
  heartbeatStarted: boolean,
  markHeartbeatStarted: () => void,
): Response {
  const url = new URL(request.url);

  if (!wsServer._matchesPath(url.pathname)) {
    return new Response("Not Found", { status: 404 });
  }

  // Create WebSocketPair — this is a Cloudflare Workers global
  const WebSocketPairCtor = (globalThis as Record<string, unknown>).WebSocketPair as
    | (new () => { 0: WebSocket; 1: WebSocket })
    | undefined;

  if (!WebSocketPairCtor) {
    return new Response("WebSocketPair not supported in this runtime", { status: 501 });
  }

  const pair = new WebSocketPairCtor();
  const clientWs = pair[0];
  const serverWs = pair[1];

  // Accept the server-side WebSocket
  (serverWs as unknown as { accept: () => void }).accept();

  // Create WsConnection
  const conn = new WsConnection({
    request,
    remoteAddress: (platform as Record<string, unknown>).ip as string ?? "unknown",
    platform,
    roomManager: (wsServer as unknown as { _rooms: import("./rooms.js").RoomManager })._rooms,
  });

  // Wire up via shared bridgeConnection
  wsServer._bridgeConnection(conn, {
    send: (data: WsMessage) => {
      if (serverWs.readyState === WebSocket.OPEN) {
        serverWs.send(typeof data === "string" ? data : data as ArrayBuffer);
      }
    },
    close: (code?: number, reason?: string) => {
      if (serverWs.readyState === WebSocket.OPEN) {
        serverWs.close(code ?? 1000, reason ?? "");
      }
    },
  });

  // Store native ws reference
  conn._setRaw(serverWs);

  // Map native events to WsServer
  serverWs.addEventListener("message", (event: MessageEvent) => {
    const data = event.data;
    const isBinary = typeof data !== "string";
    wsServer._handleMessage(conn, data, isBinary);
  });

  serverWs.addEventListener("close", (event: CloseEvent) => {
    wsServer._handleClose(conn, event.code, event.reason);
  });

  serverWs.addEventListener("error", () => {
    wsServer._handleError(conn, new Error("WebSocket error"));
  });

  // Start centralized heartbeat (once) — uses application-level JSON pings
  if (!heartbeatStarted) {
    markHeartbeatStarted();
    wsServer._startHeartbeat({
      onTimedOut: (ids) => {
        for (const id of ids) {
          wsServer.getConnection(id)?.close(1001, "Heartbeat timeout");
        }
      },
      // No onPing — uses conn.send(payload) for application-level pings
    });
  }

  // Run open handlers asynchronously
  wsServer._runOpenHandlers(conn);

  // Return the client-side WebSocket in a 101 response
  return new Response(null, { status: 101, statusText: "Switching Protocols", webSocket: clientWs } as ResponseInit);
}

// ---------------------------------------------------------------------------
// Bun adapter (re-export from dedicated bun.ts for backward compatibility)
// ---------------------------------------------------------------------------

export { createBunWsHandler as createBunWsConfig } from "./bun.js";

// ---------------------------------------------------------------------------
// Deno adapter
// ---------------------------------------------------------------------------

/**
 * Create a Deno-compatible request handler.
 *
 * ```ts
 * import { App } from '@nodalite/core';
 * import { WsServer } from '@nodalite/ws';
 * import { createDenoWsHandler } from '@nodalite/ws/edge';
 *
 * const app = new App();
 * const ws = new WsServer();
 * Deno.serve(createDenoWsHandler(app, ws));
 * ```
 */
export function createDenoWsHandler(app: App, wsServer: WsServer) {
  let heartbeatStarted = false;

  return async (req: Request): Promise<Response> => {
    const upgradeHeader = req.headers.get("Upgrade");
    if (upgradeHeader && upgradeHeader.toLowerCase() === "websocket") {
      const url = new URL(req.url);

      if (!wsServer._matchesPath(url.pathname)) {
        return new Response("Not Found", { status: 404 });
      }

      // Deno's upgradeWebSocket
      const DenoGlobal = (globalThis as Record<string, unknown>).Deno as
        | { upgradeWebSocket: (req: Request, opts?: Record<string, unknown>) => { socket: WebSocket; response: Response } }
        | undefined;

      if (!DenoGlobal?.upgradeWebSocket) {
        return new Response("WebSocket not supported in this runtime", { status: 501 });
      }

      const { socket: nativeWs, response } = DenoGlobal.upgradeWebSocket(req);

      const platform: WsPlatform = { runtime: "deno" };

      const conn = new WsConnection({
        request: req,
        remoteAddress: "unknown",
        platform,
        roomManager: (wsServer as unknown as { _rooms: import("./rooms.js").RoomManager })._rooms,
      });

      wsServer._bridgeConnection(conn, {
        send: (data: WsMessage) => {
          if (nativeWs.readyState === WebSocket.OPEN) {
            nativeWs.send(typeof data === "string" ? data : data as ArrayBuffer);
          }
        },
        close: (code?: number, reason?: string) => {
          if (nativeWs.readyState === WebSocket.OPEN) {
            nativeWs.close(code ?? 1000, reason ?? "");
          }
        },
      });

      conn._setRaw(nativeWs);

      nativeWs.addEventListener("message", (event: MessageEvent) => {
        const data = event.data;
        const isBinary = typeof data !== "string";
        wsServer._handleMessage(conn, data, isBinary);
      });

      nativeWs.addEventListener("close", (event: CloseEvent) => {
        wsServer._handleClose(conn, event.code, event.reason);
      });

      nativeWs.addEventListener("error", () => {
        wsServer._handleError(conn, new Error("WebSocket error"));
      });

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

      // Run open handlers
      wsServer._runOpenHandlers(conn);

      return response;
    }

    // Regular HTTP request
    return app.handle(req, { runtime: "deno" });
  };
}
