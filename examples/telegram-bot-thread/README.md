# telegram-bot-thread example

Shows the "independent background thread alongside the API" pattern:
`main.ts` starts a normal API server (`@nodalite/adapter-node`'s `serve()`)
and, in the same process, spawns a Telegram bot's long-polling loop on its
own supervised `worker_thread` via `@nodalite/workers`' `runDetached()`.

- The bot (`src/telegram-bot.ts`) polls Telegram's `getUpdates` endpoint in a
  loop and echoes messages back. Network/API errors are caught *inside* the
  loop and reported to the main thread, rather than thrown — an uncaught
  exception here would exit the worker and trigger a full restart, which is
  meant for genuine crashes, not routine polling hiccups.
- `main.ts` listens for `{event: 'started' | 'message' | 'error' | 'stopped'}`
  messages from the worker and logs them; sends `{type: 'shutdown'}` into the
  worker on `SIGINT`/`SIGTERM` for a clean stop instead of a hard kill.

## Run it

```bash
pnpm install
TELEGRAM_BOT_TOKEN=your-token-here pnpm --filter examples-telegram-bot-thread dev
```

Without a real token, the API still serves `/health` fine — the bot worker
just logs a `TELEGRAM_BOT_TOKEN is not set` error and retries every 3s,
which is exactly the graceful-degradation behavior you want (one broken
subsystem doesn't take down the other).

## Why this pattern doesn't extend to serverless

`runDetached()` needs a process that outlives a single request — that's
precisely what Lambda/Workers don't provide. See
[`docs/GUIDE.md` §5](../../docs/GUIDE.md#5-independent-background-threads--and-their-serverless-limit-honestly)
for the serverless-equivalent options (webhooks instead of polling, or a
small always-on container just for this piece).
