# Migration Guide

This guide covers breaking changes and import path updates across Nodalite
releases.

## @nodalite/middleware → @nodalite/auth

As of v0.1.3, authentication and session middleware moved from
`@nodalite/middleware` to `@nodalite/auth`. The old imports still work but are
deprecated and will be removed in a future release.

### Imports that changed

| Old import | New import | Package |
|---|---|---|
| `jwtAuth` | `jwtAuth` | `@nodalite/auth` |
| `signJwt` | `issueTokenPair` | `@nodalite/auth` |
| `verifyJwt` | (inline with `jose`) | `jose` directly |
| `csrf` | `csrf` | `@nodalite/auth` |
| `sessions` | `sessions` | `@nodalite/auth` |
| `MemorySessionStore` | `MemorySessionStore` | `@nodalite/auth` |
| `MemoryTokenStore` | `MemoryTokenStore` | `@nodalite/auth` |

### Before

```ts
import { jwtAuth, signJwt, csrf, sessions } from '@nodalite/middleware';
```

### After

```ts
import { jwtAuth, issueTokenPair, csrf, sessions } from '@nodalite/auth';
```

### JWT sign/verify

The old `signJwt(payload, secret, opts)` helper is replaced by
`issueTokenPair()`, which issues both access and refresh tokens:

```ts
// Before
const token = await signJwt({ sub: user.id }, secret, { expiresIn: '1h' });

// After
const { accessToken, refreshToken } = await issueTokenPair({
  secret,
  userId: user.id,
  roles: ['user'],
});
```

For simple signing without refresh tokens, use `jose` directly:

```ts
import { SignJWT } from 'jose';

const token = await new SignJWT({ sub: user.id })
  .setProtectedHeader({ alg: 'HS256' })
  .setExpirationTime('1h')
  .sign(secret);
```

## logger() → @nodalite/otel

The `logger()` middleware from `@nodalite/middleware` is replaced by `otel()`
from `@nodalite/otel`:

```ts
// Before
import { logger } from '@nodalite/middleware';
app.use('*', logger());

// After
import { otel } from '@nodalite/otel';
app.use('*', otel({ serviceName: 'my-api' }));
```

## discover() options

`discover()` now takes two arguments: `(app, opts)` — the options object is
the second argument, not the third:

```ts
// Before (broken — options silently ignored)
discover(app, './routes', { extensions: ['.ts'] });

// After
discover(app, { dir: './routes', extensions: ['.ts'] });
```

## Installing packages

```bash
# Core (unchanged)
npm install @nodalite/core

# Middleware — CORS, headers, rate limiting, body limits
npm install @nodalite/middleware

# Auth — JWT, OAuth2, RBAC, sessions, CSRF, passwords
npm install @nodalite/auth

# Observability — OpenTelemetry tracing and metrics
npm install @nodalite/otel

# Adapters
npm install @nodalite/adapter-node
npm install @nodalite/adapter-lambda
npm install @nodalite/adapter-edge
```
