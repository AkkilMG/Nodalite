# Introduction

**Nodalite** is a small, runtime-agnostic TypeScript API framework. The same
`App` instance runs unmodified on:

- **Node.js** (18+) — via `@nodalite/adapter-node`
- **AWS Lambda** — via `@nodalite/adapter-lambda`
- **Cloudflare Workers** — via `@nodalite/adapter-edge`
- **Bun** and **Deno** — directly, no adapter needed

## What makes it different?

| Framework | Runtimes | Serverless-native | Built-in security | Background jobs | ML inference |
|---|---|---|---|---|---|
| Express 5 | Node only | Bolt-on | None | None | None |
| Fastify 5 | Node only | Bolt-on | Plugins | None | None |
| NestJS | Node only | Poor cold starts | Guards/interceptors | `@nestjs/schedule` | None |
| Hono | Node/Bun/Deno/Workers/Lambda | Yes | Middleware ecosystem | None | None |
| Elysia | Bun-first | Bun only | Plugins | None | None |
| **Nodalite** | Node/Bun/Deno/Workers/Lambda | Yes (first-class) | Built in | Yes | Yes |

### Genuinely unmet needs

1. **Background threads alongside your API** — `@nodalite/workers`'
   `runDetached()` runs a supervised `worker_thread` (bot, poller, watcher)
   in the same process, with automatic crash recovery. See
   [Background Threads](/guides/background-threads).

2. **Lightweight ML inference on serverless** — `@nodalite/ml`'s `Model`
   class disk-caches model bytes across cold starts, deduplicates concurrent
   load requests, and is engine-agnostic so it doesn't force a heavy native
   dependency on you. See [ML Inference](/guides/ml-inference).

Everything else — routing, middleware, validation, auth, rate limiting — is a
well-executed implementation of table-stakes features, built on the standard
Fetch API so the exact same code genuinely runs everywhere.

## Design principles

- **Fetch API foundation** — `Request`/`Response`/`Headers`/`ReadableStream`
  are the only primitives. No runtime-specific shapes.
- **Zero dependencies in core** — `@nodalite/core` relies on nothing but the
  JS runtime. This keeps bundles small and supply-chain risk minimal.
- **Independent versioning** — each package ships independently. Adapter fixes
  don't bump core. ML's heavy native deps stay optional.
- **Honest about limits** — `runDetached()` can't work on FaaS, and the docs
  say so explicitly. No marketing over truth.
