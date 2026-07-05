# Deployment

Nodalite runs everywhere. Here's the quick-reference for each target.

## Node / Container / VM

```ts
import { serve } from '@nodalite/adapter-node';
import { app } from './app.js';

serve(app, { port: 3000 });
```

Deploy however you'd deploy any Node app:
- Docker image on ECS, Cloud Run, or Fly.io
- Directly on a VM behind a reverse proxy (nginx, Caddy) terminating TLS
- `runDetached()` and `Scheduler` both work fully here

## AWS Lambda

```ts
import { createLambdaHandler } from '@nodalite/adapter-lambda';
import { app } from './app.js';

export const handler = createLambdaHandler(app, {
  onColdStart: async () => {
    // Warm anything heavy (DB connections, ML models)
  },
});
```

### Bundle with esbuild

```bash
npx esbuild app.ts --bundle --platform=node --target=node18 \
  --outfile=dist/handler.mjs --format=esm
zip -j dist/handler.zip dist/handler.mjs
```

### API Gateway

- **HTTP API** is cheaper and has faster cold starts than REST API
- Lambda Function URLs work well if you don't need API Gateway extras
- Supports v1 and v2 event formats (auto-detected)

### Container image

If you bundle `onnxruntime-node`, you may exceed the 250MB unzipped package
limit. Use a container image instead.

## Cloudflare Workers

```ts
import { createEdgeHandler } from '@nodalite/adapter-edge';
import { app } from './app.js';

export default createEdgeHandler(app);
```

Environment bindings (KV, D1, R2, secrets) are forwarded to
`c.platform.env`. See [adapter-edge docs](/api/adapter-edge).

## Bun

No adapter needed:

```ts
Bun.serve({ fetch: (req) => app.fetch(req) });
```

## Deno

No adapter needed:

```ts
Deno.serve((req) => app.fetch(req));
```
