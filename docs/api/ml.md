# @nodalite/ml

Cached, engine-agnostic ML inference runner designed for serverless cold starts.

```
npm install @nodalite/ml
```

## Model

The core class. Loads, caches, and runs inference with any engine.

```ts
import { Model } from '@nodalite/ml';

const model = new Model({
  source: {
    url: 'https://models.example.com/sentiment.onnx',
  },
  engine: onnxEngine(),
});

// Warm up during cold start (Lambda onColdStart hook)
await model.warm();

// Run inference
const result = await model.run({ text: 'I love this!' });
```

### Options

| Option | Type | Description |
|---|---|---|
| `source` | `ModelSource` | Model source (URL or local path) |
| `engine` | `InferenceEngine` | The engine that runs inference |
| `cacheKey` | `string` | Custom cache key (default: hash of URL) |

### Methods

| Method | Description |
|---|---|
| `warm()` | Pre-load the model (call during cold start) |
| `run(input)` | Run inference. Returns engine-specific output |

### How caching works

1. **Disk caching** — Model bytes downloaded from a URL are cached to
   `os.tmpdir()` (`/tmp` on Lambda), keyed by a hash of the source URL.
   Subsequent invocations on the same warm container read from disk instantly.
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
  executionProvider: 'cpu',  // or 'webgpu', 'wasm'
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
| `executionProvider` | `string` | `'cpu'` | ONNX execution provider |

## Custom InferenceEngine

You don't have to use ONNX. Implement the two-method interface:

```ts
import type { InferenceEngine, InferenceSession } from '@nodalite/ml';

const myEngine: InferenceEngine = {
  async load(modelBytes: Uint8Array): Promise<InferenceSession> {
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
