# Telegram Bot Thread Example

Demonstrates an API server plus a Telegram bot's long-polling loop running on
an independent, supervised `worker_thread` via `runDetached()`.

## Run it

```bash
export TELEGRAM_BOT_TOKEN=your_token_here
npm run dev -w examples-telegram-bot-thread
```

## How it works

### App server (`app.ts`)

A normal Nodalite API server with routes, middleware, etc.

### Bot worker (`bot-worker.ts`)

A separate file that uses `node:worker_threads` to run a Telegram bot polling
loop:

```ts
import { workerData, parentPort } from 'node:worker_threads';
import { Bot } from './bot.js';

const bot = new Bot(workerData.token);

async function run() {
  for await (const update of bot.poll()) {
    await bot.handle(update);
  }
}

run().catch((err) => {
  parentPort?.postMessage({ type: 'crash', error: err.message });
});
```

### Detached runner

```ts
import { runDetached } from '@nodalite/workers';

runDetached('./bot-worker.js', {
  name: 'telegram-bot',
  workerData: { token: process.env.TELEGRAM_BOT_TOKEN },
  onCrash: (err) => console.error('Bot crashed, restarting:', err),
});
```

### Key points

- A crash in the bot worker doesn't take down the HTTP server
- The worker auto-restarts with exponential backoff
- The bot and API share the same deployment unit — one process to monitor
- This pattern is for **long-running servers only** (not serverless)
