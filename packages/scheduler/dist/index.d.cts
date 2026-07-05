interface ScheduledTaskOptions {
    name?: string;
    onError?: (err: unknown, name: string) => void;
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
declare class Scheduler {
    private jobs;
    private stopped;
    /** Run `task` every time `cronExpression` matches (standard 5-field cron, minute resolution). */
    cron(cronExpression: string, task: () => Promise<void> | void, opts?: ScheduledTaskOptions): this;
    /** Run `task` every `intervalMs`, starting after the first interval elapses. */
    every(intervalMs: number, task: () => Promise<void> | void, opts?: ScheduledTaskOptions): this;
    /** Stop every registered job. */
    stopAll(): void;
    get jobNames(): string[];
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
declare function toServerlessTask(task: () => Promise<void> | void): (_event?: unknown, _context?: unknown) => Promise<{
    ok: boolean;
}>;

interface CronMatcher {
    matches(date: Date): boolean;
}
/**
 * Parses a standard 5-field cron expression: `minute hour day-of-month month day-of-week`.
 * Supports `*`, lists (`1,15,30`), ranges (`1-5`), and steps (`*\/15`, `1-10/2`).
 * Does not support seconds-precision or non-standard extensions (`@daily`, etc).
 */
declare function parseCron(expression: string): CronMatcher;
/** Finds the next Date (minute-resolution, at :00 seconds) at or after `from` that matches the cron expression. */
declare function nextRun(matcher: CronMatcher, from?: Date): Date;

export { type CronMatcher, type ScheduledTaskOptions, Scheduler, nextRun, parseCron, toServerlessTask };
