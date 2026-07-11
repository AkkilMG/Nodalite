import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  validateSize,
  resolveAndValidatePath,
  validateOnnxMagic,
} from "./validate.js";

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
  | { type: "file"; path: string; projectRoot?: string }
  | { type: "url"; url: string; headers?: Record<string, string> }
  | { type: "buffer"; bytes: Buffer };

export interface ModelOptions {
  /** Directory to cache downloaded model bytes in across invocations. Defaults to `os.tmpdir()/nodalite-models` — on Lambda that's `/tmp`, which persists across invocations on the *same* warm container. */
  cacheDir?: string;
  /** Maximum model size in bytes. Models exceeding this are rejected. Default: 50 MB. Set to 0 to disable. */
  maxBytes?: number;
  /** Allowed file extensions for `file` and `url` source types. Default: `['.onnx', '.bin', '.model']`. */
  allowedExtensions?: string[];
  /** Project root for path traversal protection. The resolved file path must stay within this directory. Default: `process.cwd()`. */
  projectRoot?: string;
}

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_ALLOWED_EXTENSIONS = [".onnx", ".bin", ".model", ".h5", ".pb"];

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
  private maxBytes: number;
  private allowedExtensions: string[];
  private projectRoot: string;

  constructor(
    private source: ModelSource,
    private engine: InferenceEngine<Input, Output>,
    opts: ModelOptions = {},
  ) {
    this.cacheDir = opts.cacheDir ?? path.join(os.tmpdir(), "nodalite-models");
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    this.allowedExtensions = opts.allowedExtensions ?? DEFAULT_ALLOWED_EXTENSIONS;
    this.projectRoot = opts.projectRoot ?? process.cwd();
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
    this.sessionPromise ??= this.loadBytes().then((bytes) =>
      this.engine.loadSession(bytes),
    );
    return this.sessionPromise;
  }

  private async loadBytes(): Promise<Buffer> {
    if (this.source.type === "buffer") {
      validateSize(this.source.bytes, this.maxBytes);
      return this.source.bytes;
    }

    if (this.source.type === "file") {
      const root = this.source.projectRoot ?? this.projectRoot;
      const resolved = resolveAndValidatePath(
        this.source.path,
        root,
        this.allowedExtensions,
      );

      if (!existsSync(resolved)) {
        throw new Error(`Model file not found: ${resolved}`);
      }

      const bytes = await readFile(resolved);
      validateSize(bytes, this.maxBytes);

      if (path.extname(resolved).toLowerCase() === ".onnx") {
        validateOnnxMagic(bytes);
      }

      return bytes;
    }

    const urlExt = path.extname(new URL(this.source.url).pathname).toLowerCase();
    const cachePath = path.join(this.cacheDir, `${sha256(this.source.url)}.bin`);

    if (existsSync(cachePath)) {
      const bytes = await readFile(cachePath);
      validateSize(bytes, this.maxBytes);
      if (urlExt === ".onnx") validateOnnxMagic(bytes);
      return bytes;
    }

    const res = await fetch(this.source.url, {
      headers: this.source.headers,
    });
    if (!res.ok)
      throw new Error(
        `Failed to download model from ${this.source.url}: HTTP ${res.status}`,
      );
    const bytes = Buffer.from(await res.arrayBuffer());

    if (this.allowedExtensions.length > 0 && !this.allowedExtensions.includes(urlExt)) {
      throw new Error(
        `URL extension "${urlExt}" is not in the allowed list: ${this.allowedExtensions.join(", ")}`,
      );
    }

    validateSize(bytes, this.maxBytes);
    if (urlExt === ".onnx") validateOnnxMagic(bytes);

    await mkdir(this.cacheDir, { recursive: true });
    await writeFile(cachePath, bytes);
    return bytes;
  }
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}
