# @nodalite/middleware

First-party security and utility middleware. Zero runtime dependencies.

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
