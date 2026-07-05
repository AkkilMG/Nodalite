# lambda-deploy example

The same `App` shape as everywhere else, deployed as a real AWS Lambda
function via `@nodalite/adapter-lambda`.

- `src/app.ts` — the app itself. Anything expensive is created at module
  scope (outside any handler) so it only runs once per warm container.
- `src/handler.ts` — wraps it with `createLambdaHandler()`, including an
  `onColdStart` hook (a good place to warm an ML model — see
  `@nodalite/ml` — or open a DB connection pool).

Works behind API Gateway HTTP API (v2), API Gateway REST API (v1), or a
Lambda Function URL — the event shape is auto-detected per invocation.

## Build & package

```bash
npm install
npm run build -w examples-lambda-deploy        # esbuild bundle -> dist/index.mjs
npm run package -w examples-lambda-deploy      # + zip -> function.zip
```

Upload `function.zip` with handler `index.handler`, runtime `nodejs20.x`.
If you add `@nodalite/ml` with `onnxruntime-node` (a native dependency too
large for a zip upload in most cases), build a container image instead:

```dockerfile
FROM public.ecr.aws/lambda/nodejs:20
COPY dist/index.mjs ${LAMBDA_TASK_ROOT}/index.mjs
COPY node_modules/onnxruntime-node ${LAMBDA_TASK_ROOT}/node_modules/onnxruntime-node
CMD ["index.handler"]
```

## Test locally without deploying

```ts
import { handler } from './src/handler.js';
const result = await handler(mockApiGatewayV2Event, mockLambdaContext);
```

See `packages/adapter-lambda/src/handler.test.ts` for realistic mock event
shapes (v1 and v2) to copy from.
