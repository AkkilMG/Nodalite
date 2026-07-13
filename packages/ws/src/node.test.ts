import { describe, it, expect, vi, afterEach } from "vitest";
import * as http from "node:http";
import WebSocket from "ws";
import { WsServer } from "./index.js";
import { serveWs } from "./node.js";

// We need a minimal app mock for serveWs
const mockApp = {
  handle: async (request: Request) => {
    return new Response(`Hello from ${new URL(request.url).pathname}`);
  },
  fetch: async (request: Request) => {
    return new Response(`Hello from ${new URL(request.url).pathname}`);
  },
} as import("@nodalite/core").App;

let handle: { server: http.Server; close: () => Promise<void> } | undefined;

afterEach(async () => {
  if (handle) {
    await handle.close().catch(() => {});
    handle = undefined;
  }
});

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
    setTimeout(() => reject(new Error("Timeout waiting for open")), 5000);
  });
}

function waitForMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    ws.on("message", (data) => resolve(data.toString()));
    ws.on("error", reject);
    setTimeout(() => reject(new Error("Timeout waiting for message")), 5000);
  });
}

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    ws.on("close", (code, reason) => resolve({ code, reason: reason.toString() }));
    setTimeout(() => resolve({ code: 1006, reason: "timeout" }), 5000);
  });
}

function waitForError(ws: WebSocket): Promise<Error> {
  return new Promise((resolve) => {
    ws.on("error", (err) => resolve(err as Error));
    setTimeout(() => resolve(new Error("timeout")), 5000);
  });
}

