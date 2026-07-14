---
layout: home

title: Nodalite
titleTemplate: Runtime-agnostic TypeScript API framework
description: Build APIs that run on Node.js, Bun, Deno, Cloudflare Workers, and AWS Lambda — same code, zero dependencies, built-in security.

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
    - theme: alt
      text: View on npm
      link: https://www.npmjs.com/package/nodalite

---

<HomeFeatures />

## How the documentation is organized

<div class="grid grid-cols-3 gap-4" style="margin-top: 1.5rem;">

<div style="border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: 1rem;">

### First Steps

- [Quick Start](/guide/quickstart) — get running in 2 minutes
- [Scaffolding](/guide/scaffolding) — generate a project with `npm create nodalite`
- [Installation](/guide/installation) — set up the monorepo
- [Core Concepts](/guide/core-concepts) — how the pipeline works

</div>

<div style="border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: 1rem;">

### API Reference

- [@nodalite/core](/api/core) — App, Context, Router
- [@nodalite/middleware](/api/middleware) — security, sessions, CORS
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
