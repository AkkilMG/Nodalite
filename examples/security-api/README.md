# security-api example

Comprehensive demonstration of all 9 new security middleware in `@nodalite/middleware`:

| Middleware | What it does |
|---|---|
| `requestId()` | Unique ID per request for log correlation |
| `csrf()` | Double-submit cookie CSRF protection |
| `sessions()` | HMAC-signed cookie-based sessions |
| `apiKey()` | API key authentication (with `MemoryApiKeyStore`) |
| `ipGuard()` | IP allowlist for admin routes |
| `xssSanitize()` | HTML entity encoding on request bodies |
| `ssrfGuard()` | Blocks requests to internal/private networks |
| `contentTypeGuard()` | Rejects unexpected Content-Type headers |
| `requestTimeout()` | Kills hung requests after 15s |

Plus the foundational middleware: `cors`, `securityHeaders`, `rateLimit`.

## Run it

```bash
npm run dev -w examples-security-api
```

## What it demonstrates

### Session tracking

```bash
curl -c cookies.txt localhost:3001/session/set
# {"views":1}
curl -b cookies.txt localhost:3001/session/get
# {"views":1}
```

### API key authentication

```bash
curl localhost:3001/api/data -H "X-API-Key: demo-key-abc123"
# {"message":"Authenticated via API key","plan":"pro",...}
```

### XSS sanitization

```bash
curl -X POST localhost:3001/api/comments \
  -H 'content-type: application/json' \
  -d '{"text":"<script>alert(1)</script>","author":"attacker"}'
# {"stored":"&lt;script&gt;alert(1)&lt;/script&gt;","author":"attacker",...}
```

### SSRF protection

```bash
curl -X POST localhost:3001/api/preview \
  -H 'content-type: application/json' \
  -d '{"url":"http://169.254.169.254/latest/meta-data/"}'
# 403 Forbidden: Requests to internal networks are not allowed
```

### Admin IP restriction

```bash
curl localhost:3001/admin/stats
# {"uptime":1.23,"memory":{...}}
```

### Request ID

Every response includes an `X-Request-ID` header. The ID is also available
in handlers via `c.get("requestId")`.

## Production notes

- Replace `MemoryApiKeyStore` and `MemorySessionStore` with Redis-backed
  implementations for multi-instance deployments
- Set `SESSION_SECRET` to a strong random value
- Set `cookie.secure: true` for sessions when running behind HTTPS
- The `ssrfGuard` DNS resolution uses `node:dns` — on edge runtimes it skips
  IP-level checks but still validates protocol and localhost
