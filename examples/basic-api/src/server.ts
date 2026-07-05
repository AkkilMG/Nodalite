import { serve } from "@nodalite/adapter-node";
import { Scheduler } from "@nodalite/scheduler";
import { app, shutdown } from "./app.js";

const scheduler = new Scheduler();

// Runs inside this same long-lived process. This is the "server" side of
// scheduling — see the lambda-deploy example for the serverless equivalent
// (a separate function invoked by EventBridge Scheduler / Cron Triggers).
scheduler.every(
  60_000,
  () => {
    console.log(`[scheduler] housekeeping tick at ${new Date().toISOString()}`);
  },
  { name: "housekeeping" }
);

const handle = serve(app, {
  port: Number(process.env.PORT) || 3000,
  onListen: ({ port, hostname }) => {
    console.log(`example-api listening on http://${hostname}:${port}`);
  },
});

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\nReceived ${signal}, shutting down...`);
  scheduler.stopAll();
  await handle.close();
  await shutdown();
  process.exit(0);
}

process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
