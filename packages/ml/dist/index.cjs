"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  Model: () => Model,
  onnxEngine: () => onnxEngine
});
module.exports = __toCommonJS(index_exports);

// src/model.ts
var import_node_crypto = require("crypto");
var import_promises = require("fs/promises");
var import_node_fs = require("fs");
var path = __toESM(require("path"), 1);
var os = __toESM(require("os"), 1);
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
    if (this.source.type === "file") return (0, import_promises.readFile)(this.source.path);
    const cachePath = path.join(this.cacheDir, `${sha256(this.source.url)}.bin`);
    if ((0, import_node_fs.existsSync)(cachePath)) return (0, import_promises.readFile)(cachePath);
    const res = await fetch(this.source.url, { headers: this.source.headers });
    if (!res.ok) throw new Error(`Failed to download model from ${this.source.url}: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    await (0, import_promises.mkdir)(this.cacheDir, { recursive: true });
    await (0, import_promises.writeFile)(cachePath, bytes);
    return bytes;
  }
};
function sha256(input) {
  return (0, import_node_crypto.createHash)("sha256").update(input).digest("hex").slice(0, 16);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Model,
  onnxEngine
});
