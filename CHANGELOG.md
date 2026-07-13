# Changelog

All notable changes to Nodalite will be documented in this file.

This project uses [Changesets](https://github.com/changesets/changesets) for version management. Format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [0.1.3] — 2026-07-13

### Added

#### `@nodalite/auth` — Authentication & authorization

- **New package `@nodalite/auth`** — comprehensive authentication and authorization layer for Nodalite, built on `jose` (WebCrypto) and runtime-agnostic crypto APIs (`crypto.subtle`, `crypto.getRandomValues`) so it works across Node, Bun, Deno, Cloudflare Workers, and AWS Lambda.
  - **JWT authentication** (`jwtAuth(opts)`) — Bearer token extraction, verification with configurable algorithm (default `HS256`), issuer, and audience. Attaches verified payload to the request context.
  - **Token pair issuance** (`issueTokenPair(opts)`) — issues access + refresh JWT pairs with configurable expiry (`15m` access, `7d` refresh defaults). Access tokens carry `sub`, `roles`, `permissions`; refresh tokens carry `tokenId` and `family` for rotation tracking.
  - **Refresh token rotation** (`tokenRefreshHandler(opts)`) — returns a handler that verifies the refresh token, checks revocation status, performs rotation (delete old → issue new pair), and stores the new refresh token. **Replay-attack detection**: if a revoked token is replayed, the entire token family is revoked and the session is flagged as compromised.
  - **Token revocation** (`revokeToken(tokenId, store)`) — marks a single refresh token as revoked; `revokeFamily(family)` on the store revokes all tokens in a rotation family.
  - **OAuth2 Authorization Code + PKCE** (`oauth2authorize(opts)`, `oauth2Callback(opts)`) — complete PKCE flow with S256 code challenge. Built-in provider presets for **Google**, **GitHub**, and **Discord** (each with authorization URL, token URL, userinfo URL, and default scopes). `mapProfile()` normalizes provider-specific user info into a standard `OAuth2Profile` shape.
  - **Role-based access control** (`rbac(opts)`) — middleware that resolves permissions from JWT `roles` + `permissions` claims against a configurable `RbacMap`. Attaches an `RbacContext` with `hasRole()`, `hasPermission()`, `hasAnyRole()`, `hasAllPermissions()`. Route-level guard middlewares: `requireRole(...roles)`, `requirePermission(...perms)` — return 403 on failure.
  - **Cookie-based sessions** (`sessions(opts)`) — HMAC-SHA256 signed session IDs (24 random bytes + signature), pluggable `SessionStore` interface (Memory or Redis). Attaches a mutable `Proxy` of session data to the context. Secure cookie defaults: `httpOnly`, `secure`, `sameSite: "Lax"`.
  - **Password hashing** (`hashPassword(password, opts?)`, `verifyPassword(password, hashString)`) — PBKDF2-SHA256 with 16-byte random salt and 600,000 iterations (configurable). Portable hash format: `pbkdf2:sha256:<iterations>:<base64-salt>:<base64-hash>`. Constant-time comparison via XOR to prevent timing attacks.
  - **CSRF protection** (`csrf(opts?)`) — double-submit cookie pattern (no server-side sessions required). On safe methods: sets `XSRF-TOKEN` cookie. On unsafe methods: validates token from cookie + header (`X-XSRF-Token`) or JSON body field (`_csrf`). Configurable cookie name, header name, body field, and safe methods.
  - **Pluggable stores**: `TokenStore` and `SessionStore` interfaces with `MemoryTokenStore` / `MemorySessionStore` (Map-backed, 60s cleanup interval, `.unref()`'d timers) and `RedisTokenStore` / `RedisSessionStore` (exported via `@nodalite/auth/stores/redis`, uses `ioredis` with pipeline for atomic batch operations, configurable key prefixes).
  - **764 lines of tests** (~40 test cases) covering password hashing, JWT verification, token issuance/refresh/revocation, OAuth2 authorize/callback, RBAC context building and guards, session creation/persistence, CSRF token seeding/validation, memory store operations, and a full end-to-end integration test (issue → store → access protected route → RBAC-gated route → refresh → verify rotation).

#### `@nodalite/otel` — OpenTelemetry integration

- **New package `@nodalite/otel`** — thin, ergonomic wrapper around `@opentelemetry/api` that integrates directly with Nodalite's middleware system for distributed tracing and HTTP metrics.
  - **`otel(opts?)` middleware** — creates `SpanKind.SERVER` spans for each request with standard HTTP semantic convention attributes (`http.request.method`, `url.full`, `url.path`, `url.scheme`, `server.address`, `server.port`, `http.response.status_code`). Extracts incoming W3C Trace Context (`traceparent`) headers for distributed tracing. Records errors via `span.recordException()` with `SpanStatusCode.ERROR`.
  - **Built-in metrics** — `requestDuration` (histogram, ms), `activeRequests` (UpDownCounter), `requestCount` (Counter), `requestBodySize` / `responseBodySize` (histogram, By). All attribute keys follow OTel HTTP semantic conventions.
  - **`getSpan(c)`** — retrieves the active OTel span from the request context for custom attribute enrichment.
  - **`withSpan(name, fn, opts?)`** — convenience wrapper for creating child spans around arbitrary operations with auto-cleanup, error recording, and optional initial attributes.
  - **`createMetrics(opts?)`** — standalone factory that creates the same metric instruments without requiring the middleware, for custom metrics beyond auto-recording.
  - **Configurable**: `serviceName`, `tracing` toggle, `metrics` toggle, `recordHeaders` / `recordResponseHeaders`, `ignoredPaths` (zero-overhead path exclusion), custom `getSpanName` callback.
  - **282 lines of tests** (16 test cases) covering span creation, error recording, path exclusion, custom span names, header recording, trace context propagation, response body size recording, `getSpan` / `withSpan` helpers.

#### `@nodalite/ws` — WebSocket support

- **New package `@nodalite/ws`** — runtime-agnostic WebSocket server with path-based routing, message middleware, rooms, heartbeat, and adapters for Node.js, Cloudflare Workers, Deno, Bun, and AWS Lambda.
  - **`WsServer`** — core runtime-agnostic server class. `path(pattern, handlers)` registers lifecycle handlers (`open`, `message`, `close`, `error`) per WebSocket path with exact match and `*` wildcard support. `use(middleware)` registers global message middleware (classic `next()` chain). `on("connection", handler)` / `on("error", handler)` for global events. `broadcast(data)` for all clients. `toRoom(room)` returns a scoped `WsBroadcaster`.
  - **`WsConnection`** — unified wrapper across all runtimes. `id` (UUID), `request` (Fetch API), `remoteAddress`, `platform` metadata. Room management: `join(...rooms)`, `leave(...rooms)`, `isJoined(room)`, `to(...rooms)` (scoped broadcaster excluding self), `broadcast(data)` (all clients excluding self). Per-connection typed state: `set(key, value)` / `get(key)` with generic `Env` parameter.
  - **`RoomManager`** — in-memory bidirectional connection↔room mapping. O(1) lookups, ephemeral rooms (destroyed when last member leaves).
  - **`HeartbeatManager`** — configurable keep-alive (default 30s interval, 10s timeout, `{"t":"ping"}` payload). Protocol-level ping/pong on Node.js; application-level JSON pings on edge runtimes.
  - **Node.js adapter** (`@nodalite/ws/node`) — `serveWs(app, wsServer, opts?)` serves HTTP + WebSocket on the same port. `attachWs(server, wsServer, opts?)` attaches to an existing server. Dual mode: `ws` library (optional peer dependency, protocol-level pings) or zero-dependency fallback with a raw RFC 6455 frame parser and handshake implementation.
  - **Cloudflare Workers adapter** (`@nodalite/ws/edge`) — `createEdgeWsHandler(app)` using `WebSocketPair`, passes `env` and `waitUntil` into platform metadata.
  - **Deno adapter** (`@nodalite/ws/edge`) — `createDenoWsHandler(app)` using `Deno.upgradeWebSocket()`.
  - **Bun adapter** (`@nodalite/ws/bun`) — `createBunWsHandler(app)` using Bun's native `server.upgrade()` API.
  - **AWS Lambda adapter** (`@nodalite/ws/lambda`) — `createLambdaWsHandler(app, opts)` for API Gateway WebSocket API. Requires `ConnectionStore` interface (pluggable, no bundled implementation) and `postToConnection` function (SDK-agnostic). Handles CONNECT, MESSAGE, DISCONNECT events with in-memory `connCache` per invocation.
  - **`ConnectionStore` interface** (`LambdaWsOptions.store`) — `set`, `get`, `delete`, `findBy`, `cleanup?` for external state persistence (DynamoDB, Redis, Postgres, etc.).
  - **Zero runtime dependencies** — `ws` is an optional peer dependency only for the Node.js adapter's preferred path.
  - **~3,000+ lines of tests** across all adapters covering connection lifecycle, message handling, room management, heartbeat timeout, multi-path routing, error handling, and edge cases per runtime.

#### `@nodalite/core` — Route auto-discovery

- **`discover(app, dir)` / `discover(app, options)`** (`packages/core/src/discover.ts`) — scans a directory (or in-memory virtual map) for route files and auto-registers them on an `App`. Exported from `@nodalite/core` and subpath `@nodalite/core/discover`.
  - **Filesystem mode** — dynamically imports `.ts`/`.js`/`.mts`/`.mjs` files (configurable extensions) from a directory. First pass detects `_prefix.ts` files (string export or function calling `app.use("/prefix")`). Second pass loads route modules, wrapping them in `app.group(prefix, ...)` when a prefix exists. Recurses into subdirectories (skipping `.hidden` dirs and `node_modules`). Nested prefixes accumulate: root `/api` + child `/v1` = `/api/v1/users`.
  - **Entries mode** — accepts a `Record<string, RouteEntryModule>` map (e.g., from `import.meta.glob`) for bundler environments. Builds a virtual directory tree from flat keys, applies the same prefix detection and route loading logic.
  - **`DiscoverOptions`**: `dir`, `entries`, `virtualRoot`, `extensions` (default `[.ts, .js, .mts, .mjs]`), `useDirectoryPrefix` (default `true`), `prefixFile` (default `"_prefix"`).
  - **511 lines of tests** (25+ test cases) covering error handling, single/multiple route loading, prefix function/string exports, nested prefix accumulation, custom extensions/prefix files, hidden directories, entries mode with lazy/ direct/ function exports, virtual root stripping, empty entries, and parameterized routes.

#### `@nodalite/middleware` — Distributed rate limiting

- **Five new `RateLimitStore` implementations** alongside the existing `MemoryRateLimitStore`, all implementing the same `increment(key, windowMs) → { count, resetMs }` interface:
  - **`DynamoDBRateLimitStore`** (`packages/middleware/src/rate-limit/dynamodb.ts`) — fixed-window counter via two-phase conditional DynamoDB `UpdateItem`. Phase 1: atomic increment within active window. Phase 2 (rare): reset and start new window on `ConditionalCheckFailedException`. Uses DynamoDB TTL for automatic stale entry cleanup. Peer dependency: `@aws-sdk/client-dynamodb` (optional).
  - **`RedisRateLimitStore`** (`packages/middleware/src/rate-limit/redis.ts`) — fixed-window counter via atomic Lua script (`INCR` + conditional `PEXPIRE` + `PTTL`) in a single round-trip. Uses `ioredis` (imported as type, consumer must install separately).
  - **`RedisSlidingWindowRateLimitStore`** (`packages/middleware/src/rate-limit/sliding-window.ts`) — true sliding-window via Redis sorted sets (ZSET) and atomic Lua script (`ZREMRANGEBYSCORE` + `ZADD` + `PEXPIRE` + `ZCARD`). Avoids the boundary problem of fixed windows. Uses `ioredis`.
  - **`UpstashRedisRateLimitStore`** (`packages/middleware/src/rate-limit/upstash-redis.ts`) — fixed-window counter via Lua script adapted for `@upstash/redis` REST-based HTTP transport. Peer dependency: `@upstash/redis` (optional).
  - **`UpstashRateLimitStore`** (`packages/middleware/src/rate-limit/upstash.ts`) — thin adapter wrapping `@upstash/ratelimit`, delegating window management entirely to the library. Peer dependency: `@upstash/ratelimit` (optional).

#### Examples

- **`examples/ws-chat`** — real-time chat room application demonstrating `@nodalite/ws` capabilities:
  - Two WebSocket endpoints (`/chat` and `notifications`) with path-based routing.
  - Room management: users join a `chat` room; messages broadcast to room members via `conn.to('chat').emit()`.
  - Per-connection typed state: username extracted from query string, stored via `conn.set()`/`conn.get()`.
  - Heartbeat keep-alive (30s interval, 10s timeout).
  - Mixed HTTP + WebSocket on the same port via `serveWs()`: `/health` (connection count), `/stats` (connection count + user list), `/broadcast` (POST endpoint triggering WebSocket broadcast from HTTP).
  - Connection lifecycle: join notifications, welcome messages with user list, departure announcements.
  - Graceful shutdown on SIGINT/SIGTERM.
  - Built with `@nodalite/core`, `@nodalite/adapter-node`, `@nodalite/ws`, `ws`.

#### Documentation

- **API references** — new per-package documentation pages:
  - `docs/api/auth.md` (359 lines) — full reference for `@nodalite/auth`: JWT, token pairs, refresh rotation, OAuth2 PKCE, RBAC, sessions, password hashing, CSRF, stores.
  - `docs/api/errors.md` (90 lines) — `HttpError` class reference: factory methods, `expose` flag, structured JSON responses, custom error handlers, `isHttpError()` type guard.
  - `docs/api/openapi.md` (418 lines) — `@nodalite/openapi` reference: spec generation, Zod schema conversion, Swagger UI, ReDoc, route metadata types.
  - `docs/api/otel.md` (182 lines) — `@nodalite/otel` reference: middleware, metrics, span helpers, setup with OTLP exporter.
  - `docs/api/ws.md` (440 lines) — `@nodalite/ws` reference: multi-runtime quick starts, `WsServer`, `WsConnection`, rooms, heartbeat, all adapter APIs, Lambda `ConnectionStore`.
- **Guides** — new tutorial and reference pages:
  - `docs/guides/migration.md` (111 lines) — migration guide for breaking changes since v0.1.2: `@nodalite/middleware` → `@nodalite/auth` moves, `logger()` → `otel()` replacement, `discover()` signature change.
  - `docs/guides/typescript.md` (157 lines) — TypeScript usage patterns: generics, typed route params, request body typing, Standard Schema validation, middleware/handler/error typing.
- **Examples** — `docs/examples/ws-chat.md` (125 lines) — annotated walkthrough of the WebSocket chat example with inline code, run instructions, and pattern reference table.
- **Assets** — `assets/logo.svg` (project logo), `assets/dark.png`, `assets/light.png` (documentation screenshots).
- **`docs.ps1`** — new VitePress documentation deployment script (builds docs, deploys to GitHub Pages via orphan branch strategy).

### Changed

- **Router middleware-per-method isolation** (`packages/core/src/router.ts`) — the `middlewares` field on trie `Node` changed from a flat `Middleware<Env>[]` array (shared across all HTTP methods at a node) to a `Map<HttpMethod, Middleware<Env>[]>` (scoped per method). `match()` now returns `node.middlewares.get(method) ?? []` instead of `node.middlewares`. This ensures middlewares registered with a specific HTTP method (e.g., `app.get("/x", handler, [auth])`) only apply to that method, not to other methods sharing the same path node.

#### Monorepo & Toolchain

- **TypeScript project references** — new root `tsconfig.json` with `"files": []` and 14 `references` pointing to per-package `tsconfig.build.json` files. Every package now has a `tsconfig.build.json` extending its own `tsconfig.json` with `"composite": true` and `"emitDeclarationOnly": true`. Packages with internal dependencies (`auth`, `otel`, `ws`) reference `../core/tsconfig.build.json` for correct incremental build ordering.
- **Vitest config** — new root `vitest.config.ts` with `@nodalite/core` aliased to source (`packages/core/src`), test discovery via `packages/*/src/**/*.test.ts`, and `node` test environment.
- **Publish script** (`publish.ps1`) — reordered quality gates from install → lint → typecheck → build → test to install → **build → test** → lint → typecheck (functional failures caught faster). `npm ci` changed to `npm i`.
- **Middleware package** (`packages/middleware/package.json`) — new optional peer dependencies: `@aws-sdk/client-dynamodb` (>=3.0.0), `@upstash/redis` (>=1.0.0), `@upstash/ratelimit` (>=2.0.0).
- **README** — added `@nodalite/openapi` to the packages list and installation section.

### Fixed

- **Router middleware leak across HTTP methods** — previously, registering the same path with different HTTP methods (e.g., `GET /users` with auth middleware and `OPTIONS /users` without) caused the last `add()` call to overwrite the middleware list for **all** methods at that trie node. The middleware-per-method refactor ensures each method has its own independent middleware stack, fixing silent middleware duplication/loss.

---

## [0.1.2] — 2026-07-07

### Added

#### `@nodalite/openapi` — OpenAPI spec generation + Swagger UI + ReDoc

- **New package `@nodalite/openapi`** that auto-generates OpenAPI 3.1.0 specification documents from Nodalite route metadata, with built-in Swagger UI and ReDoc HTML endpoints — inspired by FastAPI's `docs_url` / `redoc_url` pattern.
  - `openapi(app, options)` factory function wraps an existing `App` and returns an `OpenAPIApp` with route-level OpenAPI metadata support.
  - `OpenAPIApp` mirrors the `App` API (`get`, `post`, `put`, `patch`, `delete`, `all`, `group`, `use`, `onError`, `notFound`) so adding docs metadata is a drop-in wrapper, not a rewrite.
  - `OpenAPIRouteGroup` for registering documented route groups under a shared prefix.
- **OpenAPI 3.1.0 spec generation** (`generateSpec`) with full support for:
  - Path parameters (auto-extracted from `:param` style routes to `{param}` OpenAPI style)
  - Query parameters and headers from Zod/Standard Schema `request.query` / `request.headers` metadata
  - Request body schema (JSON) with `$ref` deduplication in `components.schemas`
  - Response schemas per status code with automatic schema name generation
  - Route metadata: `summary`, `description`, `operationId`, `tags`, `deprecated`
  - Server definitions via `options.servers`
- **Zod schema conversion** (`toOpenAPISchema`) supporting:
  - Zod v3 (`_def.typeName`-based): `ZodString`, `ZodNumber`, `ZodBoolean`, `ZodObject`, `ZodArray`, `ZodEnum`, `ZodOptional`, `ZodNullable`, `ZodUnion`, `ZodDiscriminatedUnion`, `ZodRecord`, `ZodDefault`, `ZodLiteral`, `ZodDate`
  - Zod v4 (`_def.type`-based): `string`, `number`, `integer`, `boolean`, `object`, `array`, `enum`, `union`, `intersection`, `optional`, `nullable`, `record`, `tuple`, `literal`, `date`
  - Zod `toJSONSchema()` passthrough (for schemas that natively support it)
  - Raw JSON Schema objects passed through directly
- **Swagger UI endpoint** — serves a self-contained HTML page loading `swagger-ui-bundle.js` from unpkg CDN, with deep linking, extensions, and common extensions enabled.
- **ReDoc endpoint** — serves a self-contained HTML page loading `redoc.standalone.js` from unpkg CDN.
- **Configurable endpoints** via `OpenAPIOptions`:
  - `specPath` (default: `/openapi.json`)
  - `docsPath` (default: `/docs`)
  - `redocPath` (default: `/redoc`)
- **409 lines of tests** covering schema conversion (Zod primitives, objects, arrays, enums, optional fields, nullables, unions, raw JSON Schema), spec generation (path conversion, parameter extraction, request body `$ref` dedup, components.schemas), templates (Swagger UI HTML, ReDoc HTML), and full integration tests (route registration, group support, custom paths, complete POST endpoint with request body + responses).

#### `@nodalite/ml` — Type safety & dependency fixes

- **ONNX engine type narrowing** (`packages/ml/src/onnx-engine.ts:29`) — replaced unsafe `as any` cast in `session.run()` with properly inferred `Parameters<typeof session.run>[0]`, eliminating the last `any` leak in the ML package's public API.
- **New `onnxruntime.d.ts`** ambient module declaration (`packages/ml/src/onnxruntime.d.ts`) — provides typed stubs for `InferenceSession.create()`, `.run()`, and `.release()` so the ONNX adapter has proper type coverage without importing the full ~270MB native package at dev time.
- **`onnxruntime-node` peer dependency** bumped `^1.19.0` → `^1.27.0` to align with the latest ONNX Runtime API surface.
- **Test strictness** — `any` annotation in concurrent `predict()` test replaced with `{ y: number }` for proper type checking (`packages/ml/src/model.test.ts`).
- **Dist type declarations cleaned up** — removed stale `index.d.cts` and `index.d.ts` from version control for `@nodalite/ml` (now generated at build time via tsup, consistent with all other packages).

#### Documentation & Guide Overhaul

- **VitePress documentation site** replacing the monolithic `docs/GUIDE.md` (542 lines) with a structured multi-page reference:
  - **Guides**: Introduction, Quick Start, Core Concepts, Installation, Scaffolding — step-by-step onboarding for new users.
  - **API Reference**: per-package docs for `@nodalite/core`, `@nodalite/middleware`, `@nodalite/adapter-node`, `@nodalite/adapter-lambda`, `@nodalite/adapter-edge`, `@nodalite/workers`, `@nodalite/scheduler`, `@nodalite/ml` — full function/class/type signatures with usage examples.
  - **Example walkthroughs**: basic-api, lambda-deploy, telegram-bot-thread — annotated explanations of real-world patterns.
  - **How-to Guides**: Background threads, deployment, ML inference, security checklist, testing strategy, publishing & versioning, naming & rebranding.
  - **FAQ**: common questions and architectural decisions.
- `docs/GUIDE.md` replaced with a redirect stub linking to the new docs structure, preserving any existing inbound links.
- `docs/public/logo.svg` added for documentation site branding.

#### CLI Scaffolding & Templates

- **New package `create-nodalite`** — interactive CLI for scaffolding new Nodalite projects via `npm create nodalite` / `npx create-nodalite` / `npx nodalite create`.
  - **Project purpose selection**: API server (Node/Bun/Deno), Telegram bot (Node), Lambda (serverless), Edge (Cloudflare Workers).
  - **Feature toggles** (context-sensitive per purpose):
    - ML model inference (API only) — adds `@nodalite/ml` + `@nodalite/workers` with a pre-wired `WorkerPool` sentiment analysis worker.
    - Security middleware (API + Lambda) — adds CORS, security headers, rate limiting, JWT auth, logger, body limit, with working signup/login routes and Zod validation.
    - Job scheduler (API only) — adds `@nodalite/scheduler` with a sample cron task.
  - **Handlebars templates** for 4 project types:
    - `templates/api/` — `app.ts.hbs`, `server.ts.hbs`, `sentiment-worker.ts.hbs`, `package.json.hbs`, `tsconfig.json.hbs`
    - `templates/edge/` — `index.ts.hbs`, `package.json.hbs`, `tsconfig.json.hbs`
    - `templates/lambda/` — `app.ts.hbs`, `handler.ts.hbs`, `package.json.hbs`, `tsconfig.json.hbs`
    - `templates/telegram-bot/` — `main.ts.hbs`, `telegram-bot.ts.hbs`, `package.json.hbs`, `tsconfig.json.hbs`
  - Auto-installs dependencies via `npm install` after scaffolding.
  - Built with `citty` (CLI framework), `consola` (logging), `prompts` (interactive prompts), `handlebars` (templating), `picocolors` (terminal colors).
- **Unscoped `nodalite` package** (`packages/nodalite/`) — re-exports everything from `@nodalite/core` providing a simpler `import { App } from 'nodalite'` path for consumers who don't need scoped packages. Includes a `cli.mjs` bin entry forwarding to `create-nodalite` for `npx nodalite create` support.

### Changed

#### `@nodalite/core` & `@nodalite/middleware` Type Improvements

- **`Router`** and internal `Node` interfaces now carry the `Env` generic parameter: `Router<Env>`, `Node<Env>`. Previously used `Handler<any>` / `Middleware<any>` internally, which weakened type safety for consumers using typed `Env` contexts.
- **`RouteMatch`** interface now generic: `RouteMatch<Env extends Record<string, unknown>>` — handler and middlewares arrays are properly typed instead of `any`.
- **`App.router`** field typed as `Router<Env>` instead of bare `Router`, so the full request pipeline preserves the `Env` type from `App<Env>` through routing to handler invocation.
- `safeJson()` helper in `validate.ts` — parameter typed as `Context` (was `Context<any>`).
- **Middleware dist type declarations** cleaned up — removed duplicate `.d.cts` and `.d.ts` files from version control for `@nodalite/middleware` (now generated at build time).

#### Monorepo & Toolchain

- **pnpm → npm workspaces migration** — root `package.json` renamed from `nodalite-monorepo` (private) to `nodalite` with `workspaces: ["packages/*", "examples/*", "docs"]`. Removed `pnpm-workspace.yaml` and `pnpm-lock.yaml`. All scripts rewritten from `pnpm -r --filter` to `npm run ... -w` / `--workspaces --if-present`. Build order enforces `@nodalite/core` builds first.
- **TypeScript** `^5.6.3` → `^6.0.0` across all packages.
- **Vitest** `^2.1.4` → `^4.0.0` across all packages.
- **tsup** `^8.3.5` → `^8.5.1` across all packages.
- **`@types/node`** `^22.9.0` → `^26.0.0` where applicable.
- **ESLint** added: `eslint` `^10.0.0`, `@eslint/js` `^10.0.0`, `typescript-eslint` `^8.63.0`, `globals` `^17.0.0` — with new `eslint.config.js`.
- **jose** (JWT library in `@nodalite/middleware`) `^5.9.6` → `^6.0.0`.
- **esbuild** pinned via `overrides` to `0.28.1` in root `package.json`.
- All `workspace:*` dependencies changed to `*` for npm workspace compatibility.
- Added `publishConfig.access: "public"`, `repository`, `bugs`, `license`, `keywords`, `engines` fields to every sub-package's `package.json`.
- Added `typecheck` script (`tsc --noEmit`) to every sub-package.

#### CI/CD (GitHub Actions)

- **CI workflow** (`.github/workflows/ci.yml`) — runs on push and pull request: checkout, Node.js setup, install, typecheck across all workspaces, test suite (Vitest), and build.
- **Release workflow** (`.github/workflows/release.yml`) — uses `changesets/action` on `main` to automate the "pending changeset → release PR → publish to npm" loop with `NPM_TOKEN` and `GITHUB_TOKEN` secrets.
- **Docs deployment workflow** (`.github/workflows/deploy-docs.yml`) — builds and deploys VitePress documentation site.

#### Workers (`@nodalite/workers`)

- `DetachedOptions.onError` callback parameter changed from `Error` to `unknown` — aligns with TypeScript best practices for error callbacks where the caught value may not be an `Error` instance.

#### Build Artifacts

- All `dist/` bundles rebuilt with tsup 8.5.1 (minified, ESM + CJS + `.d.ts`).
- `.d.cts` type declaration files now generated alongside `.d.ts` for CJS consumers.

### Fixed

- **Router `Env` propagation** — the `Env` type parameter now properly flows from `App<Env>` through `Router<Env>` to route matching and handler invocation, eliminating implicit `any` casts in middleware and handler type inference that previously broke typed context usage.
- **ONNX engine `session.run()` type safety** — replaced `as any` cast with `Parameters<typeof session.run>[0]`, preventing silent type mismatches between the declared `OnnxInput` and ONNX Runtime's actual input shape.
- **JWT middleware unused binding** — removed unused `err` variable from catch clause in `jwtAuth()` (`packages/middleware/src/jwt.ts`), silencing the `no-unused-vars` lint rule.
- **Workers pool test** — removed unused `fileURLToPath` import from `@nodalite/workers` pool test file.

### Security

- **`.npmignore`** added (29 entries) — ensures `src/`, test files, docs, templates, `.github/`, config files, and other development artifacts are excluded from published npm packages. Only `dist/`, `README.md`, `LICENSE`, and `CHANGELOG.md` ship to consumers — reduces attack surface and prevents accidental leakage of internal structure.
- **`.gitignore`** expanded from minimal to 50-line comprehensive coverage of `node_modules/`, `dist/`, lock files, IDE configs (`.vscode/`, `.idea/`), OS artifacts (`.DS_Store`, `Thumbs.db`), VitePress cache, coverage reports, and log files.
- **jose v6** — JWT library upgraded from `^5.9.6` to `^6.0.0`, pulling in the latest WebCrypto-based security fixes and API improvements.
- **Supply chain** — `onnxruntime-node` peer dependency bumped to `^1.27.0` to align with current stable releases.

---

## [0.1.1] — 2026-07-07

### Added

#### Documentation Site (VitePress)

- Full multi-page documentation site powered by **VitePress**, replacing the monolithic `docs/GUIDE.md` with a structured reference:
  - **Guides**: Introduction, Quick Start, Core Concepts, Installation, Scaffolding
  - **API Reference**: Per-package docs for `@nodalite/core`, `@nodalite/middleware`, `@nodalite/adapter-node`, `@nodalite/adapter-lambda`, `@nodalite/adapter-edge`, `@nodalite/workers`, `@nodalite/scheduler`, `@nodalite/ml`
  - **Examples**: basic-api, lambda-deploy, telegram-bot-thread walkthroughs
  - **How-to Guides**: Background threads, deployment, ML inference, security checklist, testing strategy, publishing & versioning, naming & rebranding
  - **FAQ**: Common questions and architectural decisions
- `docs/GUIDE.md` replaced with a redirect stub linking to the new docs site structure.
- `docs/public/logo.svg` added for documentation site branding.

#### CLI Scaffolding (`create-nodalite`)

- **New package `create-nodalite`** — interactive CLI for scaffolding new Nodalite projects via `npm create nodalite` / `npx create-nodalite` / `npx nodalite create`.
  - **Project purpose selection**: API server (Node/Bun/Deno), Telegram bot (Node), Lambda (serverless), Edge (Cloudflare Workers).
  - **Feature toggles**:
    - ML model inference (API only) — adds `@nodalite/ml` + `@nodalite/workers` with a pre-wired `WorkerPool` sentiment analysis worker.
    - Security middleware (API + Lambda) — adds CORS, security headers, rate limiting, JWT auth, logger, body limit, with working signup/login routes and Zod validation.
    - Job scheduler (API only) — adds `@nodalite/scheduler` with a sample cron task.
  - **Handlebars templates** for 4 project types: `templates/api/`, `templates/edge/`, `templates/lambda/`, `templates/telegram-bot/` — each with `package.json.hbs`, source files, and `tsconfig.json.hbs`.
  - Auto-installs dependencies via `npm install` after scaffolding.
  - Built with `citty` (CLI framework), `consola` (logging), `prompts` (interactive prompts), `handlebars` (templating), `picocolors` (terminal colors).

#### Unscoped `nodalite` Package

- **New package `nodalite`** (`packages/nodalite/`) — unscoped alias that re-exports everything from `@nodalite/core`, providing a simpler `import { App } from 'nodalite'` path for consumers who don't need scoped packages.
  - Includes a `cli.mjs` bin entry forwarding to `create-nodalite` for `npx nodalite create` support.
  - Added to workspace with its own `tsconfig.json` and build configuration.

#### CI/CD (GitHub Actions)

- **CI workflow** (`.github/workflows/ci.yml`) — runs on push and pull request: checkout, Node.js setup, install, typecheck across all workspaces, test suite (Vitest), and build.
- **Release workflow** (`.github/workflows/release.yml`) — uses `changesets/action` on `main` to automate the "pending changeset → release PR → publish to npm" loop with `NPM_TOKEN` and `GITHUB_TOKEN` secrets.
- **Docs deployment workflow** (`.github/workflows/deploy-docs.yml`) — builds and deploys VitePress documentation site.

### Changed

#### Toolchain & Dependencies (Major Version Bumps)

- **TypeScript** `^5.6.3` → `^6.0.0` across all packages.
- **Vitest** `^2.1.4` → `^4.0.0` across all packages.
- **tsup** `^8.3.5` → `^8.5.1` across all packages.
- **`@types/node`** `^22.9.0` → `^26.0.0` where applicable.
- **ESLint** added: `eslint` `^10.0.0`, `@eslint/js` `^10.0.0`, `typescript-eslint` `^8.63.0`, `globals` `^17.0.0` — with new `eslint.config.js` replacing any prior lint setup.
- **jose** (JWT library in `@nodalite/middleware`) `^5.9.6` → `^6.0.0`.
- **`onnxruntime-node`** peer dependency `^1.19.0` → `^1.27.0` in `@nodalite/ml`.
- **esbuild** pinned via `overrides` to `0.28.1` in root `package.json`.

#### Monorepo Migration: pnpm → npm Workspaces

- Root `package.json` renamed from `nodalite-monorepo` (private) to `nodalite` with `workspaces` field: `["packages/*", "examples/*", "docs"]`.
- Removed `pnpm-workspace.yaml` and `pnpm-lock.yaml` in favor of npm's native workspaces.
- All `packageManager`-based scripts rewritten from `pnpm -r --filter` to `npm run ... -w` / `--workspaces --if-present` syntax.
- Build order enforces `@nodalite/core` builds first: `npm run build -w @nodalite/core && npm run build --workspaces --if-present`.
- All `workspace:*` dependencies changed to `*` for npm workspace compatibility.
- Added `publishConfig.access: "public"`, `repository`, `bugs`, `license`, `keywords`, `engines` fields to every sub-package's `package.json`.
- Added `typecheck` script (`tsc --noEmit`) to every sub-package.

#### Type Improvements (`@nodalite/core`)

- **`Router`** and internal `Node` interfaces now carry the `Env` generic parameter: `Router<Env>`, `Node<Env>`. Previously used `Handler<any>` / `Middleware<any>` internally, which weakened type safety.
- **`RouteMatch`** interface now generic: `RouteMatch<Env extends Record<string, unknown>>` — handler and middlewares arrays are properly typed instead of `any`.
- **`App.router`** field typed as `Router<Env>` instead of bare `Router`.
- `safeJson()` helper in `validate.ts` parameter typed as `Context` (was `Context<any>`).

#### Workers (`@nodalite/workers`)

- `DetachedOptions.onError` callback parameter changed from `Error` to `unknown` — aligns with TypeScript best practices for error callbacks where the caught value may not be an `Error` instance.

#### Build Artifacts

- All `dist/` bundles rebuilt with tsup 8.5.1 (minified, ESM + CJS + `.d.ts`).
- `.d.cts` type declaration files now generated alongside `.d.ts` for CJS consumers.

### Removed

- `docs/GUIDE.md` monolithic document (replaced by VitePress docs site).
- `docs/CNAME` temporary custom domain file.
- Redundant `packages/middleware/dist/index.d.{ts,cts}` files removed from version control (now generated at build time).
- GitHub Actions workflows temporarily removed in `d414350` and re-added in `99031c5` as part of the CI/CD overhaul.

### Fixed

- Router `Env` type parameter now properly propagates from `App<Env>` through to route matching, eliminating implicit `any` casts in middleware and handler type inference.
- `@nodalite/ml` ONNX engine `session.run()` call: replaced `as any` cast with proper `Parameters<typeof session.run>[0]` type narrowing.
- `@nodalite/ml` test: `any` annotation replaced with `{ y: number }` for strict type checking.
- Removed unused `fileURLToPath` import from `@nodalite/workers` pool test.
- Middleware dist type declarations cleaned up (duplicates removed from version control).

### Security

- `.npmignore` added (29 entries) — ensures `src/`, test files, docs, templates, config files, and other development artifacts are excluded from published npm packages. Only `dist/` ships to consumers.
- `.gitignore` expanded from minimal to 48-entry comprehensive coverage of node_modules, dist, lock files, IDE configs, OS artifacts, and VitePress cache.

---

## [0.1.0] — 2026-07-06

### Added

#### `@nodalite/core` — Zero-dependency router, context, and middleware engine

- **`App`** class — the central application object. Deliberately minimal: routing, middleware composition, and error handling. No assumptions about how requests arrive (that's the adapters' job). The same `App` instance runs unmodified on Node, Bun, Deno, Cloudflare Workers, and AWS Lambda.
  - `get`, `post`, `put`, `patch`, `delete`, `all`, `on` — route registration by HTTP method.
  - `use(path, middleware)` — register global middleware for all routes (`*`) or path prefixes (`/api/*`).
  - `group(prefix, build)` — register route groups under a shared prefix with optional group-scoped middleware.
  - `onError(handler)` — custom error handler for catching and transforming thrown errors.
  - `notFound(handler)` — custom 404 handler.
  - `handle(request)` — the Fetch API-compatible request handler (`(req: Request) => Promise<Response>`) that all adapters call.
- **`Router`** — radix-tree based router with O(path-segments) lookup cost. Supports static paths, `:param` path parameters, and `*` wildcards. Flat and predictable performance even with thousands of routes — matters on cold starts.
- **`Context`** — request context object passed to every middleware and handler:
  - `c.req` — wrapped request with `.json()`, `.text()`, `.param(key)`, `.query(key)`, `.header(key)` helpers.
  - `c.json(data, status?)` / `c.text(data, status?)` / `c.html(data, status?)` — response helpers.
  - `c.get(key)` / `c.set(key, value)` — per-request state storage (typed via `Env` generic).
  - `c.req.url`, `c.req.method`, `c.req.headers` — direct access to the underlying request.
- **Middleware composition** — "onion" model: each middleware wraps everything after it. A middleware returns `next()` to continue or its own `Response` to short-circuit. No dangling promises — every handler must resolve to a `Response`.
- **`validate(schemas)`** — request validation middleware using the vendor-neutral [Standard Schema](https://standardschema.dev) interface (Zod 3.24+, Valibot, ArkType). Validates `body`, `query`, and `params` independently. Rejects invalid input with 400 + structured issue list (following OWASP's "reject, don't sanitize" guidance).
- **`HttpError`** — typed HTTP error class with `status`, `message`, and `expose` flag. `HttpError.badRequest()`, `HttpError.unauthorized()`, `HttpError.forbidden()`, `HttpError.notFound()`, `HttpError.internal()` factory methods. Errors with `expose: true` (4xx by default) send the message to the client; others return a generic "Internal Server Error" while logging the real error server-side.
- **`isHttpError(err)`** — type guard for catching `HttpError` instances.
- Zero runtime dependencies — only needs what the JS runtime already provides (Fetch API globals).

#### `@nodalite/middleware` — Security & HTTP middleware

- **`cors(options?)`** — CORS middleware. Secure by default: no `Access-Control-Allow-Origin` header unless `origin` is explicitly configured. Supports `origin`, `methods`, `allowedHeaders`, `exposedHeaders`, `credentials`, `maxAge`.
- **`securityHeaders(options?)`** — OWASP-recommended security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Strict-Transport-Security`, conservative `Content-Security-Policy`. All configurable.
- **`rateLimit(options?)`** — Rate limiting middleware with pluggable store interface (`RateLimitStore`). Ships with `MemoryRateLimitStore` (suitable for single-instance deployments; Redis/Upstash implementation recommended for serverless/multi-instance).
- **`jwtAuth(options?)`** — JWT authentication middleware built on `jose` (WebCrypto-based, works on every runtime). Validates `Authorization: Bearer <token>` headers. Configurable `secret`, `issuer`, `audience`, token expiry.
- **`signJwt(payload, options?)`** — JWT signing helper using `jose`.
- **`logger(options?)`** — HTTP request/response logger middleware. Logs method, path, status, and response time.
- **`bodyLimit(options?)`** — Request body size limiter. Rejects oversized requests by `Content-Length` *before* buffering the body — critical on serverless where memory is metered and billed.

#### `@nodalite/adapter-node` — Node.js server adapter

- **`serve(app, options?)`** — runs a Nodalite `App` on a plain Node `http.Server` / `https.Server`.
  - Options: `port`, `hostname`, `https` (with `cert`/`key`).
  - Graceful shutdown on `SIGTERM`/`SIGINT`.

#### `@nodalite/adapter-lambda` — AWS Lambda adapter

- **`createLambdaHandler(app, options?)`** — converts a Nodalite `App` into an AWS Lambda handler.
  - Supports API Gateway v1 (REST API) and v2 (HTTP API) event shapes.
  - Supports Lambda Function URLs (v2 shape).
  - `onColdStart` hook for proactive resource warming (e.g., pre-loading ML models).
  - Proper request/response conversion between API Gateway's event/context format and the Fetch `Request`/`Response` API.

#### `@nodalite/adapter-edge` — Cloudflare Workers adapter

- **`createEdgeHandler(app)`** — converts a Nodalite `App` into a Cloudflare Workers request handler.
  - Forwards `env` bindings (KV, D1, R2, etc.) into `c.platform.env`.
  - Bun and Deno need no adapter — `app.fetch` already matches their native server signature.

#### `@nodalite/workers` — Background threads & CPU offload

- **`runDetached(entryFile, options?)`** — spawns a supervised `worker_thread` that lives for the lifetime of the Node process. Use case: long-lived bots, pollers, or any independent background loop alongside your API.
  - `autoRestart` (default: `true`) — automatic exponential-backoff restart on crash (1s base, 30s max).
  - `workerData` — data passed to the worker thread.
  - `onError(err)` / `onExit(code)` — lifecycle callbacks.
  - Returns `DetachedHandle` with `worker`, `send(message)`, `stop()`.
  - **Honest serverless limitation documented**: `worker_thread` only exists between parent process start and exit. On Lambda/Workers/FaaS, there is no persistent parent process — use webhooks or `toServerlessTask()` instead.
- **`WorkerPool`** — CPU-bound work offload to a pool of `worker_threads`.
  - Auto-sized to `availableParallelism() - 1` workers.
  - `run(payload)` — dispatches work to the next idle worker, returns a promise.
  - `taskTimeoutMs` — optional per-task timeout.
  - `terminate()` — clean shutdown of all workers.
  - Self-healing: crashed workers are automatically replaced.
- **`defineWorkerTask(handler)`** — helper for the worker-side message handler. Must be called from inside a `worker_thread`. Listens for messages, runs the handler, and posts results back.

#### `@nodalite/scheduler` — Cron & interval scheduling

- **`Scheduler`** — cron/interval task scheduler for long-running servers.
  - `cron(expression, task, options?)` — standard 5-field cron (minute resolution). Supports `*`, ranges (`1-5`), steps (`*/5`, `1-10/2`), and comma-separated values.
  - `every(intervalMs, task, options?)` — fixed-interval execution.
  - `stopAll()` — gracefully stops all registered jobs.
  - `jobNames` — list of registered job names.
  - All timers `unref()`'d so they don't keep the process alive.
- **`parseCron(expression)`** — parses a cron expression into a `CronMatcher` with a `matches(date)` method.
- **`nextRun(matcher, from?)`** — finds the next date that matches the cron expression.
- **`toServerlessTask(task)`** — wraps an async task into a Lambda/EventBridge-compatible handler shape `(_event, _context) => Promise<{ ok: true }>`.

#### `@nodalite/ml` — Serverless-aware ML inference runner

- **`Model<Input, Output>`** — cached, engine-agnostic inference runner with built-in security.
  - Sources: `file` (local path), `url` (download + disk cache), `buffer` (in-memory bytes).
  - Model bytes cached to disk (`os.tmpdir()/nodalite-models`, `/tmp` on Lambda) keyed by SHA-256 hash of the source URL — downloaded once per container, not per request.
  - Constructed inference session cached in memory — warm containers reuse the loaded session across requests.
  - Concurrent cold-start requests share one in-flight load (no duplicate download/parse race).
  - `predict(input)` — run inference (lazy-loads on first call).
  - `warm()` — proactively load the session ahead of the first request (for `onColdStart` hooks).
  - `release()` — explicitly release native resources.
  - **Model security**: size limits, path protection (prevents path traversal in file sources), format validation.
- **`onnxEngine(options?)`** — `InferenceEngine` adapter backed by `onnxruntime-node`. Imported lazily via dynamic `import()` so apps that don't need ML never load the ~270MB native dependency.
  - Configurable `executionProviders` (e.g., `['cuda', 'cpu']` fallback chain).
- **`InferenceEngine<Input, Output>`** interface — two-method contract (`loadSession`, `run`) so users can plug in TF.js, pure-JS models, or any other backend.
- `onnxruntime-node` is a peer dependency, marked optional — only install in deployment targets that actually run inference.

#### Examples

- **`examples/basic-api`** — comprehensive example: signup/login with JWT, request validation (Zod via Standard Schema), rate limiting, security headers, route groups, and a CPU-bound "ML" endpoint offloaded to a `WorkerPool`. Includes a scheduled task via `@nodalite/scheduler`.
- **`examples/telegram-bot-thread`** — API server + a Telegram bot's long-polling loop running on an independent `worker_thread` via `runDetached()`. Demonstrates the background-thread pattern with automatic restart.
- **`examples/lambda-deploy`** — the same `App` shape deployed as an AWS Lambda function, with a working esbuild bundle + zip build script.

#### Repository Infrastructure

- **Changesets** configured (`.changeset/config.json`) for independent multi-package versioning.
- **tsup** build configuration per package: ESM + CJS + `.d.ts` with minification.
- **Vitest** test runner configured at repo root (`vitest.config.ts`) to discover `src/**/*.test.ts` across all packages.
- `tsconfig.base.json` shared across packages with per-package `tsconfig.json` overrides.
- **Testing philosophy**: real integration tests over mocks wherever cheap to run — `adapter-node` tests start a real HTTP server; `adapter-lambda` tests use realistic API Gateway event fixtures; `workers` tests spawn real `worker_threads` including a crash/restart cycle; `ml` tests spin up a real local server for disk caching verification.

#### License & Community Files

- MIT License
- `CODE_OF_CONDUCT.md` — Contributor Covenant
- `CONTRIBUTING.md` — contribution guidelines
- `SECURITY.md` — security policy and vulnerability reporting

---

## What's Next

The following features and improvements are being ideated and may appear in upcoming releases. Each is designed to challenge established frameworks (NestJS, FastAPI, Express.js) by solving their pain points — without replicating their architectural baggage.

### Short-term

- **Dependency Injection (DI) Container (`@nodalite/di`)** — Lightweight, runtime-agnostic, decorator-free DI scoped per request. Constructor injection, provider factories, and singleton/transient/request-scoped lifetimes. Unlike NestJS, the DI container is fully optional — opt in only where you need it. Compatible with all runtimes (Node, Bun, Deno, Workers). *Challenges NestJS where DI is mandatory and tightly coupled to the module system.*

- **Database integration layer (`@nodalite/db`)** — Unified migration runner, schema seeding, and transaction helpers for Drizzle, Prisma, and Kysely. Works with `@nodalite/scheduler` for periodic cleanup tasks, `@nodalite/workers` for CPU-intensive queries, and Lambda adapter for connection-pool warming. *Fills the gap that Express/FastAPI leave entirely manual; avoids NestJS's forced ORM coupling.*

- **GraphQL & tRPC support**
  - `@nodalite/graphql` — Mount a GraphQL Yoga or Apollo server as Nodalite middleware with context injection, auth middleware reuse, and runtime-agnostic execution.
  - `@nodalite/trpc` — Mount a tRPC router as a Nodalite handler, reusing middleware chains, validation schemas, and error handling.
  - *Matches FastAPI's Strawberry GraphQL and NestJS's `@nestjs/graphql`; Express requires manual setup.*

- **File upload handling (`@nodalite/upload`)** — Multipart form parsing with schema validation, size limits, content-type enforcement, and streaming to disk / S3 / R2. Progress callbacks and integration with `bodyLimit()` middleware. *Replaces Express's `multer` and FastAPI's `UploadFile` with a runtime-agnostic equivalent.*

- **WebSocket broadcasting improvements (`@nodalite/ws`)** — User-scoped broadcasting (emit to specific user IDs across connections), Redis pub/sub adapter for multi-instance deployments, automatic reconnection handling, and per-connection metadata filters. *Brings parity with Socket.IO and FastAPI's `websockets`; NestJS's WS layer is Node-only.*

- **CLI generators (`npx nodalite generate`)** — Scaffold routes, middleware, validators, and OpenAPI specs with `npx nodalite generate resource <name>` (generates route file, validation schema, handler stub, OpenAPI metadata). `npx nodalite generate middleware` and `npx nodalite generate module` for reusable groupings. *Mirrors NestJS CLI's productivity boost without its rigid module structure.*

- **Caching layer (`@nodalite/cache`)** — Decorator-based and middleware-based response caching with in-memory, Redis, and DynamoDB backends. Cache invalidation by tag, automatic stale-while-revalidate, and per-route TTL. *NestJS has `@nestjs/cache-manager`; FastAPI and Express have nothing built-in.*

- **Testing utilities (`@nodalite/testing`)** — `TestClient` (like FastAPI's `TestClient`) that runs handlers in-memory without a real server, mock helpers for auth/session/rate-limit stores, and assertion helpers for response shapes. Integration with Vitest out of the box. *Express and NestJS rely on `supertest`; this is runtime-aware and includes adapter mocks.*

- **OpenAPI improvements** — Hardening `@nodalite/openapi`: response schema auto-inference from handler return types, `discriminator` support for discriminated unions, security scheme definitions (API key, OAuth2, Bearer), webhook support, and request/response example generation.

- **Performance benchmarking suite** — Automated benchmarks using `autocannon` against a baseline workload, with p50/p99 latency and req/s reporting. Important before publishing any performance claims.

### Long-term

- **Edge-native GraphQL subscriptions** — WebSocket-based GraphQL subscriptions backed by Cloudflare Durable Objects, using `@nodalite/ws` as the transport layer. Subscriptions survive worker hibernation. *Neither Express nor NestJS can run GraphQL subscriptions on the edge; FastAPI requires a separate ASGI server.*

- **Admin panel generator** — `npx nodalite generate admin` creates a fully functional admin UI (React, Vue, or Svelte) with auth, CRUD operations, and dashboards derived from your OpenAPI spec. *Goes beyond FastAPI's read-only Swagger/ReDoc UI — generates actual management interfaces.*

- **Hot-reload / HMR for development (`nodalite dev`)** — Watch mode using esbuild or Vite that hot-reloads routes, middleware, and handlers without restarting the server process. Preserves in-memory scheduler state and WebSocket connections across reloads. *Faster iteration than NestJS's `--watch` (full process restart) and Express's manual nodemon setup.*

- **SSE (Server-Sent Events) support (`@nodalite/sse`)** — First-class SSE primitive: auto-reconnect, event IDs, per-connection channels, and backpressure handling. Works on all runtimes including edge. *FastAPI has `StreamingResponse`; Express/NestJS need manual `res.write` plumbing. Nodalite makes SSE as ergonomic as `c.json()`.*

- **Plugin / Module system (`@nodalite/plugin`)** — Formal plugin API for reusable modules that bundle routes, middleware, DI providers, lifecycle hooks (`onStart`, `onStop`), and their own OpenAPI specs. Unlike NestJS modules, plugins are runtime-agnostic and composable across scopes. *Challenges NestJS's module system by being optional, lighter, and cross-runtime.*

- **Distributed tracing viewer** — Dev-mode middleware that serves a local trace viewer (like Jaeger UI) showing filtered spans by route, method, status, and duration. Works with `@nodalite/otel` spans. *Neither NestJS, Express, nor FastAPI offers built-in trace visualization.*

- **Workflow / Saga engine (`@nodalite/workflows`)** — Long-running business processes with steps, automatic retries, compensation (saga pattern), and state persistence via Redis/DynamoDB. Designed for serverless — survives Lambda cold starts. *Fills the microservices orchestration gap that NestJS partially covers with `@nestjs/cqrs` and that FastAPI/Express lack entirely.*

- **Multi-tenant support (`@nodalite/tenancy`)** — Built-in tenant isolation: tenant resolution (subdomain, header, JWT claim), per-tenant database connection pooling, tenant-scoped caching, and middleware that enforces tenant boundaries. *A manual pain point in all three frameworks — Nodalite makes it declarative.*

- **gRPC support (`@nodalite/grpc`)** — Code-first protobuf generation from TypeScript interfaces, bidirectional streaming RPCs, reflection, and health-check protocol. Works on Node and Bun. *NestJS has `@nestjs/microservices` gRPC transport; Express and FastAPI lack built-in gRPC.*

- **Edge-native ML inference** — WebAssembly-based model execution via `onnxruntime-web` for Cloudflare Workers and other edge runtimes where native binaries aren't available. Would complement the existing `onnxEngine()` adapter for Node.js.
