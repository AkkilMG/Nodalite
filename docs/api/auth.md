# @nodalite/auth

Authentication and authorization for Nodalite: JWT with refresh tokens, OAuth2 (PKCE), role-based access control, cookie-based sessions, password hashing, and CSRF protection.

```
npm install @nodalite/auth
```

Depends on `@nodalite/core` and `jose` (WebCrypto-based JWT, works on all runtimes). Optional peer: `ioredis` for Redis-backed token/session stores.

## jwtAuth()

JWT verification middleware. Validates `Authorization: Bearer <token>` on every matching request and attaches the decoded payload to the context.

```ts
import { jwtAuth } from '@nodalite/auth';

app.use('/api/*', jwtAuth({ secret: process.env.JWT_SECRET! }));
app.get('/api/me', (c) => c.json(c.get('user')));
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `secret` | `string \| Uint8Array` | — | HMAC secret (HS256) or CryptoKey for asymmetric algorithms |
| `contextKey` | `string` | `"user"` | Where to store the verified payload in context |
| `getToken` | `(c) => string \| null` | `Authorization: Bearer` | Custom token extraction function |
| `issuer` | `string` | — | Expected JWT issuer |
| `audience` | `string` | — | Expected JWT audience |
| `algorithm` | `string` | `"HS256"` | Signing algorithm |
| `accessTokenExpiresIn` | `string` | `"15m"` | Access token expiry |

## issueTokenPair()

Issue an access + refresh token pair.

```ts
import { issueTokenPair } from '@nodalite/auth';

const tokens = await issueTokenPair({
  secret: process.env.JWT_SECRET!,
  userId: user.id,
  roles: ['user'],
  permissions: ['read'],
});
// tokens.accessToken, tokens.refreshToken
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `secret` | `string \| Uint8Array` | — | Signing secret |
| `userId` | `string` | — | Subject (sub) claim |
| `roles` | `string[]` | — | Roles to embed in the access token |
| `permissions` | `string[]` | — | Permissions to embed in the access token |
| `issuer` | `string` | — | JWT issuer |
| `audience` | `string` | — | JWT audience |
| `algorithm` | `string` | `"HS256"` | Signing algorithm |
| `accessTokenExpiresIn` | `string` | `"15m"` | Access token expiry |
| `refreshTokenExpiresIn` | `string` | `"7d"` | Refresh token expiry |

### Returns

| Field | Type | Description |
|---|---|---|
| `accessToken` | `string` | Signed access token |
| `refreshToken` | `string` | Signed refresh token |
| `accessTokenPayload` | `AccessTokenPayload` | Decoded access token payload |
| `refreshTokenPayload` | `RefreshTokenPayload` | Decoded refresh token payload |

## tokenRefreshHandler()

Handler that validates a refresh token, checks for revocation and replay attacks, issues a new token pair, and stores the new refresh token.

```ts
import { tokenRefreshHandler, MemoryTokenStore } from '@nodalite/auth';

const store = new MemoryTokenStore();
app.post('/auth/refresh', tokenRefreshHandler({
  secret: process.env.JWT_SECRET!,
  store,
}));
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `secret` | `string \| Uint8Array` | — | Signing secret |
| `store` | `TokenStore` | — | Token store for rotation and revocation |
| `issuer` | `string` | — | Expected JWT issuer |
| `audience` | `string` | — | Expected JWT audience |
| `algorithm` | `string` | `"HS256"` | Signing algorithm |
| `accessTokenExpiresIn` | `string` | `"15m"` | New access token expiry |
| `refreshTokenExpiresIn` | `string` | `"7d"` | New refresh token expiry |

The handler expects a JSON body with `{ refreshToken: string }` and returns `{ accessToken, refreshToken }`.

::: warning Security
On replay detection (revoked refresh token reused), the entire token family is revoked. This prevents stolen refresh tokens from being used after the legitimate user has refreshed.
:::

## revokeToken()

Revoke a specific refresh token by its JTI.

```ts
import { revokeToken } from '@nodalite/auth';

