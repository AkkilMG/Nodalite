# FAQ

## Why Fetch API instead of Express-style req/res?

The standard `Request`/`Response` API is implemented natively by Node 18+,
Bun, Deno, and Cloudflare Workers. Building on it means the same code runs
everywhere without adapter rewrites. Express's `req`/`res` are tied to Node's
`http` module, which is why it needs `serverless-http` for Lambda and can't
run on Workers at all.

## Why so many packages instead of one big framework?

1. **Tree-shaking** — a Cloudflare Worker shouldn't pull in Node's
   `worker_threads` or Lambda types.
2. **Dependency isolation** — `@nodalite/ml`'s ONNX dep is ~270MB, but it's
   optional. Apps that don't touch ML pay nothing.
3. **Independent versioning** — adapter fixes don't bump core.

## Can I use Nodalite with my existing database / ORM?

Yes. Nodalite has no built-in database layer. Use Drizzle, Prisma, Kysely, or
any other data library directly in your handlers.

## Can I use Nodalite with my existing auth system?

Yes. The `jwtAuth`/`signJwt` middleware is a convenience, not a requirement.
You can use Passport.js, Auth0, Clerk, or any custom auth system — just handle
it in your own middleware.

## How does `@nodalite/ml` protect against malicious model files?

`Model` enforces three safety checks by default when loading local files or
URLs:

1. **Path traversal protection** — resolved file paths must stay inside
   `projectRoot` (default: `process.cwd()`).
2. **Size limits** — models are capped at 50 MB by default (`maxBytes`).
3. **Format validation** — only `.onnx`, `.bin`, and `.model` extensions are
   allowed; `.onnx` files are verified against the ONNX magic bytes.

Override or disable any of these via `ModelOptions`. See
[ML Inference](/guides/ml-inference) for details.

## Does Nodalite work with TypeScript?

Yes. Every package ships with `.d.ts` files. The `App` and `Context` classes
are generic-typed for request-scoped store values.

## Does Nodalite work with ESM and CJS?

Yes. Every package is dual-published with both `import` and `require` entry
points via the `exports` map in `package.json`.

## Is there a WebSocket solution?

Not yet. WebSockets need genuinely different handling per runtime (Node's `ws`
library vs. Cloudflare's `WebSocketPair` vs. API Gateway's separate WebSocket
API) and deserve their own adapter package (`@nodalite/ws`) rather than bolting
half-support onto the HTTP-shaped core.

## What's deliberately NOT included?

- **No ORM/database layer** — use Drizzle, Prisma, Kysely directly
- **No DI container** — `c.set`/`c.get` with a `Map` is sufficient; bring
  `tsyringe` or `awilix` if you need more
- **No OpenAPI generation** — addable later via `zod-to-openapi`
- **No WebSocket support** — planned as a separate package

## What is the QUERY method?

`QUERY` ([RFC 10008](https://datatracker.ietf.org/doc/html/rfc10008)) is an
HTTP method that is **safe and idempotent** like `GET`, but also accepts a
request body. It's useful for search or filter operations where the query is
too complex for URL parameters:

```ts
app.query('/search', async (c) => {
  const { filters, sort, pagination } = await c.req.json();
  const results = await db.search(filters, sort, pagination);
  return c.json({ results });
});
```

Use `QUERY` when the operation should never cause side effects but needs a
structured body. Use `POST` when the operation creates or modifies resources.

## When should I use auto-discovery?

Use `discover()` when your project has many route files and you want to avoid
manually importing each one. It scans a directory, imports every route file,
and registers them automatically — subdirectories become route groups with
prefix detection via `_prefix.ts` files.

It's a good fit for medium-to-large APIs with dozens of route files. For small
projects with a handful of routes, explicit imports in `app.ts` are simpler and
more transparent.

Auto-discovery uses dynamic `import()` and works on Node, Bun, and Deno. It's
**not suitable for bundled edge runtimes** (Cloudflare Workers) — use static
imports there.

## Are the in-memory stores production-ready?

No. `MemoryRateLimitStore`, `MemoryApiKeyStore`, and `MemorySessionStore` are
single-process only — each instance has its own isolated memory. They're
intended for development and testing.

For production, implement the corresponding store interface against a shared
datastore:

| Store | Interface | Production options |
|---|---|---|
| Rate limiting | `RateLimitStore` | Redis, Upstash, DynamoDB |
| API keys | `ApiKeyStore` | Redis, Postgres, DynamoDB |
| Sessions | `SessionStore` | Redis, DynamoDB, Postgres |

All memory stores include cleanup timers and `destroy()` methods to prevent
leaks in long-running processes.

## Which security middleware do I need?

| Threat | Middleware | When to use |
|---|---|---|
| CSRF | `csrf()` | Browser-facing forms or cookie-based auth |
| XSS (stored) | `xssSanitize()` | User content rendered as HTML later |
| SSRF | `ssrfGuard()` | Routes that fetch user-supplied URLs |
| Brute force | `rateLimit()` | Any public endpoint |
| Unauthorized access | `jwtAuth()` or `apiKey()` | Protecting API routes |
| IP abuse | `ipGuard()` | Admin panels, geo-restricted APIs |
| Wrong content type | `contentTypeGuard()` | API endpoints expecting specific payloads |
| Hanging requests | `requestTimeout()` | Slow backends, external API calls |
| Session hijacking | `sessions()` | Cookie-based auth (alternative to JWT) |
| Missing trace context | `requestId()` | Distributed systems, log correlation |

Not every API needs all of them. Start with `rateLimit`, `cors`,
`securityHeaders`, and `bodyLimit` — add the rest as your threat model
requires.

## Can I contribute?

Yes! See [CONTRIBUTING.md](https://github.com/AkkilMG/nodalite/blob/main/CONTRIBUTING.md).

## License

MIT — see the [LICENSE](https://github.com/AkkilMG/nodalite/blob/main/LICENSE) file.
Copyright © 2024-present Akkil.
