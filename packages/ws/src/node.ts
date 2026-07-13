import * as http from "node:http";
import * as https from "node:https";
import * as crypto from "node:crypto";
import type { Server, IncomingMessage } from "node:http";
import type { Server as HttpsServer } from "node:https";
import type { Duplex } from "node:stream";
import type { App } from "@nodalite/core";
import type { WsServer } from "./server.js";
import type { WsMessage, WsPlatform } from "./types.js";
import { WsConnection } from "./connection.js";
import { toFetchRequest, sendResponse } from "./convert.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NodeWsOptions {
  port?: number;
  hostname?: string;
  tls?: { key: string | Buffer; cert: string | Buffer };
  onListen?: (info: { port: number; hostname: string }) => void;
  noWsLibrary?: boolean;
}

export interface NodeWsHandle {
  server: Server;
  close: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// ws library adapter
// ---------------------------------------------------------------------------

type WsModule = typeof import("ws");

async function tryLoadWs(): Promise<WsModule | null> {
  try {
    return await import("ws");
  } catch {
    return null;
  }
}

function attachWsLibrary(server: Server, wsServer: WsServer, wsLib: WsModule): void {
  const wss = new wsLib.WebSocketServer({ noServer: true, clientTracking: false });

  let heartbeatStarted = false;

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (!wsServer._matchesPath(url.pathname)) return;

    const request = toFetchRequest(req);
    const rejection = wsServer._validateUpgrade(request);
    if (rejection) {
      socket.write(`HTTP/1.1 ${rejection.status} ${rejection.statusText}\r\n\r\n`);
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (nativeWs) => {
      const platform: WsPlatform = { runtime: "node", ip: req.socket?.remoteAddress };
      bridgeConnection(wsServer, nativeWs, request, platform);

      if (!heartbeatStarted) {
        heartbeatStarted = true;
        wsServer._startHeartbeat({
          onTimedOut: (ids) => {
            for (const id of ids) {
              wsServer.getConnection(id)?.close(1001, "Heartbeat timeout");
            }
          },
          onPing: (conn) => {
            const raw = conn._getRaw<import("ws").WebSocket>();
            if (raw && raw.readyState === 1) {
              try { raw.ping(); } catch { /* ignore */ }
            }
          },
        });
      }
    });
  });
}

function bridgeConnection(
  wsServer: WsServer,
  nativeWs: import("ws").WebSocket,
  request: Request,
  platform: WsPlatform,
): WsConnection {
  const conn = new WsConnection({
    request,
    remoteAddress: platform.ip ?? "unknown",
    platform,
    roomManager: (wsServer as unknown as { _rooms: import("./rooms.js").RoomManager })._rooms,
  });

  wsServer._bridgeConnection(conn, {
    send: (data: WsMessage) => {
      if (nativeWs.readyState === 1) nativeWs.send(data);
    },
    close: (code?: number, reason?: string) => {
      if (nativeWs.readyState === nativeWs.OPEN || nativeWs.readyState === nativeWs.CONNECTING) {
        nativeWs.close(code, reason);
      }
    },
  });

  nativeWs.on("message", (data: Buffer, isBinary: boolean) => {
    wsServer._handleMessage(conn, data, isBinary);
  });

  nativeWs.on("close", (code: number, reason: Buffer) => {
    wsServer._handleClose(conn, code, reason.toString());
  });

  nativeWs.on("error", (err: Error) => {
    wsServer._handleError(conn, err);
  });

  nativeWs.on("pong", () => {
    wsServer._markAlive(conn.id);
  });

  conn._setRaw(nativeWs);

  // Run open handlers
  wsServer._runOpenHandlers(conn);

  return conn;
}

// ---------------------------------------------------------------------------
// Zero-dep fallback adapter
// ---------------------------------------------------------------------------

function parseWsFrame(buffer: Buffer): { opcode: number; data: Buffer; length: number } | null {
  if (buffer.length < 2) return null;

  const firstByte = buffer[0]!;
  const secondByte = buffer[1]!;
  const opcode = firstByte & 0x0f;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < 4) return null;
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    if (buffer.length < 10) return null;
    payloadLength = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  let maskingKey: Buffer | undefined;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    maskingKey = buffer.subarray(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + payloadLength) return null;

  const data = buffer.subarray(offset, offset + payloadLength);
  if (masked && maskingKey) {
    for (let i = 0; i < data.length; i++) {
      data[i]! ^= maskingKey[i % 4]!;
    }
  }

  return { opcode, data, length: offset + payloadLength };
}

function encodeWsFrame(data: Buffer, opcode: number): Buffer {
  const len = data.length;
  let header: Buffer;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, data]);
}

function computeAcceptKey(key: string): string {
  return crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
}

