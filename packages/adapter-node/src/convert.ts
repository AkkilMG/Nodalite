import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

export function toFetchRequest(req: IncomingMessage, opts: { https?: boolean } = {}): Request {
  const protocol = opts.https ? "https" : "http";
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `${protocol}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else headers.set(key, value);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  return new Request(url, {
    method: req.method ?? "GET",
    headers,
    // Node requires `duplex: 'half'` when streaming a body via a ReadableStream.
    body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>) : undefined,
    duplex: hasBody ? "half" : undefined,
  });
}

export async function sendResponse(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(response.status, headers);

  if (!response.body) {
    res.end();
    return;
  }

  const nodeStream = Readable.fromWeb(response.body as any);
  await new Promise<void>((resolve, reject) => {
    nodeStream.pipe(res);
    nodeStream.on("end", resolve);
    nodeStream.on("error", reject);
    res.on("close", resolve);
  });
}