await revokeToken(tokenId, store);
```

## oauth2authorize()

Start an OAuth2 authorization code flow with PKCE. Redirects the user to the provider's authorization endpoint.

```ts
import { oauth2authorize, providers } from '@nodalite/auth';

app.get('/auth/login', oauth2authorize({
  provider: { ...providers.github, clientId: '...', clientSecret: '...' },
  redirectUri: 'https://myapp.com',
  callbackUrl: '/auth/callback',
}));
```

### Built-in providers

| Provider | Scopes |
|---|---|
| `providers.google` | `openid`, `email`, `profile` |
| `providers.github` | `user:email` |
| `providers.discord` | `identify`, `email` |

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `provider` | `OAuth2Provider` | — | Provider config (base URLs + client credentials) |
| `redirectUri` | `string` | — | Where to redirect after authorization |
| `callbackUrl` | `string` | — | The route path that handles the callback |
| `scopes` | `string[]` | `provider.scopes` | Override default scopes |
| `extraParams` | `Record<string, string>` | — | Additional query parameters for the authorization URL |

## oauth2Callback()

Handle the OAuth2 callback, exchange the code for tokens, fetch the user profile, and call your callback to find/create the user.

```ts
import { oauth2Callback, providers } from '@nodalite/auth';

app.get('/auth/callback', oauth2Callback({
  provider: { ...providers.github, clientId: '...', clientSecret: '...' },
  callback: async (profile) => {
    let user = await db.findUserByOAuth(profile.provider, profile.id);
    if (!user) user = await db.createUser({ email: profile.email, name: profile.name });
    return { userId: user.id, roles: ['user'] };
  },
}));
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `provider` | `OAuth2Provider` | — | Provider config |
| `redirectUri` | `string` | — | Override redirect URI for token exchange |
| `callback` | `(profile) => Promise<{ userId, roles? } \| null>` | — | Maps the OAuth profile to your user. Return `null` to reject. |
| `onError` | `(error) => Response` | — | Custom error handler |

## rbac()

Middleware that builds an RBAC context from the verified JWT payload. Must be used after `jwtAuth`.

```ts
import { jwtAuth, rbac, requireRole, requirePermission } from '@nodalite/auth';

app.use('/api/*', jwtAuth({ secret }));
app.use('/api/*', rbac({
  roles: { admin: ['read', 'write', 'delete'], user: ['read'] },
}));

app.get('/api/admin', handler, [requireRole('admin')]);
app.delete('/api/doc', handler, [requirePermission('delete')]);
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `roles` | `RbacMap` | — | Role-to-permissions mapping |
| `userContextKey` | `string` | `"user"` | Context key where the JWT payload is stored |
| `rbacContextKey` | `string` | `"rbac"` | Context key where the RBAC context is stored |
| `extractRoles` | `(payload) => string[]` | `payload.roles` | Custom role extraction from JWT |
| `extractPermissions` | `(payload) => string[]` | `payload.permissions` | Custom permission extraction from JWT |

### RbacContext

Available on `c.get('rbac')` after the `rbac()` middleware:

| Method | Description |
|---|---|
| `hasRole(role)` | Check if user has a specific role |
| `hasPermission(perm)` | Check if user has a specific permission (resolved from roles + explicit) |
| `hasAnyRole(...roles)` | Check if user has at least one of the specified roles |
| `hasAllPermissions(...perms)` | Check if user has all of the specified permissions |

## requireRole()

Route-level middleware that requires the user to have at least one of the specified roles. Must be used as middleware (not as a terminal handler).

```ts
app.get('/admin', handler, [requireRole('admin')]);
app.get('/moderator-or-admin', handler, [requireRole('moderator', 'admin')]);
```

## requirePermission()

Route-level middleware that requires the user to have at least one of the specified permissions. Must be used as middleware (not as a terminal handler).

```ts
app.delete('/doc', handler, [requirePermission('delete')]);
app.put('/doc', handler, [requirePermission('write', 'admin')]);
```

## sessions()

Cookie-based session middleware with HMAC-signed session IDs.

```ts
import { sessions } from '@nodalite/auth';

