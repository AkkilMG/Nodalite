# @nodalite/adapter-edge

Run a Nodalite app on Cloudflare Workers.

Bun and Deno don't need an adapter — they natively accept the Fetch API
signature that `app.fetch` already matches.

```
npm install @nodalite/adapter-edge
```

## createEdgeHandler()

```ts
import { createEdgeHandler } from '@nodalite/adapter-edge';
import { app } from './app.js';

export default createEdgeHandler(app);
```

Cloudflare Workers receive `env` (bindings: KV, D1, R2, secrets) and
`ctx` (for `waitUntil`). This helper forwards them into `c.platform`:

```ts
// In your handler:
app.get('/users', async (c) => {
  const kv = c.platform.env as { USERS: KVNamespace };
  const users = await kv.USERS.get('all', 'json');
  return c.json(users);
});
```

### `c.platform` shape

| Property | Type | Description |
|---|---|---|
| `runtime` | `"edge"` | Always `"edge"` |
| `env` | `Record<string, unknown>` | Cloudflare Worker bindings |
| `waitUntil` | `(promise) => void` | For background tasks after response |

## Direct usage (Bun / Deno)

No adapter needed:

```ts
// Bun
Bun.serve({ fetch: (req) => app.fetch(req) });

// Deno
Deno.serve((req) => app.fetch(req));
```