function attachZeroDep(server: Server, wsServer: WsServer): void {
  let heartbeatStarted = false;

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (!wsServer._matchesPath(url.pathname)) return;

    const upgradeHeader = req.headers.upgrade;
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      socket.write("HTTP/1.1 426 Upgrade Required\r\n\r\n");
      socket.destroy();
      return;
    }

    const wsKey = req.headers["sec-websocket-key"];
    if (!wsKey || typeof wsKey !== "string") {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    const request = toFetchRequest(req);
    const rejection = wsServer._validateUpgrade(request);
    if (rejection) {
      socket.write(`HTTP/1.1 ${rejection.status} ${rejection.statusText}\r\n\r\n`);
      socket.destroy();
      return;
    }

    const acceptKey = computeAcceptKey(typeof wsKey === "string" ? wsKey : wsKey[0] ?? "");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
        "\r\n",
    );

    const platform: WsPlatform = { runtime: "node", ip: req.socket?.remoteAddress };

    const conn = new WsConnection({
      request,
      remoteAddress: platform.ip ?? "unknown",
      platform,
      roomManager: (wsServer as unknown as { _rooms: import("./rooms.js").RoomManager })._rooms,
    });

    let buffer = Buffer.alloc(0);
    let alive = true;

    wsServer._bridgeConnection(conn, {
      send: (data: WsMessage) => {
        if (!alive) return;
        try {
          const payload = typeof data === "string" ? Buffer.from(data) : Buffer.from(data as ArrayBuffer);
          socket.write(encodeWsFrame(payload, 1));
        } catch { /* ignore */ }
      },
      close: (code?: number, _reason?: string) => {
        if (!alive) return;
        alive = false;
        const closeData = Buffer.alloc(2);
        closeData.writeUInt16BE(code ?? 1000, 0);
        socket.write(encodeWsFrame(closeData, 8));
        socket.destroy();
      },
    });

    conn._setRaw(socket);

    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length > 0) {
        const frame = parseWsFrame(buffer);
        if (!frame) break;

        buffer = buffer.subarray(frame.length);

        if (frame.opcode === 1 || frame.opcode === 2) {
          wsServer._handleMessage(conn, frame.data, frame.opcode === 2);
        } else if (frame.opcode === 8) {
          const code = frame.data.length >= 2 ? frame.data.readUInt16BE(0) : 1000;
          const reason = frame.data.length > 2 ? frame.data.subarray(2).toString() : "";
          alive = false;
          wsServer._handleClose(conn, code, reason);
          socket.destroy();
          return;
        } else if (frame.opcode === 9) {
          // Ping received — respond with pong
          socket.write(encodeWsFrame(frame.data, 10));
        } else if (frame.opcode === 10) {
          // Pong received — mark connection alive
          wsServer._markAlive(conn.id);
        }
      }
    });

    socket.on("close", () => {
      if (alive) {
        alive = false;
        wsServer._handleClose(conn, 1006, "Connection closed");
      }
    });

    socket.on("error", (err: Error) => {
      wsServer._handleError(conn, err);
    });

    if (head.length > 0) {
      socket.emit("data", head);
    }

    // Start heartbeat with frame-level ping support (once)
    if (!heartbeatStarted) {
      heartbeatStarted = true;
      wsServer._startHeartbeat({
        onTimedOut: (ids) => {
          for (const id of ids) {
            wsServer.getConnection(id)?.close(1001, "Heartbeat timeout");
          }
        },
        onPing: (conn) => {
          const raw = conn._getRaw<Duplex>();
          if (raw && !("destroyed" in raw && !(raw as Duplex & { destroyed: boolean }).destroyed)) {
            try {
              (raw as import("node:stream").Duplex).write(encodeWsFrame(Buffer.alloc(0), 9));
            } catch { /* ignore */ }
          }
        },
      });
    }

    // Run open handlers
    wsServer._runOpenHandlers(conn);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Serve both HTTP and WebSocket on the same port.
 *
 * ```ts
 * import { App } from '@nodalite/core';
 * import { WsServer } from '@nodalite/ws';
 * import { serveWs } from '@nodalite/ws/node';
 *
 * const app = new App();
 * const ws = new WsServer();
 * serveWs(app, ws, { port: 3000 });
 * ```
 */
export async function serveWs(
  app: App,
  wsServer: WsServer,
  opts: NodeWsOptions = {},
): Promise<NodeWsHandle> {
  const port = opts.port ?? (Number(process.env.PORT) || 3000);
  const hostname = opts.hostname ?? "0.0.0.0";

  const requestListener: http.RequestListener = (req, res) => {
    const request = toFetchRequest(req);
    const platform = { ip: req.socket.remoteAddress, runtime: "node" as const };

    app
      .handle(request, platform)
      .then((response) => sendResponse(res, response))
      .catch((err) => {
        console.error("[nodalite:ws/node] Unhandled error:", err);
        if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Internal Server Error" }));
      });
  };

  const server = opts.tls ? https.createServer(opts.tls, requestListener) : http.createServer(requestListener);

  let wsLib: WsModule | null = null;
  if (!opts.noWsLibrary) {
    wsLib = await tryLoadWs();
  }

  if (wsLib) {
    attachWsLibrary(server, wsServer, wsLib);
  } else {
    attachZeroDep(server, wsServer);
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, () => {
      server.removeListener("error", reject);
      opts.onListen?.({ port, hostname });
      resolve();
    });
  });

  return {
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        wsServer.close().then(() => {
          server.close((err) => (err ? reject(err) : resolve()));
        });
      }),
  };
}

/**
 * Attach WebSocket handling to an existing HTTP/HTTPS server.
 */
export async function attachWs(
  server: Server | HttpsServer,
  wsServer: WsServer,
  opts: { noWsLibrary?: boolean } = {},
): Promise<void> {
  let wsLib: WsModule | null = null;
  if (!opts.noWsLibrary) {
    wsLib = await tryLoadWs();
  }

  if (wsLib) {
    attachWsLibrary(server as Server, wsServer, wsLib);
  } else {
    attachZeroDep(server as Server, wsServer);
  }
}
