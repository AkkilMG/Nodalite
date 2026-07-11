# @nodalite/ml

Engine-aware ML model runner optimized for serverless and long-running servers. Handles model loading, byte caching, session management, and size validation — so you focus on inference, not plumbing.

## Features

- **Engine-agnostic** — bring any inference backend (ONNX Runtime, TensorFlow.js, PyTorch via ONNX, or a hand-rolled JS model). Ships an optional ONNX adapter; everything else is pluggable.
- **Three model sources** — load from a local file path, a remote URL, or an in-memory `Buffer`.
- **Serverless-optimized** — caches downloaded model bytes to disk across cold starts (`/tmp` on Lambda), reuses the loaded session across warm invocations, and de-duplicates concurrent cold-start loads.
- **Security built-in** — path traversal protection, file extension allowlist, configurable size cap, and ONNX magic-byte validation.
- **Zero runtime overhead** — lazy session load on first `predict()`, singleton caching, optional `warm()` for pre-loading.

## Install

```bash
npm install @nodalite/ml
```

If you need ONNX inference, also install the peer dependency:

```bash
npm install onnxruntime-node
```

`onnxruntime-node` ships large native binaries per platform. It is an **optional peer dependency** — only install it in deployment targets that actually run inference.

## Quick Start

```ts
import { Model, onnxEngine } from "@nodalite/ml";

const model = new Model(
  { type: "file", path: "./model.onnx", projectRoot: process.cwd() },
  onnxEngine(),
  { maxBytes: 50 * 1024 * 1024 } // 50 MB
);

// Optional: pre-load the session (e.g. in a Lambda cold-start hook)
await model.warm();

// Run inference
const result = await model.predict({
  input: new Float32Array(/* ... */),
});

// Clean up when done (optional — the session is GC'd on process exit)
await model.release();
```

## API Reference

### `Model<Input, Output>`

The core class. Loads model bytes once, constructs an inference session, and caches both.

#### Constructor

```ts
new Model(source: ModelSource, engine: InferenceEngine, opts?: ModelOptions)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `ModelSource` | Where to load the model from (file, URL, or buffer) |
| `engine` | `InferenceEngine` | The inference backend that parses bytes into a session |
| `opts` | `ModelOptions` | Optional configuration |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `predict(input)` | `Promise<Output>` | Run inference. Loads the session on first call; subsequent calls reuse it. |
| `warm()` | `Promise<void>` | Force the session to load now instead of lazily on first `predict()`. |
| `release()` | `Promise<void>` | Release native resources held by the session. The next `predict()` reloads. |

### `ModelSource`

```ts
type ModelSource =
  | { type: "file"; path: string; projectRoot?: string }
  | { type: "url"; url: string; headers?: Record<string, string> }
  | { type: "buffer"; bytes: Buffer };
```

| Source | Behavior |
|--------|----------|
| `file` | Resolves `path` relative to `projectRoot` (default: `process.cwd()`). Validates path stays within root, checks extension against allowlist, validates ONNX magic for `.onnx` files. |
| `url` | Downloads the model via `fetch()`. Caches to disk (`cacheDir`) so subsequent cold starts don't re-download. Supports custom headers (e.g. auth tokens). |
| `buffer` | Uses the provided `Buffer` directly. No disk I/O. |

### `ModelOptions`

```ts
interface ModelOptions {
  cacheDir?: string;        // Default: os.tmpdir()/nodalite-models
  maxBytes?: number;        // Default: 50 MB. Set to 0 to disable.
  allowedExtensions?: string[]; // Default: ['.onnx', '.bin', '.model', '.h5', '.pb']
  projectRoot?: string;     // Default: process.cwd()
}
```

### `InferenceEngine<Input, Output>`

The interface any inference backend must implement:

```ts
interface InferenceEngine<Input, Output> {
  loadSession(modelBytes: Buffer): Promise<InferenceSession<Input, Output>>;
}

interface InferenceSession<Input, Output> {
  run(input: Input): Promise<Output>;
  release?(): Promise<void>;
}
```

### `onnxEngine(opts?)`

Ships with `@nodalite/ml`. Wraps `onnxruntime-node`:

```ts
import { onnxEngine } from "@nodalite/ml";

const engine = onnxEngine({
  executionProviders: ["cpu"], // or ["cuda", "cpu"] as fallback chain
});
```

### Error Classes

| Class | Code | When |
|-------|------|------|
| `ModelError` | (base) | Base class for all model errors |
| `ModelSizeError` | `MODEL_TOO_LARGE` | Model exceeds `maxBytes` |
| `ModelPathError` | `MODEL_PATH_TRAVERSAL` | File path resolves outside `projectRoot` |
| `ModelFormatError` | `MODEL_INVALID_FORMAT` | Extension not in allowlist, or ONNX magic bytes invalid |

## Usage with WorkerPool

For CPU-bound inference, offload to worker threads so the main event loop stays responsive:

```ts
// inference-worker.ts
import { Model, onnxEngine } from "@nodalite/ml";
import { defineWorkerTask } from "@nodalite/workers";

