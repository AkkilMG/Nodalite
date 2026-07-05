import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/**
 * The minimal contract any inference backend must implement. Deliberately
 * generic (not tied to ONNX) so a tiny hand-rolled JS model, TensorFlow.js,
 * or ONNX Runtime can all plug in the same way.
 */
export interface InferenceEngine<Input = unknown, Output = unknown> {
  loadSession(modelBytes: Buffer): Promise<InferenceSession<Input, Output>>;
}

export interface InferenceSession<Input = unknown, Output = unknown> {
  run(input: Input): Promise<Output>;
  /** Release native resources, if the engine holds any. */
  release?(): Promise<void>;
}

export type ModelSource =
  | { type: "file"; path: string }
  | { type: "url"; url: string; headers?: Record<string, string> }
  | { type: "buffer"; bytes: Buffer };

export interface ModelOptions {
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
export class Model<Input = unknown, Output = unknown> {
  private sessionPromise?: Promise<InferenceSession<Input, Output>>;
  private cacheDir: string;

  constructor(private source: ModelSource, private engine: InferenceEngine<Input, Output>, opts: ModelOptions = {}) {
    this.cacheDir = opts.cacheDir ?? path.join(os.tmpdir(), "nodalite-models");
  }

  /** Run inference. Loads and caches the session on first call; subsequent calls on a warm instance reuse it. */
  async predict(input: Input): Promise<Output> {
    const session = await this.getSession();
    return session.run(input);
  }

  /** Force the session to load now (e.g. from a Lambda cold-start hook) instead of lazily on first request. */
  warm(): Promise<void> {
    return this.getSession().then(() => undefined);
  }

  async release(): Promise<void> {
    if (!this.sessionPromise) return;
    const session = await this.sessionPromise;
    await session.release?.();
    this.sessionPromise = undefined;
  }

  private getSession(): Promise<InferenceSession<Input, Output>> {
    this.sessionPromise ??= this.loadBytes().then((bytes) => this.engine.loadSession(bytes));
    return this.sessionPromise;
  }

  private async loadBytes(): Promise<Buffer> {
    if (this.source.type === "buffer") return this.source.bytes;
    if (this.source.type === "file") return readFile(this.source.path);

    const cachePath = path.join(this.cacheDir, `${sha256(this.source.url)}.bin`);
    if (existsSync(cachePath)) return readFile(cachePath);

    const res = await fetch(this.source.url, { headers: this.source.headers });
    if (!res.ok) throw new Error(`Failed to download model from ${this.source.url}: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());

    await mkdir(this.cacheDir, { recursive: true });
    await writeFile(cachePath, bytes);
    return bytes;
  }
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}
