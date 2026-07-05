import { parentPort, workerData } from "node:worker_threads";

parentPort?.postMessage({ event: "started" });

if (workerData?.crashAfterMs !== undefined) {
  setTimeout(() => process.exit(1), workerData.crashAfterMs);
}