app.use('*', sessions({ secret: process.env.SESSION_SECRET! }));
app.get('/login', async (c) => {
  const session = c.get('session');
  session.userId = '123';
  return c.json({ loggedIn: true });
});
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `secret` | `string` | — | HMAC secret for signing session IDs |
| `cookieName` | `string` | `"sid"` | Cookie name |
| `maxAge` | `number` | `86400` | Session max age in seconds (24 hours) |
| `store` | `SessionStore` | `MemorySessionStore` | Session store backend |
| `contextKey` | `string` | `"session"` | Context key for session data |
| `cookie.httpOnly` | `boolean` | `true` | HttpOnly flag |
| `cookie.secure` | `boolean` | `true` | Secure flag |
| `cookie.sameSite` | `"Strict" \| "Lax" \| "None"` | `"Lax"` | SameSite attribute |
| `cookie.path` | `string` | `"/"` | Cookie path |

## hashPassword()

Hash a password using PBKDF2 with SHA-256 (600k iterations, random salt). Returns a portable hash string.

```ts
import { hashPassword } from '@nodalite/auth';

const hash = await hashPassword('user-password');
// "pbkdf2:sha256:600000:<base64-salt>:<base64-hash>"
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `iterations` | `number` | `600000` | PBKDF2 iteration count |

## verifyPassword()

Verify a password against a hash string produced by `hashPassword`. Uses constant-time comparison to prevent timing attacks.

```ts
import { verifyPassword } from '@nodalite/auth';

const valid = await verifyPassword('user-password', hash);
```

## csrf()

Double-submit cookie CSRF protection. Server sets a random token as a cookie; client echoes it in a header or body field. No server-side sessions required.

```ts
import { csrf } from '@nodalite/auth';

app.use('*', csrf());
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `cookieName` | `string` | `"XSRF-TOKEN"` | Cookie name for the CSRF token |
| `headerName` | `string` | `"X-XSRF-Token"` | Header name the client must send |
| `bodyField` | `string` | `"_csrf"` | Request body field (fallback) |
| `safeMethods` | `string[]` | `["GET", "HEAD", "OPTIONS", "QUERY"]` | Methods that skip validation |
| `generateToken` | `() => string` | `crypto.randomUUID()` | Custom token generator |
| `cookie.httpOnly` | `boolean` | `false` | HttpOnly flag (must be `false` for client access) |
| `cookie.secure` | `boolean` | `true` | Secure flag |
| `cookie.sameSite` | `"Strict" \| "Lax" \| "None"` | `"Lax"` | SameSite attribute |
| `cookie.path` | `string` | `"/"` | Cookie path |
| `cookie.maxAge` | `number` | `3600` | Token max age in seconds |

## Stores

### TokenStore

Interface for refresh token storage. Implement against your database for production:

```ts
interface TokenStore {
  get(tokenId: string): Promise<TokenEntry | null>;
  set(tokenId: string, entry: TokenEntry, ttlMs: number): Promise<void>;
  delete(tokenId: string): Promise<void>;
  revokeFamily(family: string): Promise<void>;
  cleanup?(): Promise<void>;
}
```

### SessionStore

Interface for session storage:

```ts
interface SessionStore {
  get(id: string): Promise<Record<string, unknown> | null>;
  set(id: string, data: Record<string, unknown>, maxAge: number): Promise<void>;
  destroy(id: string): Promise<void>;
}
```

### MemoryTokenStore / MemorySessionStore

In-memory implementations for development and testing. Include automatic cleanup timers and `destroy()` methods.

```ts
import { MemoryTokenStore, MemorySessionStore } from '@nodalite/auth';
```

::: warning
Memory stores are single-process only. Each instance has its own isolated memory. Use Redis, DynamoDB, or Postgres for production.
:::

### Redis store

Redis-backed `TokenStore` via `ioredis` (optional peer dependency):

```bash
npm install ioredis
```

```ts
import { RedisTokenStore } from '@nodalite/auth/stores/redis';
```
