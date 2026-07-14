---
description: API reference for @nodalite/ml: cached, engine-agnostic ML inference runner with ONNX support, disk caching, and serverless cold start optimization.
---

# @nodalite/ml

Cached, engine-agnostic ML inference runner designed for serverless cold starts.

```
npm install @nodalite/ml
```

## Model

The core class. Loads, caches, and runs inference with any engine.

```ts
import { Model, onnxEngine } from '@nodalite/ml';

const model = new Model(
  { type: 'url', url: 'https://models.example.com/sentiment.onnx' },
  onnxEngine(),
);

// Warm up during cold start (Lambda onColdStart hook)
await model.warm();

// Run inference
const result = await model.predict({ text: 'I love this!' });
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `source` | `ModelSource` | — | Model source: `{ type: 'file', path }`, `{ type: 'url', url }`, or `{ type: 'buffer', bytes }` |
| `engine` | `InferenceEngine` | — | The engine that runs inference |
| `cacheDir` | `string` | `os.tmpdir()/nodalite-models` | Disk cache directory for URL-sourced models |
| `maxBytes` | `number` | `52428800` (50 MB) | Max model size in bytes. Set to `0` to disable |
| `allowedExtensions` | `string[]` | `['.onnx', '.bin', '.model']` | Allowed file extensions for file/URL sources |
| `projectRoot` | `string` | `process.cwd()` | Root directory for path traversal protection |

#### ModelSource

| Source | Shape | Description |
|---|---|---|
| `file` | `{ type: 'file', path: string, projectRoot?: string }` | Local file. `path` is relative to `projectRoot` |
| `url` | `{ type: 'url', url: string, headers?: Record<string, string> }` | Remote file. Cached to disk after first download |
| `buffer` | `{ type: 'buffer', bytes: Buffer }` | In-memory bytes. No I/O |

### Methods

| Method | Description |
|---|---|
| `warm()` | Pre-load the model (call during cold start) |
| `predict(input)` | Run inference. Returns engine-specific output |
| `release()` | Free the loaded session. Next `predict()` triggers a reload |

### How caching works

1. **Disk caching** — Model bytes downloaded from a URL are cached to
   `os.tmpdir()` (`/tmp` on Lambda), keyed by a hash of the source URL.
   Subsequent invocations on the same warm container read from disk instantly.
   `file` and `buffer` sources skip this layer (the data is already local).
2. **Session caching** — The constructed inference session is kept in memory
   on the `Model` instance. Warm invocations reuse the loaded session.
3. **Cold-start dedup** — If multiple requests hit a cold container
   concurrently before the model finishes loading, they all await the *same*
   in-flight promise instead of triggering parallel downloads.

## onnxEngine()

The built-in ONNX Runtime engine adapter.

```ts
import { onnxEngine } from '@nodalite/ml';

const engine = onnxEngine({
  executionProviders: ['cpu'],
});
```

Requires the optional peer dependency:

```bash
npm install onnxruntime-node
```

The ONNX runtime is a ~270MB native binary. It is imported lazily via dynamic
`import()`, so apps that don't use ML never load it.

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `executionProviders` | `string[]` | onnxruntime-node default | ONNX execution providers (e.g. `['cpu']`, `['cuda', 'cpu']`) |

## Error classes

All errors extend the base `ModelError` class with a `code` property for programmatic handling.

```ts
import { ModelSizeError, ModelPathError, ModelFormatError } from '@nodalite/ml';

try {
  await model.warm();
} catch (err) {
  if (err instanceof ModelSizeError) {
    console.error('Model too large:', err.code); // 'MODEL_TOO_LARGE'
  } else if (err instanceof ModelPathError) {
    console.error('Path traversal blocked:', err.code); // 'MODEL_PATH_TRAVERSAL'
  } else if (err instanceof ModelFormatError) {
    console.error('Invalid format:', err.code); // 'MODEL_INVALID_FORMAT'
  }
}
```

| Class | Code | When |
|---|---|---|
| `ModelError` | — | Base class for all model errors |
| `ModelSizeError` | `MODEL_TOO_LARGE` | Model bytes exceed `maxBytes` |
| `ModelPathError` | `MODEL_PATH_TRAVERSAL` | File path resolves outside `projectRoot` |
| `ModelFormatError` | `MODEL_INVALID_FORMAT` | Extension not allowed or ONNX magic bytes mismatch |

## Custom InferenceEngine

You don't have to use ONNX. Implement the two-method interface:

```ts
import type { InferenceEngine, InferenceSession } from '@nodalite/ml';

const myEngine: InferenceEngine = {
  async loadSession(modelBytes: Buffer): Promise<InferenceSession> {
    // Parse model bytes, return a session
    return {
      async run(input: Record<string, unknown>): Promise<unknown> {
        // Run inference with the loaded session
        return { score: 0.95 };
      },
    };
  },
};
```

This makes it easy to use pure-JS models, WASM-based runtimes, or call out to
external APIs — all through the same `Model` caching and lifecycle.
