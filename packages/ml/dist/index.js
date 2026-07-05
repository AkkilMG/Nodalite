// src/model.ts
import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import * as path from "path";
import * as os from "os";
var Model = class {
  constructor(source, engine, opts = {}) {
    this.source = source;
    this.engine = engine;
    this.cacheDir = opts.cacheDir ?? path.join(os.tmpdir(), "nodalite-models");
  }
  source;
  engine;
  sessionPromise;
  cacheDir;
  /** Run inference. Loads and caches the session on first call; subsequent calls on a warm instance reuse it. */
  async predict(input) {
    const session = await this.getSession();
    return session.run(input);
  }
  /** Force the session to load now (e.g. from a Lambda cold-start hook) instead of lazily on first request. */
  warm() {
    return this.getSession().then(() => void 0);
  }
  async release() {
    if (!this.sessionPromise) return;
    const session = await this.sessionPromise;
    await session.release?.();
    this.sessionPromise = void 0;
  }
  getSession() {
    this.sessionPromise ??= this.loadBytes().then((bytes) => this.engine.loadSession(bytes));
    return this.sessionPromise;
  }
  async loadBytes() {
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
};
function sha256(input) {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

// src/onnx-engine.ts
function onnxEngine(opts = {}) {
  return {
    async loadSession(modelBytes) {
      const ort = await import("onnxruntime-node");
      const session = await ort.InferenceSession.create(modelBytes, {
        executionProviders: opts.executionProviders
      });
      return {
        async run(input) {
          return session.run(input);
        },
        async release() {
          await session.release();
        }
      };
    }
  };
}
export {
  Model,
  onnxEngine
};
