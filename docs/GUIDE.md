# Nodalite — Architecture & Field Guide

This is the "everything you need to know" document for the framework built in
this repo. It covers *why* it's built this way, how the pieces fit together,
and what's involved in shipping and maintaining it as a real npm package.

The framework is called **Nodalite** in this repo — rename it before you
publish (see [Naming & rebranding](#naming--rebranding)).

---

## 1. What problem this actually solves

Every existing TS/JS API framework picks one deployment target and is good at
it. The gap is frameworks that are equally good on a long-running server
*and* on serverless *and* on edge — without you rewriting anything when you
move between them.

| Framework | Runtimes | Serverless-native | Built-in security | Background jobs | ML inference story |
|---|---|---|---|---|---|
| Express 5 | Node only | Bolt-on (serverless-http) | None built in | None | None |
| Fastify 5 | Node only | Bolt-on | Plugins (helmet, rate-limit) | None | None |
| NestJS | Node only | Poor cold starts | Guards/interceptors (heavy) | `@nestjs/schedule` (server-only) | None |
| Hono | Node/Bun/Deno/Workers/Lambda | Yes | Middleware ecosystem | None | None |
| Elysia | Bun-first | Bun only | Plugins | None | None |
| **Nodalite** | Node/Bun/Deno/Workers/Lambda | Yes (first-class) | Built in (`@nodalite/middleware`) | Yes, both server-cron and serverless patterns | Yes (`@nodalite/ml`) |

The two genuinely unmet needs this repo focuses on, because nothing else
solves them cleanly:

1. **"Run an independent background thread (a bot, a poller) alongside my
   API"** — solved by `@nodalite/workers`' `runDetached()`, with an honest
   answer for why that specific pattern doesn't and can't exist on
   serverless (see §5).
2. **"Run a lightweight ML model without a huge cold start or memory
   footprint"** — solved by `@nodalite/ml`'s `Model` class: disk-caches
   model bytes across cold starts, reuses the loaded session across warm
   invocations, and is engine-agnostic so it doesn't force a specific
   runtime's native bindings on you.

Everything else (routing, middleware, validation, auth, rate limiting) is a
*well-executed table-stakes* implementation, built on the standard Fetch API
so the exact same code genuinely runs unmodified everywhere — not a
"mostly-compatible" adapter layer bolted onto a Node-only core.

---

## 2. Why the Fetch API (`Request`/`Response`) as the foundation

This is the single most important architectural decision, and it's what
makes cross-runtime portability *real* instead of aspirational:

- Node 18+, Bun, Deno, and Cloudflare Workers all implement the standard
  `Request`/`Response`/`Headers`/`ReadableStream` globals natively.
- If your core routing/middleware engine is written against *that* standard
  instead of a runtime-specific shape (Node's `IncomingMessage`, Express's
  `req`/`res`, AWS's `APIGatewayProxyEvent`), then "porting" to a new runtime
  is just writing a thin adapter that converts *into* a `Request` and
  converts a `Response` *back out* — a few dozen lines, not a rewrite.
- This is exactly how Hono achieves multi-runtime support, and it's why
  `@nodalite/core` has **zero runtime dependencies**: it only needs what the
  JS runtime already provides.

Contrast with Express: `req`/`res` are Node-specific objects tied to
`http.IncomingMessage`/`http.ServerResponse`. That's *why* Express needs a
translation shim (`serverless-http`) to run on Lambda at all, and why it
can't run on Workers/Deno without a much heavier compatibility layer.

---

## 3. Package layout and why it's split this way

```
packages/
  core/            @nodalite/core          — router, Context, App, middleware compose, errors, validation. Zero deps.
  middleware/      @nodalite/middleware     — cors, securityHeaders, rateLimit, jwtAuth, logger, bodyLimit
  adapter-node/    @nodalite/adapter-node   — serve() for a plain Node http/https server
  adapter-lambda/  @nodalite/adapter-lambda — createLambdaHandler() for API Gateway v1/v2 + Lambda Function URLs
  adapter-edge/    @nodalite/adapter-edge   — createEdgeHandler() for Cloudflare Workers (Deno/Bun need no adapter)
  workers/         @nodalite/workers        — runDetached() (independent thread) + WorkerPool (CPU offload)
  scheduler/       @nodalite/scheduler      — Scheduler (cron/interval, long-running) + toServerlessTask()
  ml/              @nodalite/ml             — Model (cached, engine-agnostic inference) + onnxEngine()
examples/
  basic-api/            full example: auth, validation, rate limiting, JWT, worker-pool "ML" endpoint, scheduled task
  lambda-deploy/         the same App shape, deployed as a Lambda handler, with a real esbuild+zip build script
  telegram-bot-thread/   API server + an independent bot thread via runDetached()
```

**Why this many packages instead of one big framework?** Three reasons:

1. **Tree-shaking / bundle size.** A Cloudflare Worker deploying with
   `adapter-edge` should never pull in Node's `worker_threads` or AWS Lambda
   types. Splitting by deployment target means `npm install` only pulls what
   you use.
2. **Dependency isolation.** `@nodalite/ml`'s ONNX integration depends on a
   ~270MB native package (`onnxruntime-node`). That's a `peerDependency`,
   marked optional, imported with a *dynamic* `import()` inside
   `onnx-engine.ts` — so an app that never touches ML pays nothing for it,
   at install time or bundle time.
3. **Independent versioning.** `@nodalite/adapter-lambda` can ship a fix for
   an AWS event-shape edge case without forcing a version bump on
   `@nodalite/core`. This is what a monorepo + independent package
   versioning buys you (see §8, Changesets).

`@nodalite/core` depends on nothing else in the workspace and has zero
runtime dependencies at all — it's the one package every other package (and
every app) depends on, so its dependency graph needs to stay minimal and
stable forever.

---

## 4. How the request pipeline actually works

```
Request (adapter-specific: IncomingMessage / Lambda event / native fetch Request)
   │
   ▼  adapter converts to a standard Request
App.handle(request, platform)
   │
   ├─ Router.match(method, path)   → route + its route-scoped middlewares, or null
   ├─ build Context(request, params, platform)
   ├─ compose([...global middlewares matching this path, ...route middlewares], finalHandler)
   │     · "onion" model: each middleware wraps everything after it
   │     · a middleware either returns next() (continue) or its own Response (short-circuit)
   └─ run the composed chain, catching thrown errors
         · HttpError → converted to the right status + JSON body
         · anything else → wrapped as a 500, original error logged server-side, never leaked to the client
   │
   ▼  adapter converts the returned Response back to its native shape
Response (adapter-specific)
```

Key correctness properties this buys you (all covered by
`packages/core/src/index.test.ts`):

- **No dangling promises.** Every middleware/handler must resolve to a
  `Response` — there's no "returned undefined, silently did nothing" case
  like classic Express middleware bugs.
- **Errors can't leak internals by default.** `HttpError.expose` defaults to
  `true` only for 4xx errors; anything else becomes a generic
  `"Internal Server Error"` in the response while the real error still gets
  logged server-side.
- **Global middleware is path-scoped**, not just "runs on everything or
  nothing" — `app.use('/api/*', mw)` only runs for matching paths, checked
  per-request against the *actual* incoming path, not registration order
  tricks.

---

## 5. Independent background threads — and their serverless limit, honestly

`runDetached()` spawns a supervised `worker_thread` that lives for the
lifetime of the Node process. This is genuinely useful and genuinely
different from "just run two processes" because:

- it shares the same container/deployment unit (one process to deploy,
  monitor, and restart, not two),
- a crash in the worker (bot logic throwing, a bad message loop) doesn't
  take down the HTTP server's event loop, and vice versa,
- automatic exponential-backoff restart is built in.

**The honest limit:** a `worker_thread` only exists between the moment its
parent Node process starts and the moment it exits. On AWS Lambda, Cloudflare
Workers, or any FaaS platform, there is no such persistent parent process —
the runtime freezes/destroys your execution environment between invocations
(possibly reusing it for a while on a "warm" container, but never
guaranteed, and never for something initiated *inside* a single request).
There is no version of `runDetached()` that works on Lambda, because the
premise (a process that outlives a single request, indefinitely) is exactly
what serverless does not provide.

**What to actually do for a bot/poller on serverless**, in order of
preference:
1. **Switch the bot to webhooks.** Telegram, Slack, Discord, GitHub, Stripe,
   etc. all support "call my URL when something happens" instead of "I poll
   you." A webhook is just another route on your existing serverless API —
   no persistent thread needed at all. This is almost always the right fix.
2. **If long-polling is unavoidable** (a provider with no webhook option),
   run that specific piece as a small always-on service — a single
   container on Fly.io/Railway/ECS Fargate/a $5 VPS — separate from your
   serverless API. `runDetached()` is exactly the right tool *for that
   container*.
3. **If it's periodic, not continuous**, it's not actually a background
   thread problem — it's a scheduling problem. Use `toServerlessTask()` from
   `@nodalite/scheduler` behind your cloud's native scheduler (EventBridge
   Scheduler → Lambda, Cloudflare Cron Triggers → Worker).

---

## 6. ML inference, and what "lightweight, even on serverless" really requires

The three things that make ML inference painful on serverless are cold
start latency, the /tmp and memory ceiling, and duplicating work across
warm invocations. `@nodalite/ml`'s `Model` class addresses exactly those
three, and nothing else — it does not try to be a full ML framework:

- **Model bytes are cached to disk** (`os.tmpdir()`, which is `/tmp` on
  Lambda) keyed by a hash of the source URL. A `url`-sourced model is
  downloaded once per *container*, not once per *request* — subsequent
  invocations on the same warm container read from `/tmp` instantly. (Lambda
  gives you up to 10 GB of `/tmp`, configurable — plenty for genuinely
  lightweight models; this pattern is not a fit for multi-GB models.)
- **The constructed inference session is cached in memory** on the `Model`
  instance, keyed by nothing more than "has this been loaded yet" — a warm
  container reuses the same loaded session across requests instead of
  re-parsing the model file every time.
- **Concurrent cold-start requests share one load.** If five requests hit a
  freshly cold container before the model finishes loading, they all await
  the *same* in-flight promise instead of triggering five parallel
  downloads/parses.
- **`warm()`** lets you pay this cost once, proactively, from
  `createLambdaHandler`'s `onColdStart` hook — instead of the first real
  request eating the load latency.

`Model` is engine-agnostic (`InferenceEngine` is a two-method interface) so
it isn't opinionated about *how* inference actually runs. The shipped
`onnxEngine()` adapter wraps `onnxruntime-node`, imported lazily via dynamic
`import()` so apps that don't need it never load a ~270MB native dependency.
For genuinely small models (a logistic regression, a small decision tree, a
distilled sentiment classifier), consider **not** using a native runtime at
all — a pure-JS implementation, or `onnxruntime-web`'s WASM backend, avoids
native bindings entirely and is often the better "lightweight and
serverless" choice. The `examples/basic-api` sentiment endpoint intentionally
uses a dependency-free stand-in model to make this point concrete: the
worker-pool wiring is identical whether "the model" is three lines of JS or
a real ONNX graph.

**Should inference run on the main thread or a worker thread?** If a single
inference call is fast (a few ms), the main thread is fine. If it's slow
enough to noticeably delay other concurrent requests (tens of ms or more,
which most real models are), offload it to `@nodalite/workers`'
`WorkerPool` — see `examples/basic-api/src/app.ts`, which does exactly this.

---

## 7. Security & HTTP correctness checklist

Everything here ships in `@nodalite/middleware`, but knowing *why* each one
matters is what makes you able to configure them correctly instead of
copy-pasting defaults:

- **CORS** (`cors()`) — secure by default: if you don't configure `origin`,
  no `Access-Control-Allow-Origin` header is sent at all, rather than
  silently allowing `*`. Set `origin` to your actual frontend origin(s) in
  production; only use `'*'` for genuinely public, unauthenticated APIs.
- **Security headers** (`securityHeaders()`) — the OWASP-recommended set
  (`X-Content-Type-Options: nosniff`, `X-Frame-Options`,
  `Strict-Transport-Security`, a conservative `Content-Security-Policy`).
  Tune `contentSecurityPolicy` for your actual asset origins if you serve a
  frontend from the same domain.
- **Rate limiting** (`rateLimit()`) — the shipped `MemoryRateLimitStore` is
  **not sufficient on serverless or any multi-instance deployment**: each
  cold-started/scaled-out instance has its own memory, so the limit isn't
  enforced globally. Implement `RateLimitStore` against Redis/Upstash/
  DynamoDB for real distributed rate limiting — it's one method
  (`increment(key, windowMs)`).
- **JWT auth** (`jwtAuth()` / `signJwt()`) — built on `jose`, which is
  WebCrypto-based (works on every runtime, unlike `jsonwebtoken` which needs
  Node's native crypto module). Keep access tokens short-lived (the example
  uses 1 hour) and use a separate, longer-lived refresh token flow for
  anything that needs persistent sessions — don't just extend the access
  token's expiry.
- **Body size limits** (`bodyLimit()`) — rejects oversized requests by
  `Content-Length` *before* buffering the body, which matters most on
  serverless where memory is metered and billed.
- **Input validation** (`validate()`) — built against the vendor-neutral
  [Standard Schema](https://standardschema.dev) interface (supported by Zod
  3.24+, Valibot, ArkType), not tied to one validator. Reject invalid input
  outright (400 + structured issues) rather than trying to coerce/sanitize
  it — coercion hides bugs and can itself be a security issue (type
  confusion).
- **Password hashing** — deliberately *not* shipped as a middleware, because
  the right choice (Argon2id via the `argon2` package, or bcrypt/scrypt) has
  real tradeoffs and shouldn't be silently defaulted for you. The example
  app's SHA-256 stand-in is explicitly commented as unsafe — see its comment
  for what to actually use.
- **Secrets** — never commit `.env` files with real secrets. Use your
  platform's secret manager (AWS Secrets Manager/Parameter Store, Cloudflare
  Workers Secrets, Doppler, etc.) and inject at runtime. Rotate the example
  app's `JWT_SECRET` default before deploying anything real — it's
  intentionally an obvious placeholder.

