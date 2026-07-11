# Changelog

All notable changes to Nodalite will be documented in this file.

This project uses [Changesets](https://github.com/changesets/changesets) for version management. Format follows [Keep a Changelog](https://keepachangelog.com/).

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

The following features and improvements are being ideated and may appear in upcoming releases:

### Planned

- **WebSocket support (`@nodalite/ws`)** — Real-time bidirectional communication. Requires genuinely different handling per runtime (Node's `ws` library, Cloudflare's `WebSocketPair`, API Gateway's WebSocket API) and deserves its own adapter package rather than bolting half-support onto the HTTP core. Considerations: connection lifecycle management, heartbeat/ping-pong, room/channel abstractions, and serverless WebSocket API integration.

- **Modular route auto-discovery (`discover()`)** — File-system based route loading from a `routes/` directory. Subdirectories become route groups, `_prefix.ts` files define prefixes. Already documented in the scaffolding guide as a planned structure option. Will enable `import { discover } from '@nodalite/core'; app.use(discover('./routes'))` for zero-boilerplate route registration.

- **Distributed rate limiting** — Production-ready `RateLimitStore` implementations for Redis (via `@upstash/ratelimit` or `ioredis`) and DynamoDB. The current `MemoryRateLimitStore` is explicitly documented as insufficient for serverless/multi-instance deployments.

### Under Consideration

- **OpenAPI improvements** — The `@nodalite/openapi` package (`0.1.2`) is currently untested in production (commit message: "not tested"). Planned hardening: response schema auto-inference from handler return types, `discriminator` support for discriminated unions, security scheme definitions (API key, OAuth2, Bearer), webhook support, and request/response example generation.

- **Password hashing middleware** — Deliberately not shipped in `0.1.0` because the right choice (Argon2id, bcrypt, scrypt) has real tradeoffs. Being considered as an optional `@nodalite/middleware` add-on with a sensible default (Argon2id) and configurable parameters.

- **Performance benchmarking suite** — Automated benchmarks using `autocannon` against a baseline workload, with p50/p99 latency and req/s reporting. Important before publishing any performance claims.

- **TypeScript project references** — For faster cross-package type-checking as the monorepo grows. Currently using shared `tsconfig.base.json` which is simpler but doesn't scale as well for incremental builds.

- **`@nodalite/auth`** — Dedicated authentication package consolidating JWT, OAuth2, session management, and role-based access control into a cohesive auth layer beyond the current `jwtAuth` middleware.

### Long-term

- **Edge-native ML inference** — WebAssembly-based model execution via `onnxruntime-web` for Cloudflare Workers and other edge runtimes where native binaries aren't available. Would complement the existing `onnxEngine()` adapter for Node.js.

- **OpenTelemetry integration** — Built-in tracing and metrics via `@nodalite/otel` for observability in production deployments.

- **Plugin system** — A formal plugin API for extending `App` with reusable middleware bundles, route collections, and lifecycle hooks.
