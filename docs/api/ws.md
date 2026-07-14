---
description: API reference for @nodalite/ws: runtime-agnostic WebSocket server with rooms, heartbeat, path routing, and adapters for Node, Edge, Bun, Deno, and Lambda.
---

# @nodalite/ws

Runtime-agnostic WebSocket server with path-based routing, rooms, heartbeat, and per-connection state.

```bash
npm install @nodalite/ws
# For Node.js with ws library (optional — zero-dep fallback available):
npm install ws
```

## Sub-path exports

| Import | Description |
|---|---|
| `@nodalite/ws` | Core: `WsServer`, `WsConnection`, `RoomManager`, `HeartbeatManager`, `WsBroadcaster` |
| `@nodalite/ws/node` | Node.js adapter: `serveWs()` — HTTP + WebSocket on same port |
| `@nodalite/ws/edge` | Edge adapters: `createEdgeWsHandler()`, `createBunWsConfig()`, `createDenoWsHandler()` |
| `@nodalite/ws/lambda` | Lambda adapter: `createLambdaWsHandler()` + `ConnectionStore` interface |

## Quick start

### Node.js

```ts
import { WsServer } from '@nodalite/ws';
import { serveWs } from '@nodalite/ws/node';

const ws = new WsServer();

ws.path('/chat', {
  open(conn) {
    conn.join('general');
    conn.send(JSON.stringify({ type: 'welcome', id: conn.id }));
  },
  message(conn, data) {
    conn.to('general').emit(data);
  },
  close(conn) {
    console.log(`${conn.id} disconnected`);
  },
});

serveWs(app, ws, { port: 3000 });
```

### Cloudflare Workers

```ts
import { createEdgeWsHandler } from '@nodalite/ws/edge';

export default createEdgeWsHandler(app, ws);
```

### Deno

```ts
import { createDenoWsHandler } from '@nodalite/ws/edge';

Deno.serve(createDenoWsHandler(app, ws));
```

### Bun

```ts
import { createBunWsConfig } from '@nodalite/ws/edge';

Bun.serve({ ...createBunWsConfig(app, ws), port: 3000 });
```

### AWS Lambda

```ts
import { createLambdaWsHandler } from '@nodalite/ws/lambda';

export const handler = createLambdaWsHandler(ws, {
  store: myConnectionStore, // implement ConnectionStore interface
  postToConnection: mySender,
});
```

---

## API Reference

### `WsServer`

The core WebSocket server. Manages connections, rooms, heartbeat, and path-based routing.

```ts
import { WsServer } from '@nodalite/ws';

const ws = new WsServer({
  heartbeat: { interval: 30_000, timeout: 10_000 }, // or false to disable
  maxPayload: 1_048_576,  // 1 MB
  maxConnections: 0,       // 0 = unlimited
  allowedOrigins: ['https://example.com'], // or (origin) => boolean
});
```

#### `ws.path(pattern, handlers)`

Register lifecycle handlers for a WebSocket path pattern. Supports wildcards (`/chat/*`).

```ts
ws.path('/chat', {
  open(conn) { /* client connected */ },
  message(conn, data, isBinary) { /* received message */ },
  close(conn, code, reason) { /* client disconnected */ },
  error(conn, error) { /* connection error */ },
});
```

#### `ws.on('connection', handler)`

Global open handler — runs for all paths.

```ts
ws.on('connection', (conn) => {
  console.log(`New connection: ${conn.id}`);
});
```

#### `ws.on('error', handler)`

Global error handler.

```ts
ws.on('error', (error, conn) => {
  console.error(`Error on ${conn?.id}:`, error);
});
```

#### `ws.use(middleware)`

Register a message middleware — runs on every message for all paths.

```ts
ws.use((conn, data, next) => {
  // Run before every message handler
  next();
});
```

#### `ws.connections`

`ReadonlySet<WsConnection>` — all active connections.

#### `ws.getConnection(id)`

Get a connection by its ID.

#### `ws.getRoom(room)`

Get all connections in a room.

#### `ws.broadcast(data)`

Broadcast a message to all connected clients.

#### `ws.toRoom(room)`

