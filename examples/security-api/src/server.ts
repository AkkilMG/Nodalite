import { serve } from "@nodalite/adapter-node";
import { app } from "./app.js";

const handle = serve(app, {
  port: Number(process.env.PORT) || 3001,
  onListen: ({ port, hostname }) => {
    console.log(`security-api listening on http://${hostname}:${port}`);
  },
});

process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await handle.close();
  process.exit(0);
});
