# @nodalite/adapter-lambda

Run a Nodalite app on AWS Lambda behind API Gateway v1/v2 or Lambda Function URLs.

```
npm install @nodalite/adapter-lambda
```

## createLambdaHandler()

```ts
import { createLambdaHandler } from '@nodalite/adapter-lambda';
import { app } from './app.js';

export const handler = createLambdaHandler(app);
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `onColdStart` | `() => Promise<void>` | — | Called once per cold start (warm models, connect DB) |

### Returns

A `LambdaHandler` compatible with API Gateway v1, v2, and Lambda Function URLs
(auto-detected from the event shape).

```ts
export const handler = createLambdaHandler(app, {
  onColdStart: async () => {
    await model.warm(); // pre-load ML model
  },
});
```

## Low-level converters

For custom Lambda integrations:

```ts
import { v1EventToRequest, responseToV1Result } from '@nodalite/adapter-lambda';
import { v2EventToRequest, responseToV2Result } from '@nodalite/adapter-lambda';

// API Gateway v1
const request = v1EventToRequest(apiGatewayV1Event);
const response = await app.fetch(request);
const result = responseToV1Result(response);

// API Gateway v2
const request = v2EventToRequest(apiGatewayV2Event);
const response = await app.fetch(request);
const result = responseToV2Result(response);
```

## Bundle for Lambda

Use esbuild to create a single deployment file:

```bash
npx esbuild app.ts --bundle --platform=node --target=node18 --outfile=dist/handler.mjs
zip -j dist/handler.zip dist/handler.mjs
```

See [examples/lambda-deploy](/examples/lambda-deploy) for a complete setup.
