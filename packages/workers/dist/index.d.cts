import { Worker } from 'node:worker_threads';

interface DetachedOptions {
    /** Data passed into the worker as `workerData`. */
    workerData?: unknown;
    /** Restart the worker automatically if it exits unexpectedly (default true). */
    autoRestart?: boolean;
    /** Base backoff delay in ms before restarting; doubles each consecutive crash, capped at `maxRestartDelayMs`. */
    restartDelayMs?: number;
    maxRestartDelayMs?: number;
    onExit?: (code: number) => void;
    onError?: (err: unknown) => void;
}
interface DetachedHandle {
    worker: Worker;
    /** Stop the worker and disable auto-restart. */
    stop: () => Promise<void>;
    /** Send a structured message into the worker (e.g. a shutdown signal it listens for). */
    send: (message: unknown) => void;
}
/**
 * Runs `entryFile` on its own `worker_thread`, supervised with automatic
 * restart-on-crash (exponential backoff). This is how you run something
 * like a Telegram bot's long-polling loop *inside the same process* as your
 * API server, isolated on its own thread so a crash or a busy loop in the
 * bot doesn't take down (or block the event loop of) the HTTP server.
 *
 * Important: this pattern is for long-running server processes (a
 * container, VM, or PM2/systemd-managed process) — worker_threads only
 * exist for the lifetime of the Node process that spawned them. On
 * serverless (Lambda, Workers), there is no persistent process to attach a
 * background thread to; run the bot as its own always-on service instead
 * (small container, or a scheduled function if it can work via webhooks
 * instead of long-polling). See the guide for the serverless-specific
 * pattern.
 *
 * ```ts
 * // main.ts (your API server entry)
 * import { runDetached } from '@nodalite/workers';
 * runDetached(new URL('./telegram-bot.js', import.meta.url), { workerData: { token: process.env.BOT_TOKEN } });
 * ```
 */
declare function runDetached(entryFile: string | URL, opts?: DetachedOptions): DetachedHandle;

interface WorkerPoolOptions {
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
declare class WorkerPool<In = unknown, Out = unknown> {
    private entryFile;
    private opts;
    private workers;
    private idle;
    private queue;
    private pendingByWorker;
    private nextId;
    private closed;
    constructor(entryFile: string | URL, opts?: WorkerPoolOptions);
    private spawnWorker;
    run(payload: In): Promise<Out>;
    private drainQueue;
    terminate(): Promise<void>;
    get size(): number;
}
/**
 * Call this inside your worker entry file to register the function that
 * processes each task sent via `pool.run()`. Wires up the `parentPort`
 * message protocol so you don't have to.
 */
declare function defineWorkerTask<In = unknown, Out = unknown>(handler: (input: In) => Promise<Out> | Out): void;

export { type DetachedHandle, type DetachedOptions, WorkerPool, type WorkerPoolOptions, defineWorkerTask, runDetached };
