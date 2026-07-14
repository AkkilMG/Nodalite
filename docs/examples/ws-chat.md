---
description: WebSocket chat example: real-time chat room using @nodalite/ws with rooms, per-connection state, heartbeat, and multi-path routing.
---

# WebSocket Chat

A real-time chat room using `@nodalite/ws` with rooms, per-connection state, and multi-path routing.

[[toc]]

## What it demonstrates

- **`WsServer`** with path-based routing (`/chat` and `/notifications`)
- **Rooms** — users join a `chat` room; messages broadcast to all room members
- **Per-connection state** — each connection stores a `username`
- **Heartbeat** — keep-alive pings every 30s, timeout after 10s
- **HTTP + WebSocket on same port** via `serveWs()`
- **Global error handling** with `ws.on('error', ...)`

## Running the example

```bash
npm run dev -w examples-ws-chat
```

## Code

### `src/app.ts`

```ts
import { App, HttpError } from '@nodalite/core';
import { WsServer } from '@nodalite/ws';

export const app = new App({ name: 'ws-chat' });
export const ws = new WsServer({
  heartbeat: { interval: 30_000, timeout: 10_000 },
  maxConnections: 100,
});

const users = new Map<string, string>();

ws.path('/chat', {
  open(conn) {
    const url = new URL(conn.request.url);
    const username = url.searchParams.get('username') ?? `user-${conn.id.slice(0, 6)}`;

    conn.set('username', username);
    users.set(conn.id, username);
    conn.join('chat');

    conn.to('chat').emit(
      JSON.stringify({ type: 'system', message: `${username} joined the chat` })
    );
    conn.send(
      JSON.stringify({ type: 'welcome', message: `Welcome, ${username}!`, users: [...users.values()] })
    );
  },
  message(conn, data) {
    const username = conn.get('username') ?? 'anonymous';
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    conn.to('chat').emit(
      JSON.stringify({ type: 'message', username, message: text, timestamp: Date.now() })
    );
  },
  close(conn) {
    const username = users.get(conn.id) ?? 'unknown';
    users.delete(conn.id);
    conn.leave('chat');
    conn.broadcast(JSON.stringify({ type: 'system', message: `${username} left the chat` }));
  },
});

// Separate path for notifications
ws.path('/notifications', {
  open(conn) { conn.join('alerts'); },
  message(conn, data) {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    conn.send(JSON.stringify({ type: 'notification', message: text, timestamp: Date.now() }));
  },
});

app.get('/health', (c) => c.json({ status: 'ok', connections: ws.size }));
app.get('/stats', (c) => c.json({ connections: ws.size, users: [...users.values()] }));
```

### `src/server.ts`

```ts
import { serveWs } from '@nodalite/ws/node';
import { app, ws } from './app.js';

const handle = await serveWs(app, ws, {
  port: Number(process.env.PORT) || 3000,
  onListen: ({ port, hostname }) => {
    console.log(`ws-chat listening on http://${hostname}:${port}`);
  },
});

process.on('SIGINT', async () => {
  await ws.close();
  await handle.close();
  process.exit(0);
});
```

## Connecting

Use any WebSocket client:

```bash
# Connect as Alice
npx wscat -c "ws://localhost:3000/chat?username=Alice"

# Connect as Bob (in another terminal)
npx wscat -c "ws://localhost:3000/chat?username=Bob"
```

Type a message and it will be broadcast to all connected users.

## Key patterns

| Pattern | How |
|---|---|
| Join a room | `conn.join('room-name')` |
| Leave a room | `conn.leave('room-name')` |
| Broadcast to room (excl. sender) | `conn.to('room-name').emit(data)` |
| Broadcast to all (excl. sender) | `conn.broadcast(data)` |
| Per-connection state | `conn.set('key', value)` / `conn.get('key')` |
| Multiple WS endpoints | `ws.path('/path1', {...}); ws.path('/path2', {...})` |
