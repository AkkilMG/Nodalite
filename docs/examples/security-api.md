---
description: Security API example: comprehensive demonstration of all security middleware in @nodalite/middleware composing together in a real API.
---

# Security API Example

Comprehensive demonstration of all 9 new security middleware in
`@nodalite/middleware`, showing how they compose together in a real API.

## Run it

```bash
npm run dev -w examples-security-api
```

## What it demonstrates

### Middleware stack

The app registers middleware in layers, from broadest to most specific:

```ts
// Layer 1: Global
app.use('*', requestId());
app.use('*', securityHeaders());
app.use('*', cors({ origin: ['http://localhost:5173'], credentials: true }));
app.use('*', rateLimit({ windowMs: 60_000, max: 100 }));
app.use('*', requestTimeout({ ms: 15_000 }));
app.use('*', csrf());

// Layer 2: Sessions
app.use('*', sessions({ secret: process.env.SESSION_SECRET! }));

// Layer 3: Route-scoped
app.use('/admin/*', ipGuard({ mode: 'allow', list: ['127.0.0.1'] }));
app.use('/api/*', apiKey({ store }));
```

### Session tracking

Cookie-based sessions with HMAC-signed IDs. Mutations are auto-persisted:

```bash
curl -c cookies.txt localhost:3001/session/set
# {"views":1}
curl -b cookies.txt localhost:3001/session/get
# {"views":1}
```

### API key auth

Machine-to-machine authentication with `MemoryApiKeyStore`:

```bash
curl localhost:3001/api/data -H "X-API-Key: demo-key-abc123"
# {"message":"Authenticated via API key","plan":"pro",...}
```

### XSS sanitization

HTML entities encoded in JSON bodies. Use `sanitizedBody()` in handlers:

```bash
curl -X POST localhost:3001/api/comments \
  -H 'content-type: application/json' \
  -d '{"text":"<script>alert(1)</script>","author":"attacker"}'
# {"stored":"&lt;script&gt;alert(1)&lt;/script&gt;",...}
```

### SSRF protection

Blocks requests to internal networks and cloud metadata endpoints:

```bash
curl -X POST localhost:3001/api/preview \
  -H 'content-type: application/json' \
  -d '{"url":"http://169.254.169.254/latest/meta-data/"}'
# 403 Forbidden
```

### Request ID

Every response includes an `X-Request-ID` header for distributed tracing.
The ID is also available in handlers via `c.get('requestId')`.

## Production notes

- Replace `MemoryApiKeyStore` and `MemorySessionStore` with Redis-backed
  implementations for multi-instance deployments
- Set `SESSION_SECRET` to a strong random value
- Enable `cookie.secure: true` for sessions behind HTTPS
- `ssrfGuard` uses `node:dns` for hostname resolution — on edge runtimes it
  skips IP-level checks but still validates protocol and localhost
