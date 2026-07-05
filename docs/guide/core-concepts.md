# Core Concepts

## The Fetch API foundation

Nodalite is built on the standard **Fetch API** (`Request`, `Response`,
`Headers`, `ReadableStream`) — the same primitives that browsers, Node 18+,
Bun, Deno, and Cloudflare Workers all implement natively.

This is the single most important architectural decision:

- Your routing, middleware, and handler code never touches runtime-specific
  shapes like Node's `IncomingMessage` or AWS's `APIGatewayProxyEvent`.
- Each adapter is a thin conversion layer (a few dozen lines) — translate the
  runtime's native request into a standard `Request`, call `app.handle()`,
  translate the returned `Response` back.
- `@nodalite/core` has **zero runtime dependencies** — it only needs what the
  JS runtime already provides.

Contrast with Express: `req`/`res` are Node-specific objects tied to
`http.IncomingMessage`/`http.ServerResponse`. That's why Express needs a
translation shim (`serverless-http`) to run on Lambda at all, and why it
can't run on Workers or Deno without a much heavier compatibility layer.

## Package layout

```
packages/
  core/            @nodalite/core          — router, Context, App, middleware compose, errors, validation
  middleware/      @nodalite/middleware     — cors, securityHeaders, rateLimit, jwtAuth, logger, bodyLimit
  adapter-node/    @nodalite/adapter-node   — serve() for plain Node http/https
  adapter-lambda/  @nodalite/adapter-lambda — createLambdaHandler() for API Gateway v1/v2 + Lambda Function URLs
  adapter-edge/    @nodalite/adapter-edge   — createEdgeHandler() for Cloudflare Workers
  workers/         @nodalite/workers        — runDetached() + WorkerPool
  scheduler/       @nodalite/scheduler      — Scheduler (cron/interval) + toServerlessTask()
  ml/              @nodalite/ml             — Model (cached, engine-agnostic inference) + onnxEngine()
```

**Why multiple packages instead of one big framework?** Three reasons:

1. **Tree-shaking** — a Cloudflare Worker deploying with `adapter-edge` should
   never pull in Node's `worker_threads` or Lambda event types.
2. **Dependency isolation** — `@nodalite/ml`'s ONNX integration depends on a
   ~270MB native package, but it's an optional peer dependency imported
   dynamically. Apps that never touch ML pay nothing for it.
3. **Independent versioning** — `@nodalite/adapter-lambda` can ship a fix for
   an AWS event shape edge case without forcing a version bump on
   `@nodalite/core`.

## Request pipeline

```
Request (adapter-specific)
   │
   ▼  adapter converts to standard Request
App.handle(request, platform)
   │
   ├─ Router.match(method, path)  → route + middlewares, or null
   ├─ build Context(request, params, platform)
   ├─ compose([...global, ...route middlewares], finalHandler)
   │     · onion model: each middleware wraps what's after it
   │     · middleware returns next() to continue, or its own Response to short-circuit
   └─ run composed chain
         · HttpError → JSON body + status
         · unexpected errors → wrapped as 500, never leak internals
   │
   ▼  adapter converts Response back to its native shape
Response (adapter-specific)
```

### Key properties

- **No dangling promises** — every middleware/handler must resolve to a
  `Response`. There's no "returned undefined, silently did nothing" case.
- **Errors can't leak internals** — `HttpError.expose` defaults to `true`
  only for 4xx errors. Anything else becomes a generic "Internal Server Error"
  in the response while the real error is logged server-side.
- **Path-scoped global middleware** — `app.use('/api/*', mw)` only runs for
  matching paths, checked per-request.

## Context (`c`)

Every handler and middleware receives a `Context` object (conventionally
destructured as `c`):

```ts
app.get('/users/:id', (c) => {
  // Request helpers
  c.req.param('id');      // typed route params
  c.req.query('sort');    // query string
  c.req.header('authorization');
  c.req.json();           // cached body parsing (safe to call multiple times)

  // Response helpers
  c.json({ id: '123' });           // JSON response
  c.html('<h1>Hello</h1>');        // HTML response
  c.text('plain');                  // plain text
  c.redirect('/login');            // redirect
  c.status(201).json({ ok: true });// set status + body
  c.stream(readableStream);        // streaming response
  c.noContent();                   // 204

  // Request-scoped store (generic-typed)
  c.set('user', { id: '123' });
  c.get('user'); // typed via Env generic
});
```

## Route groups

Group routes under a shared prefix with group-scoped middleware:

```ts
app.group('/api/v1', (group) => {
  group.use(authMiddleware);
  group.get('/users', listUsers);
  group.post('/users', createUser);
  group.get('/users/:id', getUser);
});
```

## Error handling

```ts
import { HttpError } from '@nodalite/core';

// Throw in handlers or middleware
app.get('/admin', (c) => {
  throw HttpError.unauthorized('Admin access required');
});

// Custom error handler
app.onError((err, c) => {
  console.error(`[${c.get('requestId')}]`, err);
  return c.json({ error: 'Something broke' }, { status: 500 });
});

// Custom 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, { status: 404 });
});
```

## Next

- [API Reference: @nodalite/core](/api/core) — full API details
- [Security Checklist](/guides/security) — production hardening
- [Deployment Guide](/guides/deployment) — every target
