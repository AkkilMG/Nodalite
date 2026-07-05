"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  sendResponse: () => sendResponse,
  serve: () => serve,
  toFetchRequest: () => toFetchRequest
});
module.exports = __toCommonJS(index_exports);

// src/serve.ts
var http = __toESM(require("http"), 1);
var https = __toESM(require("https"), 1);

// src/convert.ts
var import_node_stream = require("stream");
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
    body: hasBody ? import_node_stream.Readable.toWeb(req) : void 0,
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
  const nodeStream = import_node_stream.Readable.fromWeb(response.body);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  sendResponse,
  serve,
  toFetchRequest
});
