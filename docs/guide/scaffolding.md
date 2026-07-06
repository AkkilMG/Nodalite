# Scaffolding

Create a new Nodalite project in seconds with the interactive scaffolding CLI.

## Quick start

```bash
npm create nodalite
# or
npx nodalite create
# or
npx create-nodalite
```

Follow the prompts to configure your project — a ready-to-run project is generated
with all dependencies installed.

## Interactive prompts

### Purpose

Choose the type of project you want to build:

| Option | Runtime | Generated files |
|---|---|---|
| **API server** | Node.js / Bun / Deno | `src/app.ts`, `src/server.ts`, `tsconfig.json` |
| **Telegram bot** | Node.js | `src/main.ts`, `src/telegram-bot.ts`, `tsconfig.json` |
| **Lambda** | AWS Lambda | `src/app.ts`, `src/handler.ts`, `tsconfig.json` |
| **Edge** | Cloudflare Workers | `src/index.ts`, `wrangler.toml` config |

### Additional options

After selecting the purpose, the CLI asks feature-specific questions:

**ML model inference** (API only) — adds an ONNX-ready sentiment analysis
endpoint powered by `@nodalite/workers` `WorkerPool`. The generated worker file
(`src/sentiment-worker.ts`) runs CPU-bound inference on a dedicated thread so
it never blocks the request event loop.

**Security middleware** (API and Lambda) — adds `cors`, `securityHeaders`,
`rateLimit`, `jwtAuth`, `logger`, and `bodyLimit` middleware. Auth routes
(`/auth/signup`, `/auth/login`) and a JWT-protected `/api/*` group are
generated with working validation via Zod.

**Job scheduler** (API only) — adds a `@nodalite/scheduler` `Scheduler`
instance with a sample recurring task and graceful shutdown wiring.

### Project name

If not provided as a CLI argument, the CLI prompts for a project name and
creates a directory with that name in the current working directory.

## Generated project structure

The output mirrors the [examples](/examples/basic-api) in the repository,
customised to your choices. Here is what a full-featured API project
with all options enabled looks like:

```
my-api/
├── src/
│   ├── app.ts                # Routes, middleware, ML worker pool
│   ├── server.ts             # HTTP server + graceful shutdown
│   └── sentiment-worker.ts   # ML inference worker thread
├── package.json              # Dependencies pinned to compatible versions
└── tsconfig.json             # Strict TypeScript config
```

## Installing dependencies

After scaffolding, the CLI runs `npm install` automatically. If it fails
(offline, custom registry, etc.), run it manually:

```bash
cd my-project
npm install
```

## What's next?

- [Quick Start](/guide/quickstart) — learn the framework basics
- [Core Concepts](/guide/core-concepts) — how the request pipeline works
- [Examples](/examples/basic-api) — real-world usage patterns
