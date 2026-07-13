import { App, HttpError } from "@nodalite/core";
import { WsServer } from "@nodalite/ws";

export const app = new App({ name: "ws-chat" });
export const ws = new WsServer({
  heartbeat: { interval: 30_000, timeout: 10_000 },
  maxConnections: 100,
});

// Track connected users
const users = new Map<string, string>(); // connId -> username

// WebSocket chat — two paths to demonstrate multi-path routing
ws.path("/chat", {
  open(conn) {
    const username = conn.request.url.includes("username=")
      ? new URL(conn.request.url).searchParams.get("username") ?? `user-${conn.id.slice(0, 6)}`
      : `user-${conn.id.slice(0, 6)}`;

    conn.set("username", username as never);
    users.set(conn.id, username);
    conn.join("chat");

    // Notify the room
    const joinMsg = JSON.stringify({ type: "system", message: `${username} joined the chat` });
    conn.to("chat").emit(joinMsg);

    // Welcome the new user
    conn.send(JSON.stringify({
      type: "welcome",
      message: `Welcome to the chat, ${username}!`,
      users: [...users.values()],
    }));
  },

  message(conn, data) {
    const username = conn.get("username" as never) ?? "anonymous";
    const text = typeof data === "string" ? data : new TextDecoder().decode(data as ArrayBuffer);

    // Broadcast to everyone in the chat room (including sender)
    const msg = JSON.stringify({ type: "message", username, message: text, timestamp: Date.now() });
    conn.to("chat").emit(msg);
  },

  close(conn) {
    const username = users.get(conn.id) ?? "unknown";
    users.delete(conn.id);
    conn.leave("chat");

    const leaveMsg = JSON.stringify({ type: "system", message: `${username} left the chat` });
    conn.broadcast(leaveMsg);
  },
});

// A separate "notifications" path to demonstrate path routing
ws.path("/notifications", {
  open(conn) {
    conn.join("alerts");
    conn.send(JSON.stringify({ type: "welcome", message: "Connected to notifications" }));
  },
  message(conn, data) {
    // Echo back with server timestamp
    const text = typeof data === "string" ? data : new TextDecoder().decode(data as ArrayBuffer);
    conn.send(JSON.stringify({ type: "notification", message: text, timestamp: Date.now() }));
  },
});

// Global error handler
ws.on("error", (error, conn) => {
  console.error(`WebSocket error on ${conn?.id}:`, error);
});

// ---------------------------------------------------------------------------
// HTTP routes — these work alongside WebSocket on the same port
// ---------------------------------------------------------------------------

// Health check
app.get("/health", (c) => c.json({ status: "ok", connections: ws.size }));

// Connection stats
app.get("/stats", (c) => c.json({
  connections: ws.size,
  users: [...users.values()],
}));

// POST a message from HTTP → broadcast to all WebSocket chat clients
// This demonstrates cross-protocol interaction: HTTP triggering WebSocket events
app.post("/broadcast", async (c) => {
  const body = await c.req.json<{ message?: string }>();
  const message = body?.message;
  if (!message || typeof message !== "string") {
    return c.status(400).json({ error: "Missing 'message' field in body" });
  }

  const payload = JSON.stringify({
    type: "broadcast",
    message,
    timestamp: Date.now(),
  });
  ws.toRoom("chat").emit(payload);

  return c.json({ ok: true, recipients: ws.getRoom("chat").size });
});

app.onError((err, c) => {
  const httpErr = err instanceof HttpError ? err : HttpError.internal(undefined, err);
  return c.status(httpErr.status).json(httpErr.toJSON());
});
