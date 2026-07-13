import { describe, it, expect, vi, afterEach } from "vitest";
import { WsServer } from "./server.js";
import { WsConnection } from "./connection.js";

function req(path = "/ws"): Request {
  return new Request(`http://localhost${path}`);
}

function createTestServer(opts?: Parameters<typeof WsServer.prototype.constructor>[0]): WsServer {
  return new WsServer({ heartbeat: false, ...opts });
}

describe("WsServer", () => {
  describe("path routing", () => {
    it("should register path handlers", () => {
      const ws = createTestServer();
      const openFn = vi.fn();
      ws.path("/chat", { open: openFn });

      // Verify path is registered (internal check)
      const paths = (ws as unknown as { _paths: Map<string, unknown> })._paths;
      expect(paths.has("/chat")).toBe(true);
    });

    it("should allow multiple path handlers", () => {
      const ws = createTestServer();
      ws.path("/chat", { open: vi.fn() });
      ws.path("/events", { open: vi.fn() });

      const paths = (ws as unknown as { _paths: Map<string, unknown> })._paths;
      expect(paths.size).toBe(2);
    });
  });

  describe("connection handling", () => {
    it("should handle upgrade and create a connection", async () => {
      const ws = createTestServer();
      const openFn = vi.fn();
      ws.path("/ws", { open: openFn });

      ws._handleUpgrade(req(), () => {}, { runtime: "test", ip: "127.0.0.1" });

      // Wait for async open handler
      await new Promise((r) => setTimeout(r, 10));

      expect(ws.size).toBe(1);
      expect(openFn).toHaveBeenCalledOnce();
    });

    it("should pass connection to open handler", async () => {
      const ws = createTestServer();
      let connRef: WsConnection | undefined;
      ws.path("/ws", {
        open: (conn) => { connRef = conn; },
      });

      ws._handleUpgrade(req(), () => {}, { runtime: "test" });
      await new Promise((r) => setTimeout(r, 10));

      expect(connRef).toBeInstanceOf(WsConnection);
      expect(connRef!.isOpen).toBe(true);
    });

    it("should reject connections beyond maxConnections", () => {
      const ws = createTestServer({ maxConnections: 1 });
      ws.path("/ws", {});

      let upgradeResponse: Response | undefined;
      ws._handleUpgrade(req(), (res) => { upgradeResponse = res; });
      expect(ws.size).toBe(1);

      ws._handleUpgrade(req(), (res) => { upgradeResponse = res; });
      expect(upgradeResponse?.status).toBe(429);
      expect(ws.size).toBe(1);
    });

    it("should reject connections with disallowed origin", () => {
      const ws = createTestServer({ allowedOrigins: ["https://example.com"] });
      ws.path("/ws", {});

      const request = new Request("http://localhost/ws", {
        headers: { Origin: "https://evil.com" },
      });

      let upgradeResponse: Response | undefined;
      ws._handleUpgrade(request, (res) => { upgradeResponse = res; });
      expect(upgradeResponse?.status).toBe(403);
      expect(ws.size).toBe(0);
    });

    it("should allow connections with allowed origin", () => {
      const ws = createTestServer({ allowedOrigins: ["https://example.com"] });
      ws.path("/ws", {});

      const request = new Request("http://localhost/ws", {
        headers: { Origin: "https://example.com" },
      });

      ws._handleUpgrade(request, () => {});
      expect(ws.size).toBe(1);
    });

    it("should allow all origins when not configured", () => {
      const ws = createTestServer();
      ws.path("/ws", {});

      const request = new Request("http://localhost/ws", {
        headers: { Origin: "https://any-origin.com" },
      });

      ws._handleUpgrade(request, () => {});
      expect(ws.size).toBe(1);
    });
  });

  describe("message handling", () => {
    it("should call message handler", async () => {
      const ws = createTestServer();
      const messageFn = vi.fn();
      ws.path("/ws", { message: messageFn });

      ws._handleUpgrade(req(), () => {}, { runtime: "test" });
      await new Promise((r) => setTimeout(r, 10));

      const conn = [...ws.connections][0];
      ws._handleMessage(conn, "hello", false);

      expect(messageFn).toHaveBeenCalledWith(conn, "hello", false);
    });

    it("should reject messages exceeding maxPayload", async () => {
      const ws = createTestServer({ maxPayload: 10 });
      const messageFn = vi.fn();
      ws.path("/ws", { message: messageFn });

      ws._handleUpgrade(req(), () => {}, { runtime: "test" });
      await new Promise((r) => setTimeout(r, 10));

      const conn = [...ws.connections][0];
      ws._handleMessage(conn, "a".repeat(20), false);

      expect(messageFn).not.toHaveBeenCalled();
      expect(conn.isOpen).toBe(false);
    });

    it("should run middlewares before message handler", async () => {
      const ws = createTestServer();
      const order: string[] = [];
      ws.use(async (_conn, _data, next) => {
        order.push("middleware");
        await next();
      });
      ws.path("/ws", {
        message: () => { order.push("handler"); },
      });

      ws._handleUpgrade(req(), () => {}, { runtime: "test" });
      await new Promise((r) => setTimeout(r, 10));

      const conn = [...ws.connections][0];
      ws._handleMessage(conn, "hello", false);
      await new Promise((r) => setTimeout(r, 10));

      expect(order).toEqual(["middleware", "handler"]);
    });
  });

  describe("close handling", () => {
    it("should call close handler and remove connection", async () => {
      const ws = createTestServer();
      const closeFn = vi.fn();
      ws.path("/ws", { close: closeFn });

      ws._handleUpgrade(req(), () => {}, { runtime: "test" });
      await new Promise((r) => setTimeout(r, 10));

      const conn = [...ws.connections][0];
      ws._handleClose(conn, 1000, "normal");

      expect(closeFn).toHaveBeenCalledWith(conn, 1000, "normal");
      expect(ws.size).toBe(0);
    });

    it("should clean up rooms on close", async () => {
      const ws = createTestServer();
      ws.path("/ws", {
        open: (conn) => { conn.join("chat"); },
      });

      ws._handleUpgrade(req(), () => {}, { runtime: "test" });
      await new Promise((r) => setTimeout(r, 10));

      expect(ws.getRoom("chat").size).toBe(1);

      const conn = [...ws.connections][0];
      ws._handleClose(conn, 1000, "");

      expect(ws.getRoom("chat").size).toBe(0);
    });
  });

  describe("broadcasting", () => {
    it("should broadcast to all connections", async () => {
      const ws = createTestServer();
      ws.path("/ws", {});

      ws._handleUpgrade(req("/ws"), () => {});
      ws._handleUpgrade(req("/ws"), () => {});
      await new Promise((r) => setTimeout(r, 10));

      expect(ws.size).toBe(2);

      const sent: unknown[][] = [];
      for (const conn of ws.connections) {
        conn._sendFn = (data) => sent.push([conn.id, data]);
      }

      ws.broadcast("hello all");
      expect(sent.length).toBe(2);
    });

    it("should broadcast to room", async () => {
      const ws = createTestServer();
      ws.path("/ws", {
        open: (conn) => { conn.join("chat"); },
      });

      ws._handleUpgrade(req("/ws"), () => {});
      ws._handleUpgrade(req("/ws"), () => {});
      await new Promise((r) => setTimeout(r, 10));

      const conns = [...ws.connections];
      const sent1: unknown[] = [];
      const sent2: unknown[] = [];
      conns[0]._sendFn = (data) => sent1.push(data);
      conns[1]._sendFn = (data) => sent2.push(data);

      ws.toRoom("chat").emit("hello room");
      expect(sent1.length).toBe(1);
      expect(sent2.length).toBe(1);
    });
  });

  describe("rooms", () => {
    it("should track room membership", async () => {
      const ws = createTestServer();
      ws.path("/ws", {
        open: (conn) => { conn.join("chat", "notifications"); },
      });

      ws._handleUpgrade(req(), () => {});
      await new Promise((r) => setTimeout(r, 10));

      expect(ws.getRoom("chat").size).toBe(1);
      expect(ws.getRoom("notifications").size).toBe(1);
    });

    it("should get connection by id", async () => {
      const ws = createTestServer();
      ws.path("/ws", {});

      ws._handleUpgrade(req(), () => {});
      await new Promise((r) => setTimeout(r, 10));

      const conn = [...ws.connections][0];
      expect(ws.getConnection(conn.id)).toBe(conn);
    });
  });

  describe("error handling", () => {
    it("should call error handler on open error", async () => {
      const ws = createTestServer();
      const errorFn = vi.fn();
      ws.path("/ws", {
        open: () => { throw new Error("test error"); },
        error: errorFn,
      });

      ws._handleUpgrade(req(), () => {});
      await new Promise((r) => setTimeout(r, 10));

      expect(errorFn).toHaveBeenCalled();
      expect(errorFn.mock.calls[0][1].message).toBe("test error");
    });
  });

  describe("path matching (_matchesPath)", () => {
    it("should match exact paths", () => {
      const ws = createTestServer();
      ws.path("/chat", {});
      expect(ws._matchesPath("/chat")).toBe(true);
    });

    it("should match wildcard patterns", () => {
      const ws = createTestServer();
      ws.path("/chat/*", {});
      expect(ws._matchesPath("/chat/room1")).toBe(true);
      expect(ws._matchesPath("/chat/a/b/c")).toBe(true);
    });

    it("should not match unrelated paths", () => {
      const ws = createTestServer();
      ws.path("/chat", {});
      expect(ws._matchesPath("/events")).toBe(false);
    });

    it("should NOT match a longer path for non-wildcard patterns", () => {
      const ws = createTestServer();
      ws.path("/chat", {});
      expect(ws._matchesPath("/chatroom")).toBe(false);
      expect(ws._matchesPath("/chat/room1")).toBe(false);
    });

    it("should not match bare path for wildcard patterns", () => {
      const ws = createTestServer();
      ws.path("/chat/*", {});
      // /chat does NOT start with /chat/ so it shouldn't match
      expect(ws._matchesPath("/chat")).toBe(false);
    });
  });

  describe("heartbeat", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("should detect timed-out connections via _startHeartbeat", async () => {
      vi.useFakeTimers();
      const ws = new WsServer({ heartbeat: { interval: 1000, timeout: 500 } });
      ws.path("/ws", {});

      const onTimedOut = vi.fn();
      ws._startHeartbeat({ onTimedOut });

      ws._handleUpgrade(req(), () => {}, { runtime: "test" });
      // Let async open handlers complete
      await vi.advanceTimersByTimeAsync(50);
      expect(ws.size).toBe(1);

      const conn = [...ws.connections][0];

      // First tick: getTimedOut returns [] (nothing marked false yet), markAll sets all false, pings sent
      // Second tick: getTimedOut finds conn (was false and never markAlive'd), marks it timed out
      await vi.advanceTimersByTimeAsync(2100);

      expect(onTimedOut).toHaveBeenCalled();
      const timedOutIds = onTimedOut.mock.calls[0][0] as string[];
      expect(timedOutIds).toContain(conn.id);
    });

    it("should NOT time out connections that respond to pings", async () => {
      vi.useFakeTimers();
      const ws = new WsServer({ heartbeat: { interval: 1000, timeout: 500 } });
      ws.path("/ws", {});

      const onTimedOut = vi.fn();
      ws._startHeartbeat({ onTimedOut });

      ws._handleUpgrade(req(), () => {}, { runtime: "test" });
      await vi.advanceTimersByTimeAsync(50);
      expect(ws.size).toBe(1);

      const conn = [...ws.connections][0];

      // Tick 1: getTimedOut=[], markAll→false, pings sent
      await vi.advanceTimersByTimeAsync(1050);
      ws._markAlive(conn.id); // pong received

      // Tick 2: getTimedOut=[] (conn was alive), markAll→false, pings sent
      await vi.advanceTimersByTimeAsync(1050);
      ws._markAlive(conn.id); // pong received again

      // Tick 3: getTimedOut=[] (conn was alive again)
      await vi.advanceTimersByTimeAsync(1050);

      expect(onTimedOut).not.toHaveBeenCalled();
    });

    it("should send application-level pings when no onPing callback", async () => {
      vi.useFakeTimers();
      const ws = new WsServer({ heartbeat: { interval: 1000, timeout: 500 } });
      ws.path("/ws", {});

      const sent: unknown[] = [];
      ws._startHeartbeat({ onTimedOut: () => {} });

      ws._handleUpgrade(req(), () => {}, { runtime: "test" });
      await vi.advanceTimersByTimeAsync(50);

      const conn = [...ws.connections][0];
      conn._sendFn = (data) => sent.push(data);

      // First tick sends pings
      await vi.advanceTimersByTimeAsync(1050);

      expect(sent.length).toBe(1);
      expect(sent[0]).toBe('{"t":"ping"}');
    });

    it("should use onPing callback when provided", async () => {
      vi.useFakeTimers();
      const ws = new WsServer({ heartbeat: { interval: 1000, timeout: 500 } });
      ws.path("/ws", {});

      const onPing = vi.fn();
      ws._startHeartbeat({ onTimedOut: () => {}, onPing });

      ws._handleUpgrade(req(), () => {}, { runtime: "test" });
      await vi.advanceTimersByTimeAsync(50);

      const conn = [...ws.connections][0];

      // First tick uses onPing instead of conn.send
      await vi.advanceTimersByTimeAsync(1050);

      expect(onPing).toHaveBeenCalled();
      expect(onPing).toHaveBeenCalledWith(conn);
    });

    it("should stop heartbeat timer when all connections close", async () => {
      vi.useFakeTimers();
      const ws = new WsServer({ heartbeat: { interval: 1000, timeout: 500 } });
      ws.path("/ws", {});

      const onTimedOut = vi.fn();
      ws._startHeartbeat({ onTimedOut });

      ws._handleUpgrade(req(), () => {}, { runtime: "test" });
      await vi.advanceTimersByTimeAsync(50);

      const conn = [...ws.connections][0];
      ws._handleClose(conn, 1000, "normal");

      // Timer should be stopped — advancing time should not trigger onTimedOut
      await vi.advanceTimersByTimeAsync(3000);
      expect(onTimedOut).not.toHaveBeenCalled();
    });
  });

  describe("close server", () => {
    it("should close all connections", async () => {
      const ws = createTestServer();
      ws.path("/ws", {});

      ws._handleUpgrade(req(), () => {});
      ws._handleUpgrade(req(), () => {});
      await new Promise((r) => setTimeout(r, 10));

      expect(ws.size).toBe(2);

      await ws.close();
      expect(ws.size).toBe(0);
    });
  });
});
