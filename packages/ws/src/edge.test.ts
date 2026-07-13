import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { WsServer } from "./index.js";
import { createEdgeWsHandler, createDenoWsHandler } from "./edge.js";
import type { WsConnection } from "./connection.js";

const mockApp = {
  handle: async (request: Request) => {
    return new Response(`Hello from ${new URL(request.url).pathname}`);
  },
  fetch: async (request: Request) => {
    return new Response(`Hello from ${new URL(request.url).pathname}`);
  },
} as import("@nodalite/core").App;

// ---------------------------------------------------------------------------
// Mock WebSocket for CF Workers / Deno edge testing
// ---------------------------------------------------------------------------

class MockWs {
  readyState = 1; // OPEN
  dataListeners: Record<string, ((event: unknown) => void)[]> = {};
  sent: unknown[] = [];
  closed = false;

  send(data: unknown) { this.sent.push(data); }
  close(_code?: number, _reason?: string) { this.closed = true; this.readyState = 3; }
  accept() { /* noop — simulates CF accept */ }
  addEventListener(type: string, listener: (event: unknown) => void) {
    if (!this.dataListeners[type]) this.dataListeners[type] = [];
    this.dataListeners[type].push(listener);
  }
  // Helper for tests: simulate events from "client"
  _simulate(type: string, eventData: unknown) {
    this.dataListeners[type]?.forEach((l) => l(eventData));
  }
}

// Store originals for restoration
let origWebSocketPair: unknown;
let origDeno: unknown;

beforeEach(() => {
  origWebSocketPair = (globalThis as Record<string, unknown>).WebSocketPair;
  origDeno = (globalThis as Record<string, unknown>).Deno;
});

afterEach(() => {
  if (origWebSocketPair !== undefined) {
    (globalThis as Record<string, unknown>).WebSocketPair = origWebSocketPair;
  } else {
    delete (globalThis as Record<string, unknown>).WebSocketPair;
  }
  if (origDeno !== undefined) {
    (globalThis as Record<string, unknown>).Deno = origDeno;
  } else {
    delete (globalThis as Record<string, unknown>).Deno;
  }
});

// ---------------------------------------------------------------------------
// createEdgeWsHandler (Cloudflare Workers)
// ---------------------------------------------------------------------------

