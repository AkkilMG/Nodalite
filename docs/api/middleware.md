---
description: API reference for @nodalite/middleware: CORS, security headers, rate limiting, JWT auth, body limits, and distributed rate-limit stores.
---

# @nodalite/middleware

First-party security and utility middleware. Zero runtime dependencies of its
own — depends only on `@nodalite/core` and `jose` (for JWT).

```
npm install @nodalite/middleware
```

## cors()

Cross-Origin Resource Sharing middleware.

```ts
import { cors } from '@nodalite/middleware';

app.use('*', cors({ origin: 'https://app.example.com' }));
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `origin` | `string \| string[]` | — | Allowed origin(s). Not set by default (no `ACAO` header sent) |
| `allowMethods` | `string[]` | `['GET','POST','PUT','PATCH','DELETE','OPTIONS']` | Allowed methods |
| `allowHeaders` | `string[]` | `['content-type','authorization']` | Allowed headers |
| `exposeHeaders` | `string[]` | `[]` | Exposed headers |
| `credentials` | `boolean` | `false` | Allow credentials |
| `maxAge` | `number` | — | Preflight cache TTL (seconds) |

## securityHeaders()

OWASP-recommended security headers.

```ts
import { securityHeaders } from '@nodalite/middleware';

app.use('*', securityHeaders());
app.use('*', securityHeaders({ contentSecurityPolicy: "default-src 'self'" }));
```

### Default headers

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |
| `Content-Security-Policy` | `default-src 'self'` (configurable) |

## rateLimit()

Request rate limiting with configurable window and max.

```ts
import { rateLimit, MemoryRateLimitStore } from '@nodalite/middleware';

app.use('/api/*', rateLimit({ max: 100, windowMs: 60000 }));
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `max` | `number` | `60` | Max requests per window |
| `windowMs` | `number` | `60000` | Window duration (ms) |
| `message` | `string` | `"Too many requests"` | Response body on limit reached |
| `store` | `RateLimitStore` | `MemoryRateLimitStore` | Custom store (use Redis for production) |

