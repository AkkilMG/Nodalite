import { serve } from "@nodalite/adapter-node";
import { app, shutdown } from "./app.js";

const handle = serve(app, {
  port: Number(process.env.PORT) || 3000,
  onListen: ({ port, hostname }) => {
    console.log(`ml-inference example listening on http://${hostname}:${port}`);
  },
});

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\nReceived ${signal}, shutting down...`);
  await handle.close();
  await shutdown();
  process.exit(0);
}

process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
