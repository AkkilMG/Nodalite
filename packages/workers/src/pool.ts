import { Worker, parentPort as workerThreadsParentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";

interface TaskMessage {
  id: number;
  payload: unknown;
}
interface ResultMessage {
  id: number;
  result?: unknown;
  error?: string;
}

interface PendingTask {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

export interface WorkerPoolOptions {
  /** Number of worker threads. Defaults to `availableParallelism() - 1` (leave one core for the event loop), min 1. */
  size?: number;
  /** Data passed to every worker as `workerData` (e.g. a model path). */
  workerData?: unknown;
  /** Per-task timeout in ms; the task rejects and the slot frees up (default: no timeout). */
  taskTimeoutMs?: number;
}

/**
 * A fixed-size pool of `worker_threads`, all running `entryFile`, for
 * offloading CPU-bound work so it doesn't block the event loop that's
 * handling other concurrent requests. This is the piece that makes running
 * a "lightweight ML model" viable inside a request handler: inference runs
 * on a worker thread while the main thread keeps serving other requests.
 *
 * The worker file must call `defineWorkerTask()` (exported from this same
 * package) to register its handler function.
 *
 * ```ts
 * // inference-worker.ts
 * import { defineWorkerTask } from '@nodalite/workers';
 * import { runInference } from './model.js';
 * defineWorkerTask(async (input) => runInference(input));
 *
 * // app.ts
 * const pool = new WorkerPool(new URL('./inference-worker.js', import.meta.url), { size: 2 });
 * app.post('/predict', async (c) => c.json(await pool.run(await c.req.json())));
 * ```
 */
export class WorkerPool<In = unknown, Out = unknown> {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: Array<{ payload: In; pending: PendingTask }> = [];
  private pendingByWorker = new WeakMap<Worker, Map<number, PendingTask>>();
  private nextId = 0;
  private closed = false;

  constructor(private entryFile: string | URL, private opts: WorkerPoolOptions = {}) {
    const size = Math.max(1, opts.size ?? availableParallelism() - 1);
    for (let i = 0; i < size; i++) this.spawnWorker();
  }

  private spawnWorker(): void {
    const worker = new Worker(this.entryFile, { workerData: this.opts.workerData });
    this.pendingByWorker.set(worker, new Map());

    worker.on("message", (msg: ResultMessage) => {
      const pending = this.pendingByWorker.get(worker)?.get(msg.id);
      if (!pending) return;
      this.pendingByWorker.get(worker)!.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error));
      else pending.resolve(msg.result);
      this.idle.push(worker);
      this.drainQueue();
    });

    worker.on("error", (err) => {
      // Reject anything in-flight on this worker, then replace it so the pool stays at full size.
      for (const pending of this.pendingByWorker.get(worker)?.values() ?? []) pending.reject(err);
      this.pendingByWorker.delete(worker);
      this.workers = this.workers.filter((w) => w !== worker);
      this.idle = this.idle.filter((w) => w !== worker);
      if (!this.closed) this.spawnWorker();
    });

    this.workers.push(worker);
    this.idle.push(worker);
  }

  run(payload: In): Promise<Out> {
    if (this.closed) return Promise.reject(new Error("WorkerPool is terminated"));
    return new Promise<Out>((resolve, reject) => {
      const pending: PendingTask = { resolve: resolve as (v: unknown) => void, reject };
      this.queue.push({ payload, pending });
      this.drainQueue();
    });
  }

  private drainQueue(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.shift()!;
      const task = this.queue.shift()!;
      const id = this.nextId++;
      this.pendingByWorker.get(worker)!.set(id, task.pending);

      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      if (this.opts.taskTimeoutMs) {
        timeoutHandle = setTimeout(() => {
          this.pendingByWorker.get(worker)?.delete(id);
          task.pending.reject(new Error(`WorkerPool task timed out after ${this.opts.taskTimeoutMs}ms`));
        }, this.opts.taskTimeoutMs);
      }

      const message: TaskMessage = { id, payload: task.payload };
      worker.postMessage(message);
      if (timeoutHandle) timeoutHandle.unref?.();
    }
  }

  async terminate(): Promise<void> {
    this.closed = true;
    await Promise.all(this.workers.map((w) => w.terminate()));
  }

  get size(): number {
    return this.workers.length;
  }
}

/**
 * Call this inside your worker entry file to register the function that
 * processes each task sent via `pool.run()`. Wires up the `parentPort`
 * message protocol so you don't have to.
 */
export function defineWorkerTask<In = unknown, Out = unknown>(handler: (input: In) => Promise<Out> | Out): void {
  if (!workerThreadsParentPort) throw new Error("defineWorkerTask() must be called from inside a worker_thread");
  const parentPort = workerThreadsParentPort;

  parentPort.on("message", async (msg: TaskMessage) => {
    try {
      const result = await handler(msg.payload as In);
      parentPort.postMessage({ id: msg.id, result } satisfies ResultMessage);
    } catch (err) {
      parentPort.postMessage({ id: msg.id, error: err instanceof Error ? err.message : String(err) } satisfies ResultMessage);
    }
  });
}