Get a `WsBroadcaster` scoped to a room.

#### `ws.size`

Number of active connections.

#### `ws.close()`

Close all connections and stop accepting new ones.

---

### `WsConnection`

A unified wrapper around a native WebSocket. Provides room management, typed per-connection state, and a consistent API across all runtimes.

```ts
// Per-connection typed state
conn.set('username', 'Alice');
const name = conn.get('username'); // 'Alice'

// Send a message
conn.send('hello');
conn.send(new ArrayBuffer(8));

// Close
conn.close(1000, 'bye');

// Rooms
conn.join('chat', 'notifications');
conn.leave('notifications');
conn.isJoined('chat'); // true
conn.rooms; // ReadonlySet<string>
```

#### Properties

| Property | Type | Description |
|---|---|---|
| `id` | `string` | Unique connection ID (UUID) |
| `request` | `Request` | The original upgrade request |
| `remoteAddress` | `string` | Client IP address |
| `connectedAt` | `number` | Connection timestamp (ms) |
| `platform` | `WsPlatform` | Adapter-supplied platform info |
| `isOpen` | `boolean` | Whether the connection is open |
| `protocol` | `string \| undefined` | WebSocket sub-protocol |
| `rooms` | `ReadonlySet<string>` | Rooms this connection belongs to |

#### Methods

| Method | Description |
|---|---|
| `send(data)` | Send a message to this client |
| `close(code?, reason?)` | Close the connection |
| `join(...rooms)` | Join one or more rooms |
| `leave(...rooms)` | Leave one or more rooms |
| `isJoined(room)` | Check if in a room |
| `to(...rooms)` | Get a `WsBroadcaster` scoped to rooms (excludes self) |
| `broadcast(data)` | Broadcast to all clients except self |
| `set(key, value)` | Set per-connection state |
| `get(key)` | Get per-connection state |

---

### `RoomManager`

Manages room membership. Used internally by `WsServer` but available for direct use.

```ts
import { RoomManager } from '@nodalite/ws';

const rooms = new RoomManager();
rooms.join(connId, 'chat', 'general');
rooms.leave(connId, 'general');
rooms.get('chat'); // Set<string> of connection IDs
rooms.getConnRooms(connId); // Set<string> of room names
```

---

### `HeartbeatManager`

Pure state tracker for connection liveness. Managed internally by `WsServer` — you configure heartbeat via `WsServer` options, not by instantiating `HeartbeatManager` directly.

`HeartbeatManager` has no internal timers. `WsServer` owns a single centralized `setInterval` that starts lazily on the first connection and stops when all connections close. The heartbeat cycle runs in this order:

1. `getTimedOut()` — returns connections that didn't respond since the last cycle
2. Timed-out connections are terminated (adapter closes them)
3. Pings are sent to all tracked connections
4. `markAll()` — marks all as "needs response" for the next cycle
5. `markAlive(connId)` is called by the adapter when a pong is received

```ts
// Configured via WsServer options:
const ws = new WsServer({
  heartbeat: {
    interval: 30_000, // ms between pings
    timeout: 10_000,  // ms to wait for pong
    payload: () => '{"t":"ping"}', // custom payload
  },
});
```

On Node.js with the `ws` library, heartbeat uses protocol-level `ping`/`pong` frames via `nativeWs.ping()`. On the zero-dependency Node fallback, it sends RFC 6455 ping frames (opcode 9). On edge runtimes (Cloudflare Workers, Deno) and Bun, it uses application-level JSON messages via `conn.send(payload)`.

---

### `WsBroadcaster`

Scoped message broadcasting. Returned by `conn.to()`.

```ts
// Send to all clients in 'chat' except the sender
conn.to('chat').emit(data);

// Send to specific rooms
conn.to('chat', 'notifications').emit({ type: 'alert', message: 'hi' });
```

---

## Types

### `WsServerOptions`

```ts
interface WsServerOptions {
  maxPayload?: number;       // Default: 1048576 (1 MB)
  heartbeat?: false | {
    interval?: number;       // Default: 30000
    timeout?: number;        // Default: 10000
    payload?: () => WsMessage;
  };
  maxConnections?: number;   // Default: 0 (unlimited)
  allowedOrigins?: string[] | ((origin: string) => boolean);
}
```

