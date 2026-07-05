// src/serve.ts
import * as http from "http";
import * as https from "https";

// src/convert.ts
import { Readable } from "stream";
function toFetchRequest(req, opts = {}) {
  const protocol = opts.https ? "https" : "http";
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `${protocol}://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === void 0) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else headers.set(key, value);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method ?? "GET",
    headers,
    // Node requires `duplex: 'half'` when streaming a body via a ReadableStream.
    body: hasBody ? Readable.toWeb(req) : void 0,
    duplex: hasBody ? "half" : void 0
  });
}
async function sendResponse(res, response) {
  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(response.status, headers);
  if (!response.body) {
    res.end();
    return;
  }
  const nodeStream = Readable.fromWeb(response.body);
  await new Promise((resolve, reject) => {
    nodeStream.pipe(res);
    nodeStream.on("end", resolve);
    nodeStream.on("error", reject);
    res.on("close", resolve);
  });
}

// src/serve.ts
function serve(app, opts = {}) {
  const port = opts.port ?? (Number(process.env.PORT) || 3e3);
  const hostname = opts.hostname ?? "0.0.0.0";
  const listener = (req, res) => {
    const request = toFetchRequest(req, { https: Boolean(opts.tls) });
    const platform = { ip: req.socket.remoteAddress, runtime: "node" };
    app.handle(request, platform).then((response) => sendResponse(res, response)).catch((err) => {
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
    close: () => new Promise((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    })
  };
}
export {
  sendResponse,
  serve,
  toFetchRequest
};