const model = new Model(
  { type: "file", path: "./model.onnx" },
  onnxEngine()
);
await model.warm();

defineWorkerTask(async (input: { data: number[] }) => {
  return model.predict({ input: new Float32Array(input.data) });
});
```

```ts
// app.ts
import { WorkerPool } from "@nodalite/workers";
import { App } from "@nodalite/core";

const pool = new WorkerPool(
  new URL("./inference-worker.js", import.meta.url),
  { size: 2, taskTimeoutMs: 10_000 }
);

const app = new App();
app.post("/predict", async (c) => {
  const body = await c.req.json<{ data: number[] }>();
  const result = await pool.run(body);
  return c.json(result);
});
```

## Lambda / Serverless Integration

```ts
// handler.ts
import { createLambdaHandler } from "@nodalite/adapter-lambda";
import { Model, onnxEngine } from "@nodalite/ml";
import { app } from "./app.js";

const model = new Model(
  { type: "url", url: "https://example.com/model.onnx" },
  onnxEngine()
);

export const handler = createLambdaHandler(app, {
  onColdStart: async () => {
    // Load the model once per container, not once per request
    await model.warm();
  },
});
```

### Serverless Size & Performance Guidelines

| Constraint | Limit | Notes |
|------------|-------|-------|
| Lambda memory | 128 MB — 10 GB | Model bytes + runtime overhead must fit. Allocate at least 2x the model file size. |
| Lambda `/tmp` | 10 GB | URL-cached models + any temp files. The 38 MB model below uses ~38 MB of `/tmp`. |
| Lambda cold start timeout | 10 s (default) | A 50 MB ONNX model typically loads in 1–3 s. Larger models may require provisioned concurrency or `warm()`. |
| Lambda invocation timeout | 15 min | Inference time + model load must fit within this. |
| Lambda payload size | 6 MB (sync) / 256 KB (async) | Base64-encoded images in request body must fit. Consider S3 for large inputs. |

### Model Size vs. Environment

| Model Size | Recommended Environment | Notes |
|------------|------------------------|-------|
| < 10 MB | Lambda (128–512 MB) | Fast cold starts, low memory. Ideal for small classifiers, embeddings. |
| 10–50 MB | Lambda (512 MB–1 GB) | Acceptable cold starts with `warm()`. Most ONNX models fit here. |
| 50–200 MB | Lambda (1–2 GB) or long-running server | Cold starts may hit 5–10 s. Consider provisioned concurrency. |
| 200 MB — 1 GB | Long-running server preferred | Lambda is possible with high memory + provisioned concurrency, but a dedicated server is more reliable. |
| > 1 GB | Long-running server required | Exceeds practical Lambda limits. Use a GPU-enabled server for large models (LLMs, diffusion models). |

## Supported Model Formats

The package loads model files as **raw bytes** and hands them to your chosen engine. The following formats are recognized by default:

| Format | Extension | Magic Byte Validation | Notes |
|--------|-----------|-----------------------|-------|
| ONNX | `.onnx` | Yes (0x08 0x07) | Fully supported. Validated on load. |
| TensorFlow SavedModel | `.pb` | No | Supported if your engine handles protobuf. |
| Keras HDF5 | `.h5` | No | Supported if your engine handles HDF5. |
| PyTorch | `.pt` / `.bin` | No | Use after converting to ONNX via `torch.onnx.export()`. |
| Generic binary | `.bin` / `.model` | No | Any format your engine can parse. |

**Important:** The package does not validate whether a model is compatible with your chosen engine. If a model is corrupt, truncated, or incompatible with the engine, the engine will throw at load time or during inference. **In some cases, this may crash the server process.** Always test models thoroughly before deploying.

### Custom Extensions

Allow additional file extensions via `allowedExtensions`:

```ts
const model = new Model(
  { type: "file", path: "./model.tflite" },
  customEngine(),
  { allowedExtensions: [".onnx", ".tflite", ".pt"] }
);
```

Set `allowedExtensions` to `[]` to disable extension validation entirely (not recommended for file/URL sources).

## Security Considerations

- **Path traversal protection**: File sources are resolved against `projectRoot` and must stay within it. `../../etc/passwd` is rejected.
- **Extension allowlist**: Only approved file extensions are loaded. Prevents accidentally loading arbitrary files.
- **Size cap**: Models exceeding `maxBytes` (default 50 MB) are rejected before loading into memory.
- **ONNX validation**: `.onnx` files are checked for correct magic bytes (protobuf header 0x08 0x07).
- **URL downloads**: Extension is validated after download. Size is validated before caching to disk.

## License

MIT
