# Nodalite

[![npm version](https://img.shields.io/npm/v/nodalite?color=blue&logo=npm)](https://www.npmjs.com/package/nodalite)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![CI](https://github.com/AkkilMG/Nodalite/actions/workflows/ci.yml/badge.svg)](https://github.com/AkkilMG/Nodalite/actions/workflows/ci.yml)
[![npm downloads](https://img.shields.io/npm/dm/nodalite)](https://www.npmjs.com/package/nodalite)

A small, runtime-agnostic TypeScript API framework: the same `App` instance
runs unmodified on a Node server, AWS Lambda, and Cloudflare Workers, with
built-in security middleware, an independent-background-thread pattern for
things like bots/pollers, and a serverless-aware ML inference runner.

Read **[`docs/GUIDE.md`](./docs/GUIDE.md)** for the full architecture
rationale, security checklist, deployment guide, and the complete
build/test/publish playbook. This README is just the quick start.

## Features

- **Runtime-agnostic** — same `App` runs unmodified on Node, Bun, Deno, Cloudflare Workers, and AWS Lambda
- **Zero-dependency core** — `@nodalite/core` has zero runtime dependencies
- **Security middleware** — CORS, security headers, rate limiting, JWT auth
- **Background workers** — `worker_threads` for bots, pollers, and CPU offload
- **Scheduler** — cron/interval scheduling for long-running servers; serverless adapter too
- **ML inference** — serverless-aware model runner with ONNX Runtime adapter
- **CLI scaffolding** — interactive project generation via `npx create-nodalite`

## Requirements

- **Node.js >= 18** — required for built-in Fetch API, `worker_threads`, and `crypto.subtle`
- Cloudflare Workers, Bun, and Deno work with `@nodalite/adapter-edge` or no adapter at all
- `onnxruntime-node` is an optional peer dependency (only needed for ONNX ML inference)

## Installation

```bash
npm install nodalite
# or the scoped form:
npm install @nodalite/core
```

Or install adapters as needed:

```bash
npm install @nodalite/adapter-node    # Node.js server
npm install @nodalite/adapter-lambda  # AWS Lambda
npm install @nodalite/adapter-edge    # Cloudflare Workers
npm install @nodalite/workers         # Background threads
npm install @nodalite/scheduler       # Cron/interval scheduling
npm install @nodalite/ml              # ML inference
```

## Scaffolding

Scaffold a new project in seconds:

```bash
npm create nodalite
# or
npx nodalite create
```

Follow the interactive prompts to select a **purpose** (API, Telegram bot,
Lambda, Edge), and optionally add **ML inference**, **security middleware**,
and a **job scheduler**. A ready-to-run project is generated with all
dependencies installed.

## Packages

| Package | What it is |
|---|---|
| `nodalite` | Unscoped alias — re-exports everything from `@nodalite/core`. |
| `@nodalite/core` | Router, `Context`, `App`, middleware, errors, validation. Zero dependencies. |
| `@nodalite/middleware` | `cors`, `securityHeaders`, `rateLimit`, `jwtAuth`, `logger`, `bodyLimit` |
| `@nodalite/adapter-node` | `serve(app)` — run on a plain Node http/https server |
| `@nodalite/adapter-lambda` | `createLambdaHandler(app)` — API Gateway v1/v2 + Lambda Function URLs |
| `@nodalite/adapter-edge` | `createEdgeHandler(app)` — Cloudflare Workers (Bun/Deno need no adapter) |
| `@nodalite/workers` | `runDetached()` — independent background thread; `WorkerPool` — CPU offload |
| `@nodalite/scheduler` | `Scheduler` — cron/interval for long-running servers; `toServerlessTask()` |
| `@nodalite/ml` | `Model` — cached, engine-agnostic inference runner; `onnxEngine()` adapter |

## Quick start

```ts
import { App } from '@nodalite/core';
import { cors, securityHeaders } from '@nodalite/middleware';
import { serve } from '@nodalite/adapter-node';

const app = new App();
app.use('*', securityHeaders());
app.use('*', cors({ origin: 'https://your-frontend.example' }));

app.get('/health', (c) => c.json({ ok: true }));
app.get('/users/:id', (c) => c.json({ id: c.req.param('id') }));

serve(app, { port: 3000 });
```

The exact same `app` also works as a Lambda handler:
```ts
import { createLambdaHandler } from '@nodalite/adapter-lambda';
export const handler = createLambdaHandler(app);
```
...or on Cloudflare Workers:
```ts
import { createEdgeHandler } from '@nodalite/adapter-edge';
export default createEdgeHandler(app);
```
...or directly on Bun/Deno, since `app.fetch` already matches their native
server signature — no adapter needed at all.

## Examples

- **`examples/basic-api`** — the fullest example: signup/login with JWT,
  request validation (Zod via Standard Schema), rate limiting, security
  headers, a route group, and a CPU-bound "ML" endpoint offloaded to a
  `WorkerPool` (swap in a real ONNX model via `@nodalite/ml` and the wiring
  doesn't change). Run it:
  ```bash
  npm install && npm run dev -w examples-basic-api
  ```
- **`examples/telegram-bot-thread`** — the same API server, plus a Telegram
  bot's long-polling loop running on an independent, supervised
  `worker_thread` via `runDetached()`. Set `TELEGRAM_BOT_TOKEN` and run:
  ```bash
  npm run dev -w examples-telegram-bot-thread
  ```
- **`examples/lambda-deploy`** — the same `App` shape, deployed as a real
  AWS Lambda function, with a working esbuild bundle + zip script:
  ```bash
  npm run build -w examples-lambda-deploy
  ```

## Development

```bash
npm install           # install everything across the workspace
npm run build --workspaces --if-present  # build every package (tsup, ESM + CJS + .d.ts)
npm test              # run every package's test suite (Vitest)
npm run typecheck --workspaces --if-present  # tsc --noEmit across every package
```

See **[`CONTRIBUTING.md`](./CONTRIBUTING.md)** and **[`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)** before opening issues or PRs.

Every package here is genuinely tested, not just typed: `adapter-node`'s
tests start a real HTTP server and hit it with `fetch()`; `adapter-lambda`'s
tests use realistic API Gateway event fixtures; `workers`' tests spawn real
`worker_threads` including a real crash/restart cycle; `ml`'s tests spin up
a real local server to verify on-disk model caching. See
[`docs/GUIDE.md` §8.4](./docs/GUIDE.md#84-testing-strategy) for the full
testing philosophy.

## License

MIT
