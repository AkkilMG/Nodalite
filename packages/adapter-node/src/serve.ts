import * as http from "node:http";
import * as https from "node:https";
import type { Server } from "node:http";
import type { App } from "@nodalite/core";
import { sendResponse, toFetchRequest } from "./convert.js";

export interface ServeOptions {
  port?: number;
  hostname?: string;
  /** Pass TLS cert/key to serve HTTPS directly (otherwise terminate TLS at a load balancer/proxy in front). */
  tls?: { key: string | Buffer; cert: string | Buffer };
  onListen?: (info: { port: number; hostname: string }) => void;
}

export interface ServeHandle {
  server: Server;
  close: () => Promise<void>;
}

/**
 * Runs a Nodalite `App` on a plain Node.js server. This is the "traditional
 * container/VM" deployment target — for AWS Lambda use `@nodalite/adapter-lambda`,
 * for edge runtimes (Bun/Deno/Cloudflare Workers) just export `app.fetch`
 * directly since they already speak the standard Fetch API.
 */
export function serve(app: App<any>, opts: ServeOptions = {}): ServeHandle {
  const port = opts.port ?? (Number(process.env.PORT) || 3000);
  const hostname = opts.hostname ?? "0.0.0.0";

  const listener: http.RequestListener = (req, res) => {
    const request = toFetchRequest(req, { https: Boolean(opts.tls) });
    const platform = { ip: req.socket.remoteAddress, runtime: "node" as const };

    app
      .handle(request, platform)
      .then((response) => sendResponse(res, response))
      .catch((err) => {
        console.error("[nodalite:adapter-node] Unhandled error converting response:", err);
        if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Internal Server Error" }));
      });
  };

  const server = opts.tls ? https.createServer(opts.tls, listener) : http.createServer(listener);

  server.listen(port, hostname, () => {
    opts.onListen?.({ port, hostname });
  });

  return {
    server,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
