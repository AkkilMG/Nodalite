# Lambda Deployment Example

The same `App` shape from `basic-api`, deployed as a real AWS Lambda function
with a working esbuild bundle + zip build script.

## Build

```bash
npm run build -w examples-lambda-deploy
```

This produces `dist/handler.mjs` and zips it to `dist/handler.zip`.

## The build script

```json
{
  "scripts": {
    "build": "esbuild src/handler.ts --bundle --platform=node --target=node18 --outfile=dist/handler.mjs --format=esm && zip -j dist/handler.zip dist/handler.mjs"
  }
}
```

## Key differences from basic-api

### Handler entrypoint

```ts
import { createLambdaHandler } from '@nodalite/adapter-lambda';
import { app } from './app.js';

export const handler = createLambdaHandler(app, {
  onColdStart: async () => {
    // Warm connections, load models
  },
});
```

### Environment variables

Use Lambda environment variables or Secrets Manager — never bundle secrets.

## Deploy

Upload `dist/handler.zip` to Lambda, set the handler to `handler.handler`,
and configure an API Gateway HTTP API trigger.