---

## 8. Building, testing, and shipping this as a real npm package

This section is the "how do I actually maintain and publish this" playbook.

### 8.1 Monorepo tooling

- **npm workspaces** (configured via `"workspaces"` in root `package.json`)
  for the monorepo. `"*"` dependencies between packages resolve to the local
  package during development and get replaced with real version ranges
  automatically at publish time.
- **tsup** to build each package to both ESM (`dist/index.js`) and CJS
  (`dist/index.cjs`) with generated `.d.ts` files — this is what lets your
  package work for consumers on either module system without them needing
  to configure anything. The `exports` map in each `package.json` is what
  actually routes `import`/`require` to the right file; get this wrong and
  you'll see confusing "cannot find module" errors only in some consumers'
  setups.
- **TypeScript project references** aren't used here (kept simpler with a
  shared `tsconfig.base.json` + per-package `tsconfig.json`) — worth
  adopting once cross-package type-checking speed becomes a real problem.

### 8.2 Versioning & publishing: Changesets

For a multi-package repo where packages depend on each other, use
[Changesets](https://github.com/changesets/changesets):

```bash
npm install -D @changesets/cli
npx changeset init
```

Workflow:
1. After making a change, run `npx changeset` — it asks which packages
    changed and whether it's a patch/minor/major bump, and writes a small
    markdown file describing the change.
2. Merge that alongside your PR.
3. A CI job (or you, locally) runs `npx changeset version` — this bumps
    every affected package's `package.json`, updates their changelogs, and
    crucially **bumps the `"*"` ranges of dependent packages to real version
    numbers**.
4. `npm publish --workspaces` (or `npx changeset publish`) publishes everything that
   changed to npm in the correct dependency order.

This is what keeps `@nodalite/middleware`'s dependency on
`@nodalite/core: *` from ever pointing at a broken/nonexistent
version once published.

### 8.3 Semantic versioning discipline

- `@nodalite/core`'s public API (`App`, `Context`, `Middleware`, `HttpError`)
  is the one surface every other package and every app depends on
  transitively — treat any signature change there as a **major** version
  bump, always, even a seemingly small one like renaming a `Context` method.
- Adapters (`adapter-node`, `adapter-lambda`, `adapter-edge`) can iterate
  faster (their consumers are apps, not other packages), but breaking the
  `serve()`/`createLambdaHandler()` call signature is still major.
- Use `npx changeset` honestly — resist the urge to under-bump a breaking
  change to avoid a major version number; consumers pinning `^` ranges will
  get broken installs otherwise.

### 8.4 Testing strategy

The tests in this repo follow one rule: **prefer a real integration test
over a mocked one wherever it's cheap to run.**

- `adapter-node`'s tests start a real `http.Server` on an OS-assigned port
  and hit it with a real `fetch()` — not a simulated request object.
- `adapter-lambda`'s tests use realistic API Gateway v1/v2 event fixtures
  (not simplified stand-ins) so a real shape mismatch would actually fail.
- `workers`' tests spawn real `worker_threads`, including a real
  crash-and-restart cycle with real timing, not a mocked `Worker` class.
- `ml`'s tests spin up a real local HTTP server to verify actual disk
  caching of downloaded model bytes.

Where a real dependency is genuinely too heavy for unit tests (the ~270MB
`onnxruntime-node` native binary), the code is still written against its
real API — only the *test* uses a fake `InferenceEngine` implementing the
same two-method interface, so the logic under test (caching, dedup, warm
reuse) is validated for real while the expensive native dependency stays
optional.

Run everything: `npm test` from the repo root (Vitest, configured via
`vitest.config.ts` to pick up every package's `src/**/*.test.ts`).

### 8.5 CI/CD (GitHub Actions sketch)

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck --workspaces --if-present
      - run: npm test
      - run: npm run build --workspaces --if-present

  release:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - uses: changesets/action@v1
        with:
          publish: npm run release
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The `changesets/action` handles the whole "is there a pending changeset →
open a release PR → merge it → publish to npm" loop for you.

### 8.6 Docs generation

For public API reference docs, add [TypeDoc](https://typedoc.org/):

```bash
npm install -D typedoc
npx typedoc --entryPointStrategy packages "packages/*" --out docs/api
```

Since every exported function/class here already has a JSDoc comment
explaining *why*, not just *what* (deliberately, throughout this codebase),
TypeDoc output will actually be useful instead of restating type signatures.

### 8.7 Benchmarking

Before publishing performance claims (a real temptation once you have a fast
router), benchmark honestly against the same workload other frameworks are
usually benchmarked with — [autocannon](https://github.com/mcollina/autocannon)
against a plaintext-JSON `/` route is the common baseline:

```bash
npx autocannon -c 100 -d 10 http://localhost:3000/health
```

Report p50/p99 latency and req/s, and be explicit about hardware and Node
version — raw numbers without that context aren't comparable to anything.

### 8.8 Security auditing

- `npm audit` (or GitHub's Dependabot, enabled by default on public repos)
  for known-vulnerable dependency versions.
- Since `@nodalite/core` has zero runtime dependencies, its own attack
  surface from supply-chain issues is minimal by construction — worth
  preserving deliberately as the project grows; resist adding a dependency
  to `core` for convenience.
- Run `npm pack --dry-run` in each package before publishing to check
  exactly what files would be published — the `"files": ["dist"]` field in
  each `package.json` should mean only build output (not `src/`, tests, or
  fixtures) ships to consumers.

---

## 9. Deployment quick-reference

### Node / container / VM
```ts
import { serve } from '@nodalite/adapter-node';
import { app } from './app.js';
serve(app, { port: 3000 });
```
Deploy however you'd deploy any Node app: Docker image on ECS/Cloud
Run/Fly.io, or directly on a VM behind a reverse proxy (nginx/Caddy)
terminating TLS. `runDetached()` and `Scheduler` both work fully here.

### AWS Lambda
```ts
import { createLambdaHandler } from '@nodalite/adapter-lambda';
import { app } from './app.js';
export const handler = createLambdaHandler(app, { onColdStart: async () => { /* warm anything heavy */ } });
```
Bundle with esbuild (see `examples/lambda-deploy/package.json`'s `build`
script) to a single `.mjs` file, zip it, and upload — or build a container
image if you're over the 250MB unzipped package limit (e.g. bundling
`onnxruntime-node`). Put it behind API Gateway (HTTP API is cheaper and
faster cold starts than REST API) or a Lambda Function URL directly if you
don't need API Gateway's extra features.

### Cloudflare Workers
```ts
import { createEdgeHandler } from '@nodalite/adapter-edge';
import { app } from './app.js';
export default createEdgeHandler(app); // forwards env bindings (KV/D1/R2) into c.platform.env
```

### Bun / Deno
No adapter needed — `app.fetch` already matches their native server APIs:
```ts
// Bun
Bun.serve({ fetch: (req) => app.fetch(req) });
// Deno
Deno.serve((req) => app.fetch(req));
```

---

## 10. Naming & rebranding

This repo uses **Nodalite** as a working name. Before publishing for real:

1. Check npm for name availability across the whole scope
   (`@yourscope/core`, `@yourscope/middleware`, etc.) — `npm view <name>`.
2. Rename every `package.json`'s `name` field and every internal
   `@nodalite/*` import across all `src/` files (a single find-and-replace
   across the repo is sufficient — nothing here depends on the literal
   string "nodalite" beyond the package names themselves).
3. Update the `App`'s default `name` option in `app.ts` if you want a
   different default service name in logs/errors.
4. Register the org scope on npm (`npm org create <scope>`) if publishing
   under a scoped name.

---

## 11. What's deliberately *not* included (and why)

- **No built-in ORM/database layer.** Every project's data layer needs are
  different enough that baking one in would make the framework heavier for
  everyone to save setup time for some. Use Drizzle, Prisma, or Kysely
  directly — they all work fine with the plain `Context`/`Request` model.
- **No built-in DI container.** A generic service registry is easy to build
  yourself with a `Map` and `c.set`/`c.get`, and a full DI framework (like
  NestJS's) is exactly the kind of "heavy for small apps" tradeoff this
  project is explicitly avoiding. If you want one, `tsyringe` or `awilix`
  compose fine on top of `@nodalite/core` — attach the resolved container to
  `c.platform` or `c.set()` in a global middleware.
- **No built-in OpenAPI generation.** Standard-Schema-based validation
  (`validate()`) makes this addable later (Zod schemas can generate OpenAPI
  via `zod-to-openapi`), but it's not core-critical and adds real
  complexity/dependencies for something not every API needs.
- **No WebSocket support yet.** Real gap, deliberately deferred: WebSockets
  need genuinely different handling per runtime (Node's `ws` library vs.
  Cloudflare's `WebSocketPair` vs. API Gateway's separate WebSocket API) and
  deserve their own adapter package (`@nodalite/ws`) rather than bolting
  half-support onto the HTTP-shaped core.
