import { parentPort } from "node:worker_threads";

parentPort.on("message", (msg) => {
  if (msg.payload?.throw) {
    parentPort.postMessage({ id: msg.id, error: "intentional failure" });
    return;
  }
  if (msg.payload?.slow) {
    setTimeout(() => parentPort.postMessage({ id: msg.id, result: { doubled: msg.payload.n * 2 } }), 200);
    return;
  }
  parentPort.postMessage({ id: msg.id, result: { doubled: msg.payload.n * 2 } });
});
