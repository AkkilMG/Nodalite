import { parentPort, workerData } from "node:worker_threads";

interface TelegramUpdate {
  update_id: number;
  message?: { chat: { id: number }; text?: string };
}

const { token } = (workerData ?? {}) as { token?: string };
const API_BASE = token ? `https://api.telegram.org/bot${token}` : undefined;

let stopped = false;
let offset = 0;

// Listen for a graceful-shutdown request from the main thread (see main.ts).
// Long-polling requests can take up to `timeout` seconds to return, so we
// just flip a flag; the loop below checks it between polls and exits
// cleanly instead of being force-killed mid-request.
parentPort?.on("message", (msg: { type: string }) => {
  if (msg.type === "shutdown") stopped = true;
});

async function pollOnce(): Promise<void> {
  if (!API_BASE) throw new Error("TELEGRAM_BOT_TOKEN is not set");

  const res = await fetch(`${API_BASE}/getUpdates?offset=${offset}&timeout=30`);
  if (!res.ok) throw new Error(`getUpdates failed: HTTP ${res.status}`);

  const body = (await res.json()) as { ok: boolean; result: TelegramUpdate[] };
  for (const update of body.result) {
    offset = update.update_id + 1;
    await handleUpdate(update);
  }
}

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const chatId = update.message?.chat.id;
  const text = update.message?.text;
  if (!chatId || !text) return;

  parentPort?.postMessage({ event: "message", chatId, text });

  await fetch(`${API_BASE}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: `Echo: ${text}` }),
  });
}

async function main(): Promise<void> {
  parentPort?.postMessage({ event: "started" });

  while (!stopped) {
    try {
      await pollOnce();
    } catch (err) {
      // Log and back off, but don't throw: an uncaught exception here would
      // exit the worker thread and trigger runDetached's crash-restart path,
      // which is meant for genuine crashes, not routine network hiccups.
      parentPort?.postMessage({ event: "error", message: err instanceof Error ? err.message : String(err) });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  parentPort?.postMessage({ event: "stopped" });
}

main();
