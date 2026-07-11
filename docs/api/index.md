# API Reference

| Package | Exports | Runtime deps |
|---|---|---|
| [nodalite](/api/core) | Re-exports everything from `@nodalite/core`. Import as `import { App } from 'nodalite'`. | None |
| [@nodalite/core](/api/core) | `App`, `Context`, `Router`, `HttpError`, `compose`, `validate` | None |
| [@nodalite/middleware](/api/middleware) | `cors`, `securityHeaders`, `rateLimit`, `jwtAuth`, `logger`, `bodyLimit` | None |
| [@nodalite/adapter-node](/api/adapter-node) | `serve`, `toFetchRequest`, `sendResponse` | None (uses built-in `http`) |
| [@nodalite/adapter-lambda](/api/adapter-lambda) | `createLambdaHandler`, v1/v2 converters | None |
| [@nodalite/adapter-edge](/api/adapter-edge) | `createEdgeHandler` | None |
| [@nodalite/workers](/api/workers) | `runDetached`, `WorkerPool`, `defineWorkerTask` | None (uses built-in `worker_threads`) |
| [@nodalite/scheduler](/api/scheduler) | `Scheduler`, `toServerlessTask`, `parseCron` | None |
| [@nodalite/ml](/api/ml) | `Model`, `onnxEngine` | `onnxruntime-node` (optional peer) |
| [@nodalite/openapi](/api/openapi) | `openapi`, `OpenAPIApp`, `generateSpec`, `toOpenAPISchema`, `swaggerUIHTML`, `redocHTML` | None |

All packages are **ESM + CJS dual-package** and include **TypeScript declarations**.
