<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/dark.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/light.png">
    <img alt="Nodalite" src="assets/light.png" height="128" />
  </picture>
</p>

<h1 align="center">Nodalite</h1>

<p align="center">
  <strong>Runtime-agnostic TypeScript API framework</strong><br/>
  <em>The same <code>App</code> runs unmodified on Node, Lambda, Cloudflare Workers, Bun, and Deno.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/nodalite"><img src="https://img.shields.io/npm/v/nodalite?style=flat-square&color=blue&logo=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/nodalite"><img src="https://img.shields.io/npm/dm/nodalite?style=flat-square&logo=npm" alt="npm downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License: MIT" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-6.0+-3178C6?style=flat-square&logo=typescript" alt="TypeScript" /></a>
  <a href="https://github.com/AkkilMG/Nodalite/blob/main/package.json"><img src="https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=node.js" alt="Node >=18" /></a>
  <a href="https://nodalite.akkil.dev/"><img src="https://img.shields.io/badge/docs-VitePress-649C8B?style=flat-square" alt="Documentation" /></a>
</p>

---

## Table of Contents

- [Why Nodalite?](#why-nodalite)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Scaffolding](#scaffolding)
- [Packages](#packages)
- [Quick Start](#quick-start)
- [Examples](#examples)
- [Development](#development)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Why Nodalite?

Most Node.js frameworks assume a single runtime. Nodalite doesn't.

- **Write once, deploy anywhere** — the same `App` instance runs unmodified on Node.js, Bun, Deno, Cloudflare Workers, and AWS Lambda. No conditional imports, no adapter swapping at the application level.
- **Zero-dependency core** — `@nodalite/core` has literally zero runtime dependencies. It only uses what the JS runtime already provides (Fetch API). Smaller attack surface, faster installs, no supply-chain surprises.
- **Security by default** — built-in middleware for CORS, security headers, rate limiting, JWT auth, and body size limits. Follows OWASP guidance ("reject, don't sanitize") with structured error responses.
- **Full auth stack** — `@nodalite/auth` ships JWT with refresh token rotation, OAuth2 PKCE (Google, GitHub, Discord), role-based access control, session management, password hashing, and CSRF protection — all runtime-agnostic via WebCrypto.
- **Observability built in** — `@nodalite/otel` adds OpenTelemetry tracing and metrics with a single middleware call. HTTP spans, request duration histograms, active request counters, and W3C trace context propagation out of the box.
- **WebSocket support** — `@nodalite/ws` provides rooms, heartbeat, path-based routing, and per-connection typed state across Node.js, Cloudflare Workers, Deno, Bun, and AWS Lambda — with zero runtime dependencies.
- **Serverless-aware** — cold start hooks, disk-cached ML models, body size limits that check `Content-Length` before buffering, and adapters that properly convert API Gateway event shapes.

> Read the **[documentation](https://nodalite.akkil.dev/)** for the full architecture rationale, API reference, security checklist, and deployment guide.

---

## Features

- **Runtime-agnostic** — same `App` runs unmodified on Node, Bun, Deno, Cloudflare Workers, and AWS Lambda
- **Zero-dependency core** — `@nodalite/core` has zero runtime dependencies
- **Authentication & authorization** — JWT access/refresh token rotation, OAuth2 PKCE (Google, GitHub, Discord), RBAC, sessions, password hashing, CSRF ([docs](https://nodalite.akkil.dev/api/auth))
- **Security middleware** — CORS, security headers, rate limiting, body size limits ([docs](https://nodalite.akkil.dev/api/middleware))
- **Observability** — OpenTelemetry tracing, HTTP metrics, span enrichment, W3C trace context propagation ([docs](https://nodalite.akkil.dev/api/otel))
- **WebSocket support** — rooms, heartbeat, path-based routing, per-connection state across Node/Edge/Bun/Deno/Lambda ([docs](https://nodalite.akkil.dev/api/ws))
- **Background workers** — `worker_threads` for bots, pollers, and CPU offload ([docs](https://nodalite.akkil.dev/api/workers))
- **Scheduler** — cron/interval scheduling for long-running servers; serverless adapter too ([docs](https://nodalite.akkil.dev/api/scheduler))
- **ML inference** — serverless-aware model runner with ONNX Runtime adapter and built-in model security ([docs](https://nodalite.akkil.dev/api/ml))
- **OpenAPI** — auto-generated OpenAPI 3.1.0 specs, Swagger UI, and ReDoc endpoints ([docs](https://nodalite.akkil.dev/api/openapi))
- **Route auto-discovery** — file-system based route loading with `discover()`, prefix files, and nested groups
- **Distributed rate limiting** — Redis, DynamoDB, and Upstash store backends for serverless/multi-instance deployments
- **CLI scaffolding** — interactive project generation via `npx create-nodalite`
- **Request validation** — Standard Schema support (Zod, Valibot, ArkType) with structured 400 responses

---

## Requirements

| Requirement | Details |
|---|---|
| **Node.js >= 18** | Required for built-in Fetch API, `worker_threads`, and `crypto.subtle` |
| **Cloudflare Workers / Bun / Deno** | Use `@nodalite/adapter-edge` or no adapter at all |
| **`onnxruntime-node`** | Optional peer dependency — only needed for ONNX ML inference |

---

## Installation

**Core package:**

```bash
npm install nodalite
# or the scoped form:
npm install @nodalite/core
```

**Adapters & extras** — install only what you need:

```bash
npm install @nodalite/adapter-node      # Node.js server
npm install @nodalite/adapter-lambda    # AWS Lambda
npm install @nodalite/adapter-edge      # Cloudflare Workers
npm install @nodalite/middleware         # Security & HTTP middleware
npm install @nodalite/auth               # JWT, OAuth2, RBAC, sessions, CSRF
npm install @nodalite/ws                 # WebSocket support (rooms, heartbeat, multi-runtime)
npm install @nodalite/otel               # OpenTelemetry tracing & metrics
npm install @nodalite/workers            # Background threads
npm install @nodalite/scheduler          # Cron/interval scheduling
npm install @nodalite/ml                 # ML inference
npm install @nodalite/openapi            # OpenAPI spec generation + Swagger UI
```

---

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

---

## Packages

| Package | Description | Docs |
|:---|:---|:---|
| `nodalite` | Unscoped alias — re-exports everything from `@nodalite/core` | |
| `@nodalite/core` | Router, `Context`, `App`, middleware, errors, validation, `discover()`. **Zero dependencies.** | [API](https://nodalite.akkil.dev/api/core) |
| `@nodalite/middleware` | `cors`, `securityHeaders`, `rateLimit`, `bodyLimit` + distributed rate-limit stores (Redis, DynamoDB, Upstash) | [API](https://nodalite.akkil.dev/api/middleware) |
| `@nodalite/auth` | JWT access/refresh tokens, OAuth2 PKCE, RBAC, sessions, password hashing, CSRF | [API](https://nodalite.akkil.dev/api/auth) |
| `@nodalite/ws` | WebSocket server with rooms, heartbeat, path routing — adapters for Node, Edge, Bun, Deno, Lambda | [API](https://nodalite.akkil.dev/api/ws) |
| `@nodalite/otel` | OpenTelemetry middleware — HTTP spans, request metrics, W3C trace context propagation | [API](https://nodalite.akkil.dev/api/otel) |
| `@nodalite/adapter-node` | `serve(app)` — run on a plain Node http/https server | [API](https://nodalite.akkil.dev/api/adapter-node) |
| `@nodalite/adapter-lambda` | `createLambdaHandler(app)` — API Gateway v1/v2 + Lambda Function URLs | [API](https://nodalite.akkil.dev/api/adapter-lambda) |
| `@nodalite/adapter-edge` | `createEdgeHandler(app)` — Cloudflare Workers (Bun/Deno need no adapter) | [API](https://nodalite.akkil.dev/api/adapter-edge) |
| `@nodalite/workers` | `runDetached()` — independent background thread; `WorkerPool` — CPU offload | [API](https://nodalite.akkil.dev/api/workers) |
| `@nodalite/scheduler` | `Scheduler` — cron/interval for long-running servers; `toServerlessTask()` | [API](https://nodalite.akkil.dev/api/scheduler) |
| `@nodalite/ml` | `Model` — cached, engine-agnostic inference runner with built-in model security | [API](https://nodalite.akkil.dev/api/ml) |
| `@nodalite/openapi` | OpenAPI 3.1.0 spec generation, Swagger UI, and ReDoc endpoints | [API](https://nodalite.akkil.dev/api/openapi) |

---

## Quick Start

### Node.js

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

### AWS Lambda

```ts
import { createLambdaHandler } from '@nodalite/adapter-lambda';
export const handler = createLambdaHandler(app);
```

### Cloudflare Workers

```ts
import { createEdgeHandler } from '@nodalite/adapter-edge';
export default createEdgeHandler(app);
```

### Bun / Deno

No adapter needed — `app.fetch` already matches their native server signature:

```ts
export default { fetch: app.fetch };
```

---

## Examples

| Example | Description | Run |
|:---|:---|:---|
| **`examples/basic-api`** | Signup/login with JWT, Zod validation, rate limiting, security headers, route groups, and a CPU-bound endpoint offloaded to a `WorkerPool` | `npm run dev -w examples-basic-api` |
| **`examples/ws-chat`** | Real-time chat room with `@nodalite/ws` — rooms, per-connection state, heartbeat, mixed HTTP + WebSocket on the same port | `npm run dev -w examples-ws-chat` |
| **`examples/telegram-bot-thread`** | API server + Telegram bot long-polling on an independent `worker_thread` via `runDetached()` | `npm run dev -w examples-telegram-bot-thread` |
| **`examples/lambda-deploy`** | Same `App` deployed as an AWS Lambda function with esbuild bundle + zip script | `npm run build -w examples-lambda-deploy` |
| **`examples/ml-inference`** | ML model inference using `@nodalite/ml` with `onnxEngine()` | See example directory |
| **`examples/security-api`** | Security middleware showcase | See example directory |

---

## Development

```bash
# Install everything across the workspace
npm install

# Build every package (tsup: ESM + CJS + .d.ts)
npm run build --workspaces --if-present

# Run every package's test suite (Vitest)
npm test

# Type-check across every package
npm run typecheck --workspaces --if-present

# Lint
npm run lint
```

The monorepo uses [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references.html) for incremental builds — a root `tsconfig.json` wires all 14 packages together via `tsconfig.build.json` files with `composite: true`.

Every package is genuinely tested, not just typed: `adapter-node` tests start a real HTTP server and hit it with `fetch()`; `adapter-lambda` tests use realistic API Gateway event fixtures; `workers` tests spawn real `worker_threads` including a crash/restart cycle; `ml` tests spin up a real local server to verify on-disk model caching; `auth` tests run a full end-to-end token issue → access → RBAC → refresh rotation flow; `ws` tests cover connection lifecycle, room management, and heartbeat across all runtime adapters.

---

## Contributing

We welcome contributions! Please read our community files before opening issues or PRs:

- [**Contributing Guide**](./CONTRIBUTING.md) — development workflow, code style, PR process
- [**Code of Conduct**](./CODE_OF_CONDUCT.md) — Contributor Covenant v2.1
- [**Changelog**](./CHANGELOG.md) — version history and release notes

```bash
git clone https://github.com/AkkilMG/Nodalite.git
cd nodalite
npm install
npm test
```

---

## Security

If you discover a security vulnerability, please report it privately by emailing **me@akkil.dev**. Do **not** open a public GitHub issue. See [SECURITY.md](./SECURITY.md) for details.

---

## License

[MIT](LICENSE) &copy; 2024-present [Akkil](https://akkil.dev)
