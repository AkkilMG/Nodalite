# Nodalite — Architecture & Field Guide

> This document has been superseded by the **[Nodalite documentation site](
> https://github.com/AkkilMG/nodalite)** — a full multi-page reference
> with guides, API docs, examples, and FAQ.

## Quick links

| Topic | Location |
|---|---|
| Introduction & architecture | [`docs/guide/`](./guide/) |
| Quick Start | [`docs/guide/quickstart.md`](./guide/quickstart.md) |
| Core Concepts (pipeline, Fetch API) | [`docs/guide/core-concepts.md`](./guide/core-concepts.md) |
| API Reference | [`docs/api/`](./api/) |
| Deployment guide | [`docs/guides/deployment.md`](./guides/deployment.md) |
| Security checklist | [`docs/guides/security.md`](./guides/security.md) |
| Background threads | [`docs/guides/background-threads.md`](./guides/background-threads.md) |
| ML inference | [`docs/guides/ml-inference.md`](./guides/ml-inference.md) |
| Testing strategy | [`docs/guides/testing.md`](./guides/testing.md) |
| Publishing & versioning | [`docs/guides/publishing.md`](./guides/publishing.md) |
| Naming & rebranding | [`docs/guides/rebranding.md`](./guides/rebranding.md) |
| FAQ | [`docs/faq.md`](./faq.md) |

---

## Development

```bash
npm install
npm run docs:dev      # Start VitePress dev server
npm test              # Run all tests
npm run build --workspaces --if-present  # Build all packages
```
