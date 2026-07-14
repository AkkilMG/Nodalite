---
description: API reference for @nodalite/adapter-node: serve() to run Nodalite on a plain Node.js HTTP/HTTPS server with graceful shutdown.
---

# @nodalite/adapter-node

Run a Nodalite app on a plain Node.js HTTP/HTTPS server.

```
npm install @nodalite/adapter-node
```

## serve()

```ts
import { serve } from '@nodalite/adapter-node';
import { app } from './app.js';

serve(app, { port: 3000 });
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `port` | `number` | `0` (OS-assigned) | Listening port |
| `host` | `string` | `'0.0.0.0'` | Hostname to bind to |
| `serverOptions` | `http.ServerOptions` | `{}` | Passed directly to `http.createServer` |
| `onListen` | `(address: string) => void` | — | Called when the server starts |

### Returns

A `ServerHandle` with a `close()` method for graceful shutdown.

```ts
const server = serve(app, { port: 3000 });

process.on('SIGTERM', () => {
  server.close();
});
```

## Low-level converters

For advanced use cases (custom servers, testing):

```ts
import { toFetchRequest, sendResponse } from '@nodalite/adapter-node';

// Node IncomingMessage → standard Request
const request = toFetchRequest(incomingMessage, body);

// standard Response → Node ServerResponse
await sendResponse(serverResponse, response);
```
