/**
 * The minimal contract any inference backend must implement. Deliberately
 * generic (not tied to ONNX) so a tiny hand-rolled JS model, TensorFlow.js,
 * or ONNX Runtime can all plug in the same way.
 */
interface InferenceEngine<Input = unknown, Output = unknown> {
    loadSession(modelBytes: Buffer): Promise<InferenceSession<Input, Output>>;
}
interface InferenceSession<Input = unknown, Output = unknown> {
    run(input: Input): Promise<Output>;
    /** Release native resources, if the engine holds any. */
    release?(): Promise<void>;
}
type ModelSource = {
    type: "file";
    path: string;
} | {
    type: "url";
    url: string;
    headers?: Record<string, string>;
} | {
    type: "buffer";
    bytes: Buffer;
};
interface ModelOptions {
    /** Directory to cache downloaded model bytes in across invocations. Defaults to `os.tmpdir()/nodalite-models` — on Lambda that's `/tmp`, which persists across invocations on the *same* warm container. */
    cacheDir?: string;
}
/**
 * Loads model bytes once and caches both the bytes (on disk, for `url`
 * sources — so a Lambda cold start doesn't re-download the model on every
 * new container) and the constructed session (in memory — so a *warm*
 * Lambda container doesn't reconstruct/re-parse the model on every request).
 *
 * Concurrent calls to `predict()` during a cold start share a single
 * in-flight load instead of triggering a duplicate download/parse race.
 */
declare class Model<Input = unknown, Output = unknown> {
    private source;
    private engine;
    private sessionPromise?;
    private cacheDir;
    constructor(source: ModelSource, engine: InferenceEngine<Input, Output>, opts?: ModelOptions);
    /** Run inference. Loads and caches the session on first call; subsequent calls on a warm instance reuse it. */
    predict(input: Input): Promise<Output>;
    /** Force the session to load now (e.g. from a Lambda cold-start hook) instead of lazily on first request. */
    warm(): Promise<void>;
    release(): Promise<void>;
    private getSession;
    private loadBytes;
}

type OnnxInput = Record<string, unknown>;
type OnnxOutput = Record<string, unknown>;
interface OnnxEngineOptions {
    /** e.g. ['cpu'] or ['cuda', 'cpu'] as a fallback chain. Defaults to onnxruntime-node's own default. */
    executionProviders?: string[];
}
/**
 * An `InferenceEngine` backed by `onnxruntime-node`. That package ships
 * large native binaries per-platform, so it's a *peer* dependency of
 * `@nodalite/ml`, not a direct one — install it yourself
 * (`npm i onnxruntime-node`) only in the deployment targets that actually
 * run inference, and only import this adapter from that code path so
 * targets that don't need ML (e.g. a Lambda that just proxies to one that
 * does) don't pay for the native binary at all.
 */
declare function onnxEngine(opts?: OnnxEngineOptions): InferenceEngine<OnnxInput, OnnxOutput>;

export { type InferenceEngine, type InferenceSession, Model, type ModelOptions, type ModelSource, type OnnxEngineOptions, type OnnxInput, type OnnxOutput, onnxEngine };