describe("@nodalite/ws/edge — Cloudflare Workers", () => {
  it("should pass non-WebSocket HTTP requests to the app", async () => {
    const ws = new WsServer({ heartbeat: false });
    ws.path("/ws", {});

    const handler = createEdgeWsHandler(mockApp, ws);
    const request = new Request("http://localhost/health");
    const response = await handler.fetch(request);
    const body = await response.text();
    expect(body).toContain("Hello from /health");
  });

  it("should return 404 for WebSocket upgrade to unmatched path", async () => {
    const ws = new WsServer({ heartbeat: false });
    ws.path("/ws", {});

    const handler = createEdgeWsHandler(mockApp, ws);
    const request = new Request("http://localhost/unknown", {
      headers: { Upgrade: "websocket" },
    });
    const response = await handler.fetch(request);
    expect(response.status).toBe(404);
  });

  it("should return 501 when WebSocketPair is not available", async () => {
    delete (globalThis as Record<string, unknown>).WebSocketPair;

    const ws = new WsServer({ heartbeat: false });
    ws.path("/ws", {});

    const handler = createEdgeWsHandler(mockApp, ws);
    const request = new Request("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    const response = await handler.fetch(request);
    expect(response.status).toBe(501);
  });

  // NOTE: CF Workers Response constructor accepts status 101 with webSocket,
  // but standard Node.js fetch doesn't. We test side effects via try-catch.
  it("should create connection and register it on WebSocket upgrade", async () => {
    const serverWs = new MockWs();
    const clientWs = new MockWs();
    (globalThis as Record<string, unknown>).WebSocketPair = class {
      0 = clientWs;
      1 = serverWs;
    };

    const ws = new WsServer({ heartbeat: false });
    const openFn = vi.fn();
    ws.path("/ws", { open: openFn });

    const handler = createEdgeWsHandler(mockApp, ws);
    const request = new Request("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });

    // Response with status 101 throws in Node.js — that's expected for CF adapter
    try { await handler.fetch(request); } catch { /* expected in Node.js */ }

    await new Promise((r) => setTimeout(r, 50));
    expect(openFn).toHaveBeenCalled();
    // Connection should be registered in the WsServer
    expect(ws.size).toBe(1);
  });

  it("should call path open handler with correct connection", async () => {
    const serverWs = new MockWs();
    const clientWs = new MockWs();
    (globalThis as Record<string, unknown>).WebSocketPair = class {
      0 = clientWs;
      1 = serverWs;
    };

    const ws = new WsServer({ heartbeat: false });
    let connRef: WsConnection | undefined;
    ws.path("/ws", {
      open: (conn) => { connRef = conn; conn.join("chat"); },
    });

    const handler = createEdgeWsHandler(mockApp, ws);
    const request = new Request("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    try { await handler.fetch(request); } catch { /* expected */ }
    await new Promise((r) => setTimeout(r, 50));

    expect(connRef).toBeDefined();
    expect(connRef!.isJoined("chat")).toBe(true);
    expect(connRef!.platform.runtime).toBe("edge");
  });

  it("should wire up send function correctly", async () => {
    const serverWs = new MockWs();
    const clientWs = new MockWs();
    (globalThis as Record<string, unknown>).WebSocketPair = class {
      0 = clientWs;
      1 = serverWs;
    };

    const ws = new WsServer({ heartbeat: false });
    ws.path("/ws", {
      open: (conn) => { conn.send("hello from server"); },
    });

    const handler = createEdgeWsHandler(mockApp, ws);
    const request = new Request("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    try { await handler.fetch(request); } catch { /* expected */ }
    await new Promise((r) => setTimeout(r, 50));

    expect(serverWs.sent).toContain("hello from server");
  });

  it("should wire up close function correctly", async () => {
    const serverWs = new MockWs();
    const clientWs = new MockWs();
    (globalThis as Record<string, unknown>).WebSocketPair = class {
      0 = clientWs;
      1 = serverWs;
    };

    const ws = new WsServer({ heartbeat: false });
    ws.path("/ws", {
      open: (conn) => { conn.close(1000, "done"); },
    });

    const handler = createEdgeWsHandler(mockApp, ws);
    const request = new Request("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    try { await handler.fetch(request); } catch { /* expected */ }
    await new Promise((r) => setTimeout(r, 50));

    expect(serverWs.closed).toBe(true);
  });

  it("should forward serverWs messages to WsServer._handleMessage", async () => {
    const serverWs = new MockWs();
    const clientWs = new MockWs();
    (globalThis as Record<string, unknown>).WebSocketPair = class {
      0 = clientWs;
      1 = serverWs;
    };

    const ws = new WsServer({ heartbeat: false });
    const msgFn = vi.fn();
    ws.path("/ws", { message: msgFn });

    const handler = createEdgeWsHandler(mockApp, ws);
    const request = new Request("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    try { await handler.fetch(request); } catch { /* expected */ }
    await new Promise((r) => setTimeout(r, 50));

    // Simulate a message arriving on the server-side WebSocket
    serverWs._simulate("message", { data: "test message" });
    await new Promise((r) => setTimeout(r, 50));

    expect(msgFn).toHaveBeenCalled();
  });

  it("should forward serverWs close to WsServer._handleClose", async () => {
    const serverWs = new MockWs();
    const clientWs = new MockWs();
    (globalThis as Record<string, unknown>).WebSocketPair = class {
      0 = clientWs;
      1 = serverWs;
    };

    const ws = new WsServer({ heartbeat: false });
    const closeFn = vi.fn();
    ws.path("/ws", { close: closeFn });

    const handler = createEdgeWsHandler(mockApp, ws);
    const request = new Request("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    try { await handler.fetch(request); } catch { /* expected */ }
    await new Promise((r) => setTimeout(r, 50));

    serverWs._simulate("close", { code: 1000, reason: "bye" });
    await new Promise((r) => setTimeout(r, 50));

    expect(closeFn).toHaveBeenCalled();
  });

  it("should handle wildcard path patterns", async () => {
    const serverWs = new MockWs();
    const clientWs = new MockWs();
    (globalThis as Record<string, unknown>).WebSocketPair = class {
      0 = clientWs;
      1 = serverWs;
    };

    const ws = new WsServer({ heartbeat: false });
    ws.path("/chat/*", {
      open: (conn) => { conn.send("chat-welcome"); },
    });

    const handler = createEdgeWsHandler(mockApp, ws);
    const request = new Request("http://localhost/chat/room1", {
      headers: { Upgrade: "websocket" },
    });
    // CF Response(101) will throw in Node.js — we just verify setup happened
    try { await handler.fetch(request); } catch { /* expected */ }
    await new Promise((r) => setTimeout(r, 50));

    expect(serverWs.sent).toContain("chat-welcome");
  });

  it("should pass env and waitUntil through platform", async () => {
    const serverWs = new MockWs();
    const clientWs = new MockWs();
    (globalThis as Record<string, unknown>).WebSocketPair = class {
      0 = clientWs;
      1 = serverWs;
    };

    const ws = new WsServer({ heartbeat: false });
    let capturedPlatform: Record<string, unknown>;
    ws.path("/ws", {
      open: (conn) => { capturedPlatform = conn.platform; },
    });

    const env = { CF_REGION: "us-east-1" };
    const ctx = { waitUntil: () => {} };

    const handler = createEdgeWsHandler(mockApp, ws);
    const request = new Request("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    try { await handler.fetch(request, env, ctx); } catch { /* expected */ }
    await new Promise((r) => setTimeout(r, 50));

    expect(capturedPlatform.runtime).toBe("edge");
    expect(capturedPlatform.env).toBe(env);
    expect(typeof capturedPlatform.waitUntil).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// createDenoWsHandler
// ---------------------------------------------------------------------------

describe("@nodalite/ws/edge — Deno", () => {
  it("should pass non-WebSocket HTTP requests to the app", async () => {
    const ws = new WsServer({ heartbeat: false });
    ws.path("/ws", {});

    const handler = createDenoWsHandler(mockApp, ws);
    const request = new Request("http://localhost/health");
    const response = await handler(request);
    const body = await response.text();
    expect(body).toContain("Hello from /health");
  });

  it("should return 404 for WebSocket upgrade to unmatched path", async () => {
    const ws = new WsServer({ heartbeat: false });
    ws.path("/ws", {});

    const handler = createDenoWsHandler(mockApp, ws);
    const request = new Request("http://localhost/unknown", {
      headers: { Upgrade: "websocket" },
    });
    const response = await handler(request);
    expect(response.status).toBe(404);
  });

  it("should return 501 when Deno.upgradeWebSocket is not available", async () => {
    delete (globalThis as Record<string, unknown>).Deno;

    const ws = new WsServer({ heartbeat: false });
    ws.path("/ws", {});

    const handler = createDenoWsHandler(mockApp, ws);
    const request = new Request("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    const response = await handler(request);
    expect(response.status).toBe(501);
  });

  it("should handle WebSocket upgrade when Deno.upgradeWebSocket is available", async () => {
    const nativeWs = new MockWs();
    // Deno's upgradeWebSocket returns a real Response — use 200 for test env
    const mockResponse = new Response(null);
    (globalThis as Record<string, unknown>).Deno = {
      upgradeWebSocket: vi.fn().mockReturnValue({ socket: nativeWs, response: mockResponse }),
    };

    const ws = new WsServer({ heartbeat: false });
    const openFn = vi.fn();
    ws.path("/ws", { open: openFn });

    const handler = createDenoWsHandler(mockApp, ws);
    const request = new Request("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    const response = await handler(request);
    expect(response).toBe(mockResponse);

    await new Promise((r) => setTimeout(r, 50));
    expect(openFn).toHaveBeenCalled();
  });

  it("should call Deno.upgradeWebSocket with the request", async () => {
    const nativeWs = new MockWs();
    const mockResponse = new Response(null);
    const upgradeSpy = vi.fn().mockReturnValue({ socket: nativeWs, response: mockResponse });
    (globalThis as Record<string, unknown>).Deno = { upgradeWebSocket: upgradeSpy };

    const ws = new WsServer({ heartbeat: false });
    ws.path("/ws", {});

    const handler = createDenoWsHandler(mockApp, ws);
    const request = new Request("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    await handler(request);

    expect(upgradeSpy).toHaveBeenCalledWith(request);
  });

  it("should set platform to deno", async () => {
    const nativeWs = new MockWs();
    const mockResponse = new Response(null);
    (globalThis as Record<string, unknown>).Deno = {
      upgradeWebSocket: vi.fn().mockReturnValue({ socket: nativeWs, response: mockResponse }),
    };

    const ws = new WsServer({ heartbeat: false });
    let capturedPlatform: Record<string, unknown>;
    ws.path("/ws", {
      open: (conn) => { capturedPlatform = conn.platform; },
    });

    const handler = createDenoWsHandler(mockApp, ws);
    const request = new Request("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    await handler(request);
    await new Promise((r) => setTimeout(r, 50));

    expect(capturedPlatform.runtime).toBe("deno");
  });

  it("should forward messages to WsServer", async () => {
    const nativeWs = new MockWs();
    const mockResponse = new Response(null);
    (globalThis as Record<string, unknown>).Deno = {
      upgradeWebSocket: vi.fn().mockReturnValue({ socket: nativeWs, response: mockResponse }),
    };

    const ws = new WsServer({ heartbeat: false });
    const msgFn = vi.fn();
    ws.path("/ws", { message: msgFn });

    const handler = createDenoWsHandler(mockApp, ws);
    const request = new Request("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    await handler(request);
    await new Promise((r) => setTimeout(r, 50));

    nativeWs._simulate("message", { data: "hello from deno" });
    await new Promise((r) => setTimeout(r, 50));

    expect(msgFn).toHaveBeenCalled();
  });

  it("should forward close to WsServer", async () => {
    const nativeWs = new MockWs();
    const mockResponse = new Response(null);
    (globalThis as Record<string, unknown>).Deno = {
      upgradeWebSocket: vi.fn().mockReturnValue({ socket: nativeWs, response: mockResponse }),
    };

    const ws = new WsServer({ heartbeat: false });
    const closeFn = vi.fn();
    ws.path("/ws", { close: closeFn });

    const handler = createDenoWsHandler(mockApp, ws);
    const request = new Request("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    await handler(request);
    await new Promise((r) => setTimeout(r, 50));

    nativeWs._simulate("close", { code: 1000, reason: "" });
    await new Promise((r) => setTimeout(r, 50));

    expect(closeFn).toHaveBeenCalled();
  });

  it("should handle wildcard path patterns", async () => {
    const nativeWs = new MockWs();
    const mockResponse = new Response(null);
    (globalThis as Record<string, unknown>).Deno = {
      upgradeWebSocket: vi.fn().mockReturnValue({ socket: nativeWs, response: mockResponse }),
    };

    const ws = new WsServer({ heartbeat: false });
    ws.path("/events/*", {
      open: (conn) => { conn.send("events-welcome"); },
    });

    const handler = createDenoWsHandler(mockApp, ws);
    const request = new Request("http://localhost/events/feed", {
      headers: { Upgrade: "websocket" },
    });
    const response = await handler(request);
    expect(response).toBe(mockResponse);

    await new Promise((r) => setTimeout(r, 50));
    expect(nativeWs.sent).toContain("events-welcome");
  });

  it("should register connection and track it in WsServer", async () => {
    const nativeWs = new MockWs();
    const mockResponse = new Response(null);
    (globalThis as Record<string, unknown>).Deno = {
      upgradeWebSocket: vi.fn().mockReturnValue({ socket: nativeWs, response: mockResponse }),
    };

    const ws = new WsServer({ heartbeat: false });
    ws.path("/ws", {});

    const handler = createDenoWsHandler(mockApp, ws);
    const request = new Request("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    await handler(request);
    await new Promise((r) => setTimeout(r, 50));

    expect(ws.size).toBe(1);
  });
});
