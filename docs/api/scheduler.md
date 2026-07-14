---
description: API reference for @nodalite/scheduler: Scheduler with cron/interval scheduling, parseCron, nextRun, and toServerlessTask for Lambda.
---

# @nodalite/scheduler

Schedule recurring tasks for long-running servers, or convert them to
serverless-friendly one-shot invocations.

```
npm install @nodalite/scheduler
```

## Scheduler

Cron and interval scheduling for persistent Node processes.

```ts
import { Scheduler } from '@nodalite/scheduler';

const scheduler = new Scheduler();

// Every 5 minutes
scheduler.cron('*/5 * * * *', async () => {
  await syncData();
});

// Every 30 seconds
scheduler.interval(30_000, async () => {
  await checkHealth();
});

// Start (when app is ready)
scheduler.start();

// Graceful shutdown
process.on('SIGTERM', () => scheduler.stop());
```

### Methods

| Method | Description |
|---|---|
| `cron(expression, task)` | Schedule a task by cron expression |
| `interval(ms, task)` | Schedule a repeating task |
| `start()` | Begin executing scheduled tasks |
| `stop()` | Stop all tasks (for graceful shutdown) |

### Cron expressions

Standard 5-field cron: `minute hour day-of-month month day-of-week`

```
* * * * *     → every minute
*/5 * * * *   → every 5 minutes
0 * * * *     → every hour
0 9 * * 1-5   → 9 AM weekdays
```

## toServerlessTask()

Wrap a scheduled task so it can be triggered by your cloud's native scheduler
(EventBridge Scheduler, Cloudflare Cron Triggers, etc.).

```ts
import { toServerlessTask } from '@nodalite/scheduler';

// This becomes a Lambda handler or Worker fetch
export const handler = toServerlessTask(async () => {
  await syncData();
});
```

Use this with your cloud's cron service:

- **AWS:** EventBridge Scheduler → Lambda → this handler
- **Cloudflare:** Cron Triggers → Worker → this handler
- **Google Cloud:** Cloud Scheduler → Cloud Function → this handler

## Utility functions

```ts
import { parseCron, nextRun } from '@nodalite/scheduler';

parseCron('*/5 * * * *');  // → { minute: '*/5', hour: '*', ... }
nextRun('*/5 * * * *');    // → Date (next execution time)
```
