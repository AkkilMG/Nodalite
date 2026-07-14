---
description: Production security checklist for Nodalite: CORS, security headers, rate limiting, JWT auth, CSRF, SSRF protection, and input validation.
---

# Security Checklist

Everything here ships in `@nodalite/middleware`. Understanding *why* each one
matters is what makes you able to configure them correctly.

## CORS (`cors()`)

Secure by default: if you don't configure `origin`, no
`Access-Control-Allow-Origin` header is sent at all — rather than silently
allowing `*`.

- Set `origin` to your actual frontend origin(s) in production
- Only use `'*'` for genuinely public, unauthenticated APIs
- Configure `credentials: true` if your frontend sends cookies/auth headers

```ts
app.use('*', cors({ origin: 'https://app.example.com' }));
```

## Security headers (`securityHeaders()`)

The OWASP-recommended set:

| Header | Default value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |
| `Content-Security-Policy` | `default-src 'self'` (configurable) |

```ts
app.use('*', securityHeaders());
```

Tune `contentSecurityPolicy` for your actual asset origins if you serve a
frontend from the same domain.

## Rate limiting (`rateLimit()`)

Prevents abuse and brute-force attacks.

```ts
app.use('/api/*', rateLimit({ max: 100, windowMs: 60000 }));
```

::: warning
`MemoryRateLimitStore` is **not sufficient on serverless or multi-instance
deployments**. Implement `RateLimitStore` against Redis, Upstash, or DynamoDB
for distributed rate limiting — it's one method (`increment(key, windowMs)`).
:::

## JWT auth (`jwtAuth()`)

Built on `jose` (WebCrypto-based, works on every runtime — unlike
`jsonwebtoken` which needs Node's native crypto module).

```ts
app.use('/api/*', jwtAuth({ secret }));
```

- Keep access tokens short-lived (1 hour recommended)
- Use a separate, longer-lived refresh token flow for persistent sessions
- Don't just extend the access token's expiry

## Body size limits (`bodyLimit()`)

Rejects oversized requests by `Content-Length` *before* buffering the body.
Essential on serverless where memory is metered and billed.

```ts
app.use('*', bodyLimit({ max: 100_000 })); // 100 KB
```

## Input validation (`validate()`)

Built against the vendor-neutral [Standard Schema](https://standardschema.dev)
interface (Zod 3.24+, Valibot, ArkType). Reject invalid input outright
(400 + structured issues) rather than trying to coerce or sanitize it.

```ts
app.post('/users', validate(schema), handler);
```

## Password hashing

Deliberately *not* shipped as a middleware. The right choice
(Argon2id via the `argon2` package, or bcrypt/scrypt) has real tradeoffs and
shouldn't be silently defaulted for you. Use a dedicated library.

## Secrets

- Never commit `.env` files with real secrets
- Use your platform's secret manager (AWS Secrets Manager, Cloudflare Workers
  Secrets, Doppler, etc.) and inject at runtime
- Rotate default secrets before deploying anything real

## CSRF protection (`csrf()`)

Double-submit cookie pattern — no server-side sessions required. The server
sets a random token as a cookie; the client echoes it back in a header
(`X-XSRF-Token`) or body field (`_csrf`). Safe methods (GET, HEAD, OPTIONS,
QUERY) are skipped by default.

```ts
app.use('*', csrf());
```

Configure for your frontend framework: Angular reads `XSRF-TOKEN` cookies by
default; React/Vue need the header set manually via Axios/fetch interceptors.

## Request ID (`requestId()`)

Generates a unique ID per request (or trusts an upstream `X-Request-ID`
header). Essential for correlating logs across services:

```ts
app.use('*', requestId());
app.get('/anything', (c) => {
  const id = c.get('requestId');
  return c.json({ requestId: id });
});
```

## API key auth (`apiKey()`)

Simpler than JWT for machine-to-machine communication. Keys are validated
against a pluggable store:

```ts
import { apiKey, MemoryApiKeyStore } from '@nodalite/middleware';

const store = new MemoryApiKeyStore();
store.add('prod-key-abc', { plan: 'enterprise' });

app.use('/api/*', apiKey({ store }));
```

For production, implement `ApiKeyStore` against Redis or your database.

## IP guard (`ipGuard()`)

Allowlist or blocklist IPs and CIDR ranges:

```ts
// Block internal networks
app.use('*', ipGuard({ mode: 'deny', list: ['10.0.0.0/8', '192.168.0.0/16'] }));

// Restrict admin routes to a single IP
app.use('/admin/*', ipGuard({ mode: 'allow', list: ['203.0.113.50'] }));
```

## Content-Type guard (`contentTypeGuard()`)

Reject requests with unexpected `Content-Type` headers (415). Supports
wildcards like `multipart/*`:

```ts
app.post('/data', handler, [contentTypeGuard({ required: ['application/json'] })]);
```

## Request timeout (`requestTimeout()`)

Prevent hanging requests from consuming resources. Uses `Promise.race` to
enforce a deadline:

```ts
app.use('*', requestTimeout({ ms: 10_000 }));
```

## XSS sanitization (`xssSanitize()`)

Encodes HTML entities in JSON request bodies to prevent stored XSS. Use
`sanitizedBody()` in handlers instead of `c.req.json()`:

```ts
import { xssSanitize, sanitizedBody } from '@nodalite/middleware';

app.post('/comments', async (c) => {
  const body = sanitizedBody<{ text: string }>(c);
  // body.text is sanitized — safe to store and render later
  return c.json({ stored: body.text });
}, [xssSanitize()]);
```

## SSRF protection (`ssrfGuard()`)

Validates that user-supplied URLs don't point to internal/private networks
or cloud metadata endpoints:

```ts
app.post('/fetch-url', handler, [ssrfGuard()]);
```

Default blocked ranges include RFC 1918, link-local, loopback, and
`169.254.0.0/16` (cloud metadata). DNS resolution is used to detect
DNS rebinding attacks.

## Session management (`sessions()`)

Cookie-based sessions with HMAC-signed IDs — an alternative to JWT for
server-side session management:

```ts
app.use('*', sessions({ secret: process.env.SESSION_SECRET! }));

app.get('/login', async (c) => {
  c.get('session').userId = '123';
  return c.json({ ok: true });
});
```

Session data is automatically persisted after the response. Use Redis or
a database for the `SessionStore` in production.
