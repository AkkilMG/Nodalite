import { App } from "@nodalite/core";
import { serve } from "@nodalite/adapter-node";
import { runDetached } from "@nodalite/workers";

const app = new App();
app.get("/health", (c) => c.json({ ok: true }));

const handle = serve(app, { port: Number(process.env.PORT) || 3000 });

// The bot runs on its own thread, independent of the request-handling event
// loop above. If it crashes (a bug, an unexpected exception escaping the
// worker), runDetached restarts it with backoff — the API keeps serving
// requests unaffected the whole time.
//
// Important: this pattern needs a process that stays alive between
// requests. It works here and on any container/VM deployment. It does NOT
// work on serverless (Lambda, Cloudflare Workers) — see the guide's
// "Independent background threads" section for the serverless-equivalent
// pattern (a separate always-on service, or switching the bot to webhooks
// so Telegram calls *you* instead of long-polling).
const workerExt = import.meta.url.endsWith(".ts") ? "ts" : "js";
const bot = runDetached(new URL(`./telegram-bot.${workerExt}`, import.meta.url), {
  workerData: { token: process.env.TELEGRAM_BOT_TOKEN },
  restartDelayMs: 2000,
  onExit: (code) => console.log(`[bot] worker exited with code ${code}, restarting...`),
  onError: (err) => console.error("[bot] worker error:", err),
});

bot.worker.on("message", (msg: { event: string; [k: string]: unknown }) => {
  console.log(`[bot] ${msg.event}`, msg);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\nReceived ${signal}, shutting down...`);
  bot.send({ type: "shutdown" });
  await bot.stop();
  await handle.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
