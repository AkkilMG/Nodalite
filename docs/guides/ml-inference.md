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

## Engine-agnostic design

`Model` doesn't care *how* inference runs. The `InferenceEngine` interface is
just two methods:

```ts
interface InferenceEngine {
  load(modelBytes: Uint8Array): Promise<InferenceSession>;
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

const model = new Model({
  source: { url: 'https://models.example.com/model.onnx' },
  engine: onnxEngine(),
});
```

## Should inference run on the main thread?

- **Fast inference (a few ms):** main thread is fine.
- **Slow inference (tens of ms or more):** offload to `WorkerPool` from
  `@nodalite/workers` so it doesn't delay other concurrent requests.

See `examples/basic-api/src/app.ts` for a working example that does exactly
this.