describe("@nodalite/ws/node", () => {
  it("should serve HTTP and WebSocket on the same port", async () => {
    const ws = new WsServer({ heartbeat: false });
    ws.path("/ws", {
      open: (conn) => { conn.send("welcome"); },
    });

    handle = await serveWs(mockApp, ws, { port: 0 });

    // HTTP request should work
    const httpRes = await fetch(`http://localhost:${(handle.server.address() as { port: number }).port}/health`);
    const httpBody = await httpRes.text();
    expect(httpBody).toContain("Hello from /health");
  });

  it("should handle WebSocket connections", async () => {
    const ws = new WsServer({ heartbeat: false });
    ws.path("/ws", {
      open: (conn) => { conn.send("welcome"); },
    });

    handle = await serveWs(mockApp, ws, { port: 0 });
    const port = (handle.server.address() as { port: number }).port;

    const client = new WebSocket(`ws://localhost:${port}/ws`);
    const message = await waitForMessage(client);
    expect(message).toBe("welcome");

    client.close();
    await waitForClose(client);
  });

  it("should echo messages back", async () => {
    const ws = new WsServer({ heartbeat: false });
    ws.path("/ws", {
      message: (conn, data) => { conn.send(data); },
    });

    handle = await serveWs(mockApp, ws, { port: 0 });
    const port = (handle.server.address() as { port: number }).port;

    const client = new WebSocket(`ws://localhost:${port}/ws`);
    await waitForOpen(client);

    client.send("hello");
    const message = await waitForMessage(client);
    expect(message).toBe("hello");

    client.close();
    await waitForClose(client);
  });

  it("should handle room broadcasting", async () => {
    const ws = new WsServer({ heartbeat: false });
    ws.path("/ws", {
      open: (conn) => { conn.join("chat"); },
      message: (conn, data) => { conn.to("chat").emit(data as string); },
    });

    handle = await serveWs(mockApp, ws, { port: 0 });
    const port = (handle.server.address() as { port: number }).port;

    const client1 = new WebSocket(`ws://localhost:${port}/ws`);
    const client2 = new WebSocket(`ws://localhost:${port}/ws`);

    await waitForOpen(client1);
    await waitForOpen(client2);

    // Wait for connections to be registered
    await new Promise((r) => setTimeout(r, 50));

    const messages1: string[] = [];
    const messages2: string[] = [];
    client1.on("message", (data) => messages1.push(data.toString()));
    client2.on("message", (data) => messages2.push(data.toString()));

    client1.send("hi from 1");
    await new Promise((r) => setTimeout(r, 50));

    // Only client2 should receive (to() excludes sender)
    expect(messages1).not.toContain("hi from 1");
    expect(messages2).toContain("hi from 1");

    client1.close();
    client2.close();
    await Promise.all([waitForClose(client1), waitForClose(client2)]);
  });

  it("should handle multiple paths", async () => {
    const ws = new WsServer({ heartbeat: false });
    ws.path("/chat", {
      open: (conn) => { conn.send("chat-welcome"); },
    });
    ws.path("/events", {
      open: (conn) => { conn.send("events-welcome"); },
    });

    handle = await serveWs(mockApp, ws, { port: 0 });
    const port = (handle.server.address() as { port: number }).port;

    const chatClient = new WebSocket(`ws://localhost:${port}/chat`);
    const chatMsg = await waitForMessage(chatClient);
    expect(chatMsg).toBe("chat-welcome");
    chatClient.close();
    await waitForClose(chatClient);

    const eventsClient = new WebSocket(`ws://localhost:${port}/events`);
    const eventsMsg = await waitForMessage(eventsClient);
    expect(eventsMsg).toBe("events-welcome");
    eventsClient.close();
    await waitForClose(eventsClient);
  });

  it("should call close handler on disconnect", async () => {
    const closeFn = vi.fn();
    const ws = new WsServer({ heartbeat: false });
    ws.path("/ws", { close: closeFn });

    handle = await serveWs(mockApp, ws, { port: 0 });
    const port = (handle.server.address() as { port: number }).port;

    const client = new WebSocket(`ws://localhost:${port}/ws`);
    await waitForOpen(client);

    client.close(1000, "bye");
    await waitForClose(client);
    await new Promise((r) => setTimeout(r, 50));

    expect(closeFn).toHaveBeenCalled();
  });

  it("should handle per-connection state", async () => {
    const ws = new WsServer({ heartbeat: false });
    ws.path("/ws", {
      open: (conn) => {
        conn.set("username", "Alice" as never);
      },
      message: (conn) => {
        const username = conn.get("username" as never);
        conn.send(`hello ${username}`);
      },
    });

    handle = await serveWs(mockApp, ws, { port: 0 });
    const port = (handle.server.address() as { port: number }).port;

    const client = new WebSocket(`ws://localhost:${port}/ws`);
    await waitForOpen(client);

    client.send("ping");
    const message = await waitForMessage(client);
    expect(message).toBe("hello Alice");

    client.close();
    await waitForClose(client);
  });

  it("should work in zero-dep mode", async () => {
    const ws = new WsServer({ heartbeat: false });
    ws.path("/ws", {
      open: (conn) => { conn.send("zero-dep-welcome"); },
    });

    handle = await serveWs(mockApp, ws, { port: 0, noWsLibrary: true });
    const port = (handle.server.address() as { port: number }).port;

    const client = new WebSocket(`ws://localhost:${port}/ws`);
    const message = await waitForMessage(client);
    expect(message).toBe("zero-dep-welcome");

    client.close();
    await waitForClose(client);
  });

  it("should reject connections beyond maxConnections", async () => {
    const ws = new WsServer({ heartbeat: false, maxConnections: 1 });
    ws.path("/ws", {});

    handle = await serveWs(mockApp, ws, { port: 0 });
    const port = (handle.server.address() as { port: number }).port;

    const client1 = new WebSocket(`ws://localhost:${port}/ws`);
    await waitForOpen(client1);

    const client2 = new WebSocket(`ws://localhost:${port}/ws`);
    const error = await waitForError(client2);
    expect(error.message).toContain("429");

    client1.close();
    await waitForClose(client1);
  });

  it("should reject connections with disallowed origin", async () => {
    const ws = new WsServer({ heartbeat: false, allowedOrigins: ["https://allowed.com"] });
    ws.path("/ws", {});

    handle = await serveWs(mockApp, ws, { port: 0 });
    const port = (handle.server.address() as { port: number }).port;

    const client = new WebSocket(`ws://localhost:${port}/ws`, {
      headers: { Origin: "https://evil.com" },
    });
    const error = await waitForError(client);
    expect(error.message).toContain("403");
  });
});
