"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  WorkerPool: () => WorkerPool,
  defineWorkerTask: () => defineWorkerTask,
  runDetached: () => runDetached
});
module.exports = __toCommonJS(index_exports);

// src/detached.ts
var import_node_worker_threads = require("worker_threads");
function runDetached(entryFile, opts = {}) {
  const autoRestart = opts.autoRestart ?? true;
  const baseDelay = opts.restartDelayMs ?? 1e3;
  const maxDelay = opts.maxRestartDelayMs ?? 3e4;
  let stopped = false;
  let consecutiveCrashes = 0;
  let worker = spawn();
  function spawn() {
    const w = new import_node_worker_threads.Worker(entryFile, { workerData: opts.workerData });
    w.on("error", (err) => {
      opts.onError?.(err);
    });
    w.on("exit", (code) => {
      opts.onExit?.(code);
      if (stopped || !autoRestart) return;
      consecutiveCrashes += 1;
      const delay = Math.min(baseDelay * 2 ** (consecutiveCrashes - 1), maxDelay);
      setTimeout(() => {
        if (!stopped) worker = spawn();
      }, delay);
    });
    w.on("online", () => {
      consecutiveCrashes = 0;
    });
    return w;
  }
  return {
    get worker() {
      return worker;
    },
    send: (message) => worker.postMessage(message),
    stop: async () => {
      stopped = true;
      await worker.terminate();
    }
  };
}

// src/pool.ts
var import_node_worker_threads2 = require("worker_threads");
var import_node_os = require("os");
var WorkerPool = class {
  constructor(entryFile, opts = {}) {
    this.entryFile = entryFile;
    this.opts = opts;
    const size = Math.max(1, opts.size ?? (0, import_node_os.availableParallelism)() - 1);
    for (let i = 0; i < size; i++) this.spawnWorker();
  }
  entryFile;
  opts;
  workers = [];
  idle = [];
  queue = [];
  pendingByWorker = /* @__PURE__ */ new WeakMap();
  nextId = 0;
  closed = false;
  spawnWorker() {
    const worker = new import_node_worker_threads2.Worker(this.entryFile, { workerData: this.opts.workerData });
    this.pendingByWorker.set(worker, /* @__PURE__ */ new Map());
    worker.on("message", (msg) => {
      const pending = this.pendingByWorker.get(worker)?.get(msg.id);
      if (!pending) return;
      this.pendingByWorker.get(worker).delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error));
      else pending.resolve(msg.result);
      this.idle.push(worker);
      this.drainQueue();
    });
    worker.on("error", (err) => {
      for (const pending of this.pendingByWorker.get(worker)?.values() ?? []) pending.reject(err);
      this.pendingByWorker.delete(worker);
      this.workers = this.workers.filter((w) => w !== worker);
      this.idle = this.idle.filter((w) => w !== worker);
      if (!this.closed) this.spawnWorker();
    });
    this.workers.push(worker);
    this.idle.push(worker);
  }
  run(payload) {
    if (this.closed) return Promise.reject(new Error("WorkerPool is terminated"));
    return new Promise((resolve, reject) => {
      const pending = { resolve, reject };
      this.queue.push({ payload, pending });
      this.drainQueue();
    });
  }
  drainQueue() {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.shift();
      const task = this.queue.shift();
      const id = this.nextId++;
      this.pendingByWorker.get(worker).set(id, task.pending);
      let timeoutHandle;
      if (this.opts.taskTimeoutMs) {
        timeoutHandle = setTimeout(() => {
          this.pendingByWorker.get(worker)?.delete(id);
          task.pending.reject(new Error(`WorkerPool task timed out after ${this.opts.taskTimeoutMs}ms`));
        }, this.opts.taskTimeoutMs);
      }
      const message = { id, payload: task.payload };
      worker.postMessage(message);
      if (timeoutHandle) timeoutHandle.unref?.();
    }
  }
  async terminate() {
    this.closed = true;
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
  get size() {
    return this.workers.length;
  }
};
function defineWorkerTask(handler) {
  if (!import_node_worker_threads2.parentPort) throw new Error("defineWorkerTask() must be called from inside a worker_thread");
  const parentPort = import_node_worker_threads2.parentPort;
  parentPort.on("message", async (msg) => {
    try {
      const result = await handler(msg.payload);
      parentPort.postMessage({ id: msg.id, result });
    } catch (err) {
      parentPort.postMessage({ id: msg.id, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WorkerPool,
  defineWorkerTask,
  runDetached
});
