# Background Threads

`runDetached()` spawns a supervised `worker_thread` that lives for the
lifetime of the parent Node process. This is genuinely useful for:

- **Telegram/Slack/Discord bots** that use long-polling
- **Background pollers** that watch for changes in external systems
- **Data sync workers** that periodically pull from APIs

## How it works

A crash in the worker (bot logic throwing, a bad message loop) doesn't take
down the HTTP server's event loop, and vice versa. Automatic exponential-
backoff restart is built in.

```ts
import { runDetached } from '@nodalite/workers';

runDetached('./bot-worker.js', {
  name: 'telegram-bot',
  workerData: { token: process.env.BOT_TOKEN },
  onCrash: (err) => console.error(`Worker crashed:`, err),
});
```

The worker shares the same container/deployment unit — one process to deploy,
monitor, and restart, not two.

## The honest limit

A `worker_thread` only exists between the moment its parent Node process
starts and the moment it exits. On **AWS Lambda, Cloudflare Workers, or any
FaaS platform**, there is no such persistent parent process — the runtime
freezes or destroys your execution environment between invocations.

**There is no version of `runDetached()` that works on serverless**, because
the premise — a process that outlives a single request, indefinitely — is
exactly what serverless does not provide.

## Serverless alternatives

If you need background work on a FaaS platform:

### 1. Switch to webhooks (preferred)

Telegram, Slack, Discord, GitHub, Stripe, etc. all support "call my URL when
something happens" instead of polling. A webhook is just another route on your
existing serverless API.

```ts
app.post('/webhooks/telegram', async (c) => {
  const update = await c.req.json();
  await handleUpdate(update);
  return c.noContent();
});
```

### 2. Run a small always-on service

If long-polling is unavoidable, run that specific piece as a minimal
always-on service — a single container on Fly.io, Railway, ECS Fargate, or a
$5 VPS — separate from your serverless API. `runDetached()` is exactly the
right tool *for that container*.

### 3. Use scheduled tasks

If the work is periodic, not continuous, use `toServerlessTask()` from
`@nodalite/scheduler` behind your cloud's native cron:

- **AWS:** EventBridge Scheduler → Lambda
- **Cloudflare:** Cron Triggers → Worker
- **Google Cloud:** Cloud Scheduler → Cloud Function
