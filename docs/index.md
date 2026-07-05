---
layout: home

title: Nodalite
titleTemplate: Runtime-agnostic TypeScript API framework

hero:
  name: Nodalite
  text: One API, every runtime
  tagline: A small, runtime-agnostic TypeScript API framework. The same `App` instance runs unmodified on Node, Bun, Deno, Cloudflare Workers, and AWS Lambda.

  code:
    title: hello.ts
    content: |
      import { App } from '@nodalite/core'
      import { cors, securityHeaders } from '@nodalite/middleware'
      import { serve } from '@nodalite/adapter-node'

      const app = new App()
      app.use('*', securityHeaders())
      app.use('*', cors({ origin: 'https://your-frontend.example' }))

      app.get('/health', (c) => c.json({ ok: true }))
      app.get('/users/:id', (c) => c.json({ id: c.req.param('id') }))

      serve(app, { port: 3000 })

  actions:
    - theme: brand
      text: Quick Start
      link: /guide/quickstart
    - theme: alt
      text: View on GitHub
      link: https://github.com/AkkilMG/nodalite

features:
  - icon: 🔀
    title: Runtime-Agnostic
    details: "Built on the standard Fetch API (Request/Response). Same code runs on Node, Bun, Deno, Lambda, and Cloudflare Workers — no adapter rewrites needed."
  - icon: 🛡️
    title: Security Built In
    details: "CORS, security headers, rate limiting, JWT auth, request validation, and body size limits ship as first-party middleware."
  - icon: ⚡
    title: Zero Dependencies Core
    details: "@nodalite/core has no runtime dependencies — only what the JS runtime already provides. Tree-shakeable, minimal bundle footprint."
  - icon: 🧵
    title: Background Threads
    details: "runDetached() spawns supervised worker_threads for bots, pollers, or any long-lived background work alongside your API."
  - icon: 🤖
    title: ML Inference
    details: "Cached, engine-agnostic model runner built for serverless cold starts. Works with ONNX or any custom inference engine."
  - icon: 📦
    title: Monorepo Design
    details: "Independently versioned packages. Adapters don't bloat core. Install only what you need — no framework kitchen sink."
---

## How the documentation is organized

<div class="grid grid-cols-3 gap-4" style="margin-top: 1.5rem;">

<div style="border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: 1rem;">

### First Steps

- [Quick Start](/guide/quickstart) — get running in 2 minutes
- [Installation](/guide/installation) — set up the monorepo
- [Core Concepts](/guide/core-concepts) — how the pipeline works

</div>

<div style="border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: 1rem;">

### API Reference

- [@nodalite/core](/api/core) — App, Context, Router
- [@nodalite/middleware](/api/middleware) — security, validation
- [Adapters](/api/) — Node, Lambda, Edge
- [Workers & Scheduler](/api/workers) — background tasks

</div>

<div style="border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: 1rem;">

### Guides

- [Deployment](/guides/deployment) — every target
- [Security Checklist](/guides/security) — OWASP-recommended
- [Background Threads](/guides/background-threads) — honest limits
- [ML Inference](/guides/ml-inference) — serverless-friendly

</div>

</div>
