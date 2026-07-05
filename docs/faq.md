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

## Can I contribute?

Yes! See [CONTRIBUTING.md](https://github.com/AkkilMG/nodalite/blob/main/CONTRIBUTING.md).

## License

MIT — see the [LICENSE](https://github.com/AkkilMG/nodalite/blob/main/LICENSE) file.
Copyright © 2024-present Akkil.
