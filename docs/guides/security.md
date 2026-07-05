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
