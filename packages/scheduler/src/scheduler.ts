import { nextRun, parseCron } from "./cron.js";

export interface ScheduledTaskOptions {
  name?: string;
  onError?: (err: unknown, name: string) => void;
}

interface Job {
  name: string;
  stop: () => void;
}

/**
 * Runs cron and fixed-interval jobs inside a long-lived process. This only
 * makes sense where your process itself stays alive (a Node server, a
 * container, `serve()` from `@nodalite/adapter-node`) — **not** on
 * serverless, where there's no persistent process for a `setTimeout` chain
 * to live in between invocations.
 *
 * For serverless, use the platform's own scheduler to invoke a dedicated
 * function on a schedule (AWS EventBridge Scheduler → Lambda, Cloudflare
 * Cron Triggers → Worker) and call your task function directly from that
 * handler — see `toServerlessTask()` below and the guide for wiring examples.
 */
export class Scheduler {
  private jobs: Job[] = [];
  private stopped = false;

  /** Run `task` every time `cronExpression` matches (standard 5-field cron, minute resolution). */
  cron(cronExpression: string, task: () => Promise<void> | void, opts: ScheduledTaskOptions = {}): this {
    const matcher = parseCron(cronExpression);
    const name = opts.name ?? cronExpression;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    const scheduleNext = () => {
      if (stopped || this.stopped) return;
      const next = nextRun(matcher);
      const delay = next.getTime() - Date.now();
      timer = setTimeout(async () => {
        try {
          await task();
        } catch (err) {
          opts.onError?.(err, name);
        }
        scheduleNext();
      }, delay);
      timer.unref?.();
    };

    scheduleNext();
    this.jobs.push({
      name,
      stop: () => {
        stopped = true;
        clearTimeout(timer);
      },
    });
    return this;
  }

  /** Run `task` every `intervalMs`, starting after the first interval elapses. */
  every(intervalMs: number, task: () => Promise<void> | void, opts: ScheduledTaskOptions = {}): this {
    const name = opts.name ?? `every(${intervalMs}ms)`;
    const interval = setInterval(async () => {
      try {
        await task();
      } catch (err) {
        opts.onError?.(err, name);
      }
    }, intervalMs);
    interval.unref?.();
    this.jobs.push({ name, stop: () => clearInterval(interval) });
    return this;
  }

  /** Stop every registered job. */
  stopAll(): void {
    this.stopped = true;
    for (const job of this.jobs) job.stop();
    this.jobs = [];
  }

  get jobNames(): string[] {
    return this.jobs.map((j) => j.name);
  }
}

/**
 * Wraps a task function so it can be invoked directly as a serverless
 * function body — for use behind AWS EventBridge Scheduler, Cloudflare Cron
 * Triggers, GCP Cloud Scheduler, etc. Those platforms own the actual
 * timing; this just gives you one function signature to point them at.
 *
 * ```ts
 * // scheduled-handler.ts (deployed as its own Lambda, triggered by EventBridge)
 * export const handler = toServerlessTask(async () => { await cleanupExpiredSessions(); });
 * ```
 */
export function toServerlessTask(task: () => Promise<void> | void) {
  return async (_event?: unknown, _context?: unknown) => {
    await task();
    return { ok: true };
  };
}
