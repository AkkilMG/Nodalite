# Installation

## Requirements

- **Node.js** 18+ (for the Node adapter and local development)
- **npm** 9+ (for workspaces support)

Individual runtimes have their own requirements:
- **AWS Lambda** — Node.js 18+ runtime
- **Cloudflare Workers** — compatibility check via `wrangler`
- **Bun** 1.x or **Deno** 2.x — no adapter needed, `app.fetch` matches natively

## Using individual packages

Install only what you need:

```bash
# Core (always required)
npm install @nodalite/core

# Middleware (optional)
npm install @nodalite/middleware

# Adapters (choose your runtime)
npm install @nodalite/adapter-node
npm install @nodalite/adapter-lambda
npm install @nodalite/adapter-edge

# Background workers (Node-only)
npm install @nodalite/workers

# Scheduler (Node-only)
npm install @nodalite/scheduler

# ML inference (optional, needs onnxruntime-node or custom engine)
npm install @nodalite/ml
```

## Monorepo setup (for contributors)

Clone the repo and install everything:

```bash
git clone https://github.com/AkkilMG/nodalite.git
cd nodalite
npm install
```

Build every package:

```bash
npm run build --workspaces --if-present
```

Run all tests:

```bash
npm test
```

## Optional: ONNX native dependency

`@nodalite/ml`'s `onnxEngine()` requires the `onnxruntime-node` package
(~270MB native binary). It's a peer dependency — install it only if you need
it:

```bash
npm install onnxruntime-node
```

If you don't, `Model` still works with any custom `InferenceEngine`
implementation, or you can use the WASM backend instead. See
[ML Inference](/guides/ml-inference).
