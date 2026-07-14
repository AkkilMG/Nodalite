---
description: API reference for @nodalite/workers: runDetached() for supervised background worker_threads and WorkerPool for CPU offload.
---

# @nodalite/workers

Independent background threads and CPU offload for Node.js.

```
npm install @nodalite/workers
```

## runDetached()

Spawn a supervised `worker_thread` that lives for the lifetime of the parent
process. Automatic exponential-backoff restart on crash.

```ts
import { runDetached } from '@nodalite/workers';

runDetached('./bot-worker.js', {
  name: 'telegram-bot',
  workerData: { token: process.env.TELEGRAM_BOT_TOKEN },
  onCrash: (err) => console.error('Bot crashed:', err),
});
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | Worker name (used in logs) |
| `workerData` | `unknown` | `{}` | Data passed to the worker via `worker_threads`'s `workerData` |
| `onCrash` | `(err: Error) => void` | — | Called when the worker crashes (before restart) |
| `maxRestarts` | `number` | `Infinity` | Max consecutive restart attempts before giving up |

### Worker file (`bot-worker.js`)

```ts
import { workerData, parentPort } from 'node:worker_threads';

// Your bot/poller logic here
async function run() {
  // workerData.token is available
}

run().catch((err) => {
  // Signal the crash to the parent
  parentPort?.postMessage({ type: 'crash', error: err.message });
});
```

::: warning
`runDetached()` only works on **long-running Node processes** (containers, VMs,
servers). It does **not** work on serverless platforms (Lambda, Workers) where
there is no persistent parent process. See [Background Threads](/guides/background-threads).
:::

## WorkerPool

Offload CPU-intensive work to a pool of worker threads.

```ts
import { WorkerPool, defineWorkerTask } from '@nodalite/workers';

// Define a typed task
const sentimentTask = defineWorkerTask<{ text: string }, { score: number }>(
  './sentiment-worker.js'
);

// Use it in a request handler
app.post('/analyze', async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  const result = await pool.run(sentimentTask, { text });
  return c.json(result);
});
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `maxWorkers` | `number` | `cpus.length - 1` | Maximum number of workers |
| `maxQueue` | `number` | `100` | Maximum queued tasks |

## defineWorkerTask()

Create a typed task definition for `WorkerPool`.

```ts
const myTask = defineWorkerTask<Input, Output>('./worker.js');
```
