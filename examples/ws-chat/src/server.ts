import { serveWs } from "@nodalite/ws/node";
import { app, ws } from "./app.js";

const handle = await serveWs(app, ws, {
  port: Number(process.env.PORT) || 3000,
  onListen: ({ port, hostname }) => {
    console.log(`ws-chat listening on http://${hostname}:${port}`);
    console.log(`  WebSocket: ws://${hostname}:${port}/chat?username=Alice`);
    console.log(`  Notifications: ws://${hostname}:${port}/notifications`);
  },
});

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\nReceived ${signal}, shutting down...`);
  await ws.close();
  await handle.close();
  process.exit(0);
}

process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