### `WsHandlerSet`

```ts
interface WsHandlerSet {
  open?: (conn: WsConnection) => void | Promise<void>;
  message?: (conn: WsConnection, data: WsMessage, isBinary: boolean) => void | Promise<void>;
  close?: (conn: WsConnection, code: number, reason: string) => void | Promise<void>;
  error?: (conn: WsConnection, error: Error) => void;
}
```

### `WsMiddleware`

```ts
type WsMiddleware = (
  conn: WsConnection,
  data: WsMessage,
  next: () => void | Promise<void>,
) => void | Promise<void>;
```

### `WsMessage`

```ts
type WsMessage = string | ArrayBuffer | ArrayBufferView;
```

### `WsPlatform`

```ts
interface WsPlatform {
  runtime: string;           // "node", "edge", "aws-lambda", etc.
  ip?: string;
  [key: string]: unknown;    // adapter-specific data
}
```

---

## Node.js adapter (`@nodalite/ws/node`)

### `serveWs(app, wsServer, options?)`

Serve both HTTP and WebSocket on the same port.

```ts
import { serveWs } from '@nodalite/ws/node';

const handle = await serveWs(app, ws, {
  port: 3000,
  hostname: '0.0.0.0',
  noWsLibrary: true, // use zero-dep fallback (RFC 6455 minimal parser)
  onListen: ({ port }) => console.log(`Listening on ${port}`),
});

// Graceful shutdown
await handle.close();
```

When the `ws` package is installed, `serveWs` uses it for production-grade WebSocket handling. Set `noWsLibrary: true` to use the built-in zero-dependency RFC 6455 parser instead.

---

## Edge adapters (`@nodalite/ws/edge`)

### `createEdgeWsHandler(app, wsServer)`

Cloudflare Workers adapter. Returns a `fetch` handler.

```ts
import { createEdgeWsHandler } from '@nodalite/ws/edge';

const handler = createEdgeWsHandler(app, ws);
export default handler; // CF Workers default export
```

### `createBunWsConfig(app, wsServer)`

Bun adapter. Returns a config object to spread into `Bun.serve()`.

```ts
import { createBunWsConfig } from '@nodalite/ws/edge';

Bun.serve({ ...createBunWsConfig(app, ws), port: 3000 });
```

### `createDenoWsHandler(app, wsServer)`

Deno adapter. Returns an async request handler.

```ts
import { createDenoWsHandler } from '@nodalite/ws/edge';

Deno.serve(createDenoWsHandler(app, ws));
```

---

## Lambda adapter (`@nodalite/ws/lambda`)

### `createLambdaWsHandler(wsServer, options)`

Create a Lambda handler for API Gateway WebSocket API.

```ts
import { createLambdaWsHandler } from '@nodalite/ws/lambda';

export const handler = createLambdaWsHandler(ws, {
  store: myConnectionStore,
  postToConnection: async (endpoint, connectionId, data) => {
    // Send data via API Gateway Management API
  },
  callbackUrl: 'https://xxx.execute-api.region.amazonaws.com/prod', // optional
});
```

### `ConnectionStore`

Interface for persisting WebSocket connection state in Lambda (stateless functions).

```ts
interface ConnectionStore {
  set(connectionId: string, metadata: ConnectionMetadata): Promise<void>;
  get(connectionId: string): Promise<ConnectionMetadata | null>;
  delete(connectionId: string): Promise<void>;
  findBy(key: string, value: unknown): Promise<ConnectionMetadata[]>;
  cleanup?(olderThanMs: number): Promise<number>; // optional
}
```

### `ConnectionMetadata`

```ts
interface ConnectionMetadata {
  connectionId: string;
  connectedAt: number;
  data?: Record<string, unknown>; // arbitrary metadata (userId, rooms, etc.)
}
```

Implement `ConnectionStore` against DynamoDB, Redis, Postgres, or any shared datastore. Do **not** use an in-memory store in production — Lambda functions are stateless and each invocation may run on a different instance.
