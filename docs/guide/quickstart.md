# Quick Start

Get a Nodalite API server running in two minutes.

## 1. Install

```bash
npm install @nodalite/core @nodalite/middleware @nodalite/adapter-node
```

## 2. Create your app

```ts
// app.ts
import { App } from '@nodalite/core';
import { cors, securityHeaders } from '@nodalite/middleware';
import { serve } from '@nodalite/adapter-node';

const app = new App();

// Global middleware — applies to every route
app.use('*', securityHeaders());
app.use('*', cors({ origin: 'https://your-frontend.example' }));

// Routes
app.get('/health', (c) => c.json({ ok: true }));
app.get('/users/:id', (c) => c.json({ id: c.req.param('id') }));

app.post('/users', async (c) => {
  const body = await c.req.json<{ name: string }>();
  return c.json({ created: body.name }, { status: 201 });
});

// Start listening
serve(app, { port: 3000 });
console.log('Server running on http://localhost:3000');
```

## 3. Run it

```bash
npx tsx app.ts
# Or compile first:
npx tsc && node dist/app.js
```

```bash
curl http://localhost:3000/health
# {"ok":true}

curl http://localhost:3000/users/42
# {"id":"42"}

curl -X POST http://localhost:3000/users \
  -H 'content-type: application/json' \
  -d '{"name":"Alice"}'
# {"created":"Alice"}
```

## Same app on other runtimes

The exact same `app` object works everywhere — just swap the adapter:

### AWS Lambda
```ts
import { createLambdaHandler } from '@nodalite/adapter-lambda';
export const handler = createLambdaHandler(app);
```

### Cloudflare Workers
```ts
import { createEdgeHandler } from '@nodalite/adapter-edge';
export default createEdgeHandler(app);
```

### Bun / Deno
```ts
// Bun
Bun.serve({ fetch: (req) => app.fetch(req) });
// Deno
Deno.serve((req) => app.fetch(req));
```

## What's next?

- [Installation](/guide/installation) — full monorepo setup
- [Core Concepts](/guide/core-concepts) — how the request pipeline works
- [API Reference](/api/core) — App, Context, and Router
