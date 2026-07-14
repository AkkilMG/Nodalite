---
description: Guide to ML inference with @nodalite/ml: serverless-aware model caching, ONNX runtime, disk caching across cold starts, and security.
---

# ML Inference

`@nodalite/ml`'s `Model` class is designed for the three things that make ML
inference painful on serverless: **cold start latency**, **/tmp and memory
limits**, and **duplicating work across warm invocations**.

## How Model works

### 1. Disk caching

Model bytes downloaded from a URL are cached to `os.tmpdir()` (which is `/tmp`
on Lambda), keyed by a hash of the source URL. A `url`-sourced model is
downloaded once per *container*, not once per *request* — subsequent
invocations on the same warm container read from `/tmp` instantly.

### 2. Session caching

The constructed inference session is kept in memory on the `Model` instance.
A warm container reuses the same loaded session across requests instead of
re-parsing the model file every time.

### 3. Cold-start dedup

If multiple requests hit a freshly cold container before the model finishes
loading, they all await the *same* in-flight promise instead of triggering
parallel downloads or parses.

### 4. Proactive warming

`warm()` lets you pay the load cost once, proactively, from
`createLambdaHandler`'s `onColdStart` hook:

```ts
const handler = createLambdaHandler(app, {
  onColdStart: async () => {
    await model.warm();
  },
});
```

## Local file models

Place a model file (`.onnx`, `.bin`, or `.model`) in your project and point
the `Model` at it:

```ts
import { Model, onnxEngine } from '@nodalite/ml';

const model = new Model(
  { type: 'file', path: './models/sentiment.onnx' },
  onnxEngine(),
);

await model.warm();
const result = await model.predict({ text: 'I love this!' });
```

### Security built in

When using `file` or `url` sources, the `Model` class enforces three
safety checks by default:

1. **Path traversal protection** — The resolved file path must stay inside
   `projectRoot` (defaults to `process.cwd()`). Attempts like
   `path: '../../etc/passwd'` are rejected with a `ModelPathError`.

2. **File size limit** — Models are capped at **50 MB** by default to
   protect serverless deployments. Override via `maxBytes` or disable with
   `maxBytes: 0`.

3. **Extension + magic-byte validation** — Only `.onnx`, `.bin`, and
   `.model` files are accepted by default. `.onnx` files are additionally
   verified against the ONNX magic bytes (`0x08 0x07`) to catch
   mislabelled files early.

```ts
const model = new Model(
  { type: 'file', path: './models/sentiment.onnx' },
  onnxEngine(),
  {
    projectRoot: '/path/to/project',   // default: process.cwd()
    maxBytes: 100 * 1024 * 1024,       // 100 MB
    allowedExtensions: ['.onnx', '.bin', '.model'],
  },
);
```

### Error types

| Error | Code | When |
|---|---|---|
| `ModelSizeError` | `MODEL_TOO_LARGE` | Model bytes exceed `maxBytes` |
| `ModelPathError` | `MODEL_PATH_TRAVERSAL` | File path resolves outside `projectRoot` |
| `ModelFormatError` | `MODEL_INVALID_FORMAT` | Extension not allowed, or ONNX magic bytes mismatch |

## Engine-agnostic design

`Model` doesn't care *how* inference runs. The `InferenceEngine` interface is
just two methods:

```ts
interface InferenceEngine {
  loadSession(modelBytes: Buffer): Promise<InferenceSession>;
}

interface InferenceSession {
  run(input: Record<string, unknown>): Promise<unknown>;
}
```

This means you can use:

- **ONNX Runtime** via the built-in `onnxEngine()` adapter
- **Pure-JS models** — no native bindings at all
- **WASM-based runtimes** like `onnxruntime-web`
- **External APIs** — just wrap the HTTP call in the interface

## ONNX Runtime

The shipped `onnxEngine()` wraps `onnxruntime-node`, imported lazily via
dynamic `import()` so apps that don't need it never load the ~270MB native
dependency.

```ts
import { Model, onnxEngine } from '@nodalite/ml';

const model = new Model(
  { type: 'url', url: 'https://models.example.com/model.onnx' },
  onnxEngine(),
);
```

## Should inference run on the main thread?

- **Fast inference (a few ms):** main thread is fine.
- **Slow inference (tens of ms or more):** offload to `WorkerPool` from
  `@nodalite/workers` so it doesn't delay other concurrent requests.

See `examples/basic-api/src/app.ts` for a working example that does exactly
this.