::: warning
`MemoryRateLimitStore` is **not sufficient on serverless or multi-instance
deployments**. Each instance has its own memory. Implement
[`RateLimitStore`](/api/middleware#ratelimitstore-interface) against Redis,
Upstash, or DynamoDB for distributed rate limiting.
:::

### `RateLimitStore` interface

```ts
interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; ttl: number }>;
}
```

## jwtAuth() / signJwt()

JWT authentication and token signing — built on `jose` (WebCrypto-based).

```ts
import { jwtAuth, signJwt } from '@nodalite/middleware';

// Protect routes
app.use('/api/*', jwtAuth({ secret: new TextEncoder().encode(process.env.JWT_SECRET!) }));

// Sign tokens
const token = await signJwt(
  { sub: user.id, role: 'admin' },
  secret,
  { expiresIn: '1h' }
);
```

### Options (jwtAuth)

| Option | Type | Default | Description |
|---|---|---|---|
| `secret` | `Uint8Array` | — | HMAC secret key (required) |
| `algorithms` | `string[]` | `['HS256']` | Allowed algorithms |

### Options (signJwt)

| Option | Type | Default | Description |
|---|---|---|---|
| `expiresIn` | `string \| number` | — | Expiration duration (`'1h'`, `3600`) |
| `algorithm` | `string` | `'HS256'` | Signing algorithm |

## logger()

Request logging middleware.

```ts
import { logger } from '@nodalite/middleware';

app.use('*', logger());
app.use('*', logger({ exclude: ['/health'] }));
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `exclude` | `string[]` | `[]` | Paths to exclude from logging |

## bodyLimit()

Reject oversized request bodies by `Content-Length` before buffering.

```ts
import { bodyLimit } from '@nodalite/middleware';

app.use('*', bodyLimit({ max: 100_000 })); // 100 KB
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `max` | `number` | `1_000_000` | Max body size in bytes |

## csrf()

Double-submit cookie CSRF protection. Works across all runtimes without
server-side sessions: the server sets a random token as a cookie, and the
client must echo it back in a header or body field. Safe methods (GET, HEAD,
OPTIONS, QUERY) are skipped by default.

```ts
import { csrf } from '@nodalite/middleware';

app.use('*', csrf());
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `cookieName` | `string` | `"XSRF-TOKEN"` | Cookie name for the CSRF token |
| `headerName` | `string` | `"X-XSRF-Token"` | Header name the client must send |
| `bodyField` | `string` | `"_csrf"` | Request body field (fallback) |
| `safeMethods` | `string[]` | `['GET','HEAD','OPTIONS','QUERY']` | Methods that skip validation |
| `generateToken` | `() => string` | `crypto.randomUUID()` | Custom token generator |
| `cookie` | `object` | — | Cookie options (`httpOnly`, `secure`, `sameSite`, `path`, `maxAge`) |

## requestId()

Generates or propagates a unique request ID for every request. Essential for
distributed tracing, log correlation, and debugging across services. If the
client sends an `X-Request-ID` header and `trustUpstream` is true, that
value is reused.

```ts
import { requestId } from '@nodalite/middleware';

app.use('*', requestId());
app.get('/anything', (c) => {
  const id = c.get('requestId');
  return c.json({ requestId: id });
});
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `headerName` | `string` | `"X-Request-ID"` | Header name for ID propagation |
| `generate` | `() => string` | `crypto.randomUUID()` | Custom ID generator |
| `trustUpstream` | `boolean` | `true` | Forward upstream request IDs |
| `contextKey` | `string` | `"requestId"` | Context key for the stored ID |

## apiKey()

API key authentication middleware. Validates incoming API keys against a
pluggable store. Extracts the key from a header, query parameter, or both.

```ts
import { apiKey, MemoryApiKeyStore } from '@nodalite/middleware';

const store = new MemoryApiKeyStore();
store.add('my-secret-key', { plan: 'pro' });

app.use('/api/*', apiKey({ store }));
app.get('/api/data', (c) => {
  const key = c.get('apiKey');
  return c.json({ plan: key?.metadata?.plan });
});
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `extractFrom` | `'header' \| 'query' \| 'both'` | `'header'` | Where to read the key from |
| `headerName` | `string` | `"X-API-Key"` | Header name |
| `queryParam` | `string` | `"api_key"` | Query parameter name |
| `store` | `ApiKeyStore` | — | Key store (required) |
| `contextKey` | `string` | `"apiKey"` | Context key for validated key info |

### `ApiKeyStore` interface

```ts
interface ApiKeyStore {
  validate(key: string): Promise<{ id: string; metadata?: Record<string, unknown> } | null>;
}
```

### `MemoryApiKeyStore`

In-memory store for development and single-process deployments. Methods:
`add(key, metadata?)`, `remove(key)`, `validate(key)`, `destroy()`.

::: warning
`MemoryApiKeyStore` is **not sufficient on serverless or multi-instance
deployments**. Implement `ApiKeyStore` against Redis, DynamoDB, etc. for
production.
:::

## ipGuard()

IP allowlisting/blocklisting middleware. Supports individual IPs and CIDR
notation (e.g., `192.168.0.0/16`).

```ts
import { ipGuard } from '@nodalite/middleware';

app.use('*', ipGuard({ mode: 'deny', list: ['10.0.0.0/8', '192.168.0.0/16'] }));
app.use('/admin/*', ipGuard({ mode: 'allow', list: ['203.0.113.50'] }));
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `mode` | `'allow' \| 'deny'` | `'deny'` | Allow-only listed or block listed |
| `list` | `string[]` | — | IPs or CIDR ranges (required) |
| `keyGenerator` | `(c) => string` | platform IP or `x-forwarded-for` | How to derive the client IP |
| `message` | `string` | `"Access denied"` | Custom rejection message |

## contentTypeGuard()

Validates that incoming requests have an allowed `Content-Type` header.
Rejects with 415 Unsupported Media Type on mismatch.

```ts
import { contentTypeGuard } from '@nodalite/middleware';

app.post('/data', handler, [contentTypeGuard({ required: ['application/json'] })]);
app.use('/upload/*', contentTypeGuard({ required: ['multipart/*', 'application/json'] }));
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `required` | `string[]` | — | Allowed Content-Types (supports wildcards like `multipart/*`) |
| `methods` | `string[]` | `['POST','PUT','PATCH','QUERY']` | Methods to enforce on |
| `message` | `string` | — | Custom rejection message |

## requestTimeout()

Enforces a per-request timeout using `Promise.race`. If the handler chain
doesn't complete within the specified duration, returns 408 Request Timeout.

```ts
import { requestTimeout } from '@nodalite/middleware';

app.use('*', requestTimeout({ ms: 10_000 })); // 10 second timeout
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `ms` | `number` | — | Timeout in milliseconds (required) |
| `message` | `string` | — | Custom rejection message |

## xssSanitize()

Sanitizes string values in JSON request bodies to prevent stored XSS. Encodes
HTML entities (`<`, `>`, `"`, `'`, etc.) by default. The sanitized body is
stored in context — use `sanitizedBody()` to retrieve it.

```ts
import { xssSanitize, sanitizedBody } from '@nodalite/middleware';

app.post('/comments', async (c) => {
  const body = sanitizedBody<{ text: string }>(c);
  return c.json({ text: body.text });
}, [xssSanitize()]);
```

::: warning
Handlers **must** use `sanitizedBody<T>(c)` instead of `c.req.json()` to
get sanitized data. The middleware stores the result in context; the original
request body is not modified.
:::

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `fields` | `string[]` | — | Specific fields to sanitize (all strings if omitted) |
| `sanitizeQuery` | `boolean` | `false` | Also sanitize query parameters |
| `sanitizer` | `(value: string) => string` | HTML entity encoding | Custom sanitizer function |

### `sanitizedBody<T>(c)`

Helper function to retrieve the sanitized body from context. Returns the
sanitized object typed as `T`.

## ssrfGuard()

SSRF (Server-Side Request Forgery) protection. Validates that user-supplied
URLs don't point to internal/private IP ranges, cloud metadata endpoints, or
other non-routable addresses. Resolves hostnames via DNS and checks against
blocked CIDR ranges.

```ts
import { ssrfGuard } from '@nodalite/middleware';

app.post('/fetch-url', handler, [ssrfGuard()]);
app.post('/webhook', handler, [ssrfGuard({ allowPrivate: true })]);
```

Default blocked ranges include RFC 1918 private networks, link-local,
loopback, and cloud metadata endpoints (`169.254.0.0/16`).

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `blockList` | `string[]` | `[]` | Additional IPs/CIDRs to block |
| `allowPrivate` | `boolean` | `false` | Allow requests to private networks |
| `extractUrl` | `(c) => Promise<string \| null>` | reads `url` from JSON body | How to extract the target URL |
| `message` | `string` | — | Custom rejection message |

::: info
On edge runtimes (Cloudflare Workers), DNS resolution is unavailable —
IP-level checks are skipped but localhost and protocol validation still apply.
:::

## sessions()

Cookie-based session middleware with HMAC-signed session IDs. Session data
lives in the store (in-memory for dev, Redis/database for production). Mutations
to the session object are automatically persisted after the response.

```ts
import { sessions } from '@nodalite/middleware';

app.use('*', sessions({ secret: process.env.SESSION_SECRET! }));

app.get('/login', async (c) => {
  const session = c.get('session');
  session.userId = '123';
  return c.json({ loggedIn: true });
});

app.get('/me', (c) => {
  const session = c.get('session');
  return c.json({ userId: session?.userId });
});
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `cookieName` | `string` | `"sid"` | Cookie name |
| `secret` | `string` | — | HMAC secret for signing session IDs (required) |
| `maxAge` | `number` | `86400` | Session max age in seconds |
| `store` | `SessionStore` | `MemorySessionStore` | Session store |
| `contextKey` | `string` | `"session"` | Context key for session data |
| `cookie` | `object` | — | Cookie options (`httpOnly`, `secure`, `sameSite`, `path`) |

### `SessionStore` interface

```ts
interface SessionStore {
  get(id: string): Promise<Record<string, unknown> | null>;
  set(id: string, data: Record<string, unknown>, maxAge: number): Promise<void>;
  destroy(id: string): Promise<void>;
}
```

### `MemorySessionStore`

In-memory store with automatic expired-session cleanup. Methods: `get(id)`,
`set(id, data, maxAge)`, `destroy(id)`, `destroy_()` (release timer + clear).

::: warning
`MemorySessionStore` is **not sufficient on serverless or multi-instance
deployments**. Implement `SessionStore` against Redis, DynamoDB, etc. for
production.
:::
