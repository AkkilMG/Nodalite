---
description: Scaffold a new Nodalite project with npm create nodalite. Interactive CLI generates API servers, Lambda functions, Edge workers, or Telegram bots.
---

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

### Structure

Choose how your source code is organized:

| Option | Description |
|---|---|
| **Flat** (default) | All routes in a single `src/app.ts` file |
| **Modular** | Routes split into `src/routes/` with [auto-discovery](/api/core#discover) |

The modular structure automatically discovers route files from the `routes/`
directory using `discover()`. Subdirectories become route groups, and
`_prefix.ts` files define prefixes for their directory.

### Project name

If not provided as a CLI argument, the CLI prompts for a project name and
creates a directory with that name in the current working directory.

## Generated project structure

The output mirrors the [examples](/examples/basic-api) in the repository,
customised to your choices. Here is what a full-featured API project
with all options enabled looks like:

### Flat structure (default)

```
my-api/
├── src/
│   ├── app.ts                # Routes, middleware, ML worker pool
│   ├── server.ts             # HTTP server + graceful shutdown
│   └── sentiment-worker.ts   # ML inference worker thread
├── package.json              # Dependencies pinned to compatible versions
└── tsconfig.json             # Strict TypeScript config
```

### Modular structure

```
my-api/
├── src/
│   ├── app.ts                # Entry point with middleware + discover()
│   ├── server.ts             # HTTP server + graceful shutdown
│   └── routes/
│       ├── _prefix.ts        # Optional: defines "/api" prefix
│       ├── health.ts         # GET /health
│       ├── users.ts          # GET/POST /users
│       └── posts/
│           ├── _prefix.ts    # defines "/posts" prefix
│           ├── index.ts      # GET /posts
│           └── comments.ts   # GET /posts/comments
├── package.json
└── tsconfig.json
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
