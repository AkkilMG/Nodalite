import { Worker } from "node:worker_threads";

export interface DetachedOptions {
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

export interface DetachedHandle {
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
export function runDetached(entryFile: string | URL, opts: DetachedOptions = {}): DetachedHandle {
  const autoRestart = opts.autoRestart ?? true;
  const baseDelay = opts.restartDelayMs ?? 1000;
  const maxDelay = opts.maxRestartDelayMs ?? 30_000;

  let stopped = false;
  let consecutiveCrashes = 0;
  let worker = spawn();

  function spawn(): Worker {
    const w = new Worker(entryFile, { workerData: opts.workerData });

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
    send: (message: unknown) => worker.postMessage(message),
    stop: async () => {
      stopped = true;
      await worker.terminate();
    },
  } as DetachedHandle;
}
