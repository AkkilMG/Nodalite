import { afterEach, describe, expect, it } from "vitest";
import { runDetached, type DetachedHandle } from "./detached.js";

const supervisedWorker = new URL("./__fixtures__/supervised-worker.mjs", import.meta.url);

describe("runDetached", () => {
  let handle: DetachedHandle | undefined;

  afterEach(async () => {
    await handle?.stop();
    handle = undefined;
  });

  it("starts the worker and reports it running", async () => {
    const started = new Promise<void>((resolve) => {
      handle = runDetached(supervisedWorker, {
        autoRestart: false,
      });
      handle.worker.on("message", (msg) => {
        if (msg.event === "started") resolve();
      });
    });
    await started;
  });

  it("automatically restarts the worker after a crash", async () => {
    let exitCount = 0;
    let startCount = 0;

    await new Promise<void>((resolve) => {
      handle = runDetached(supervisedWorker, {
        workerData: { crashAfterMs: 20 },
        restartDelayMs: 10,
        maxRestartDelayMs: 10,
        onExit: () => {
          exitCount += 1;
          if (exitCount >= 2) resolve();
        },
      });

      const attachListener = () => {
        handle!.worker.on("message", (msg) => {
          if (msg.event === "started") startCount += 1;
        });
      };
      attachListener();
      // Re-attach after each restart since `worker` is a fresh instance.
      const interval = setInterval(() => {
        attachListener();
        if (exitCount >= 2) clearInterval(interval);
      }, 15);
    });

    expect(exitCount).toBeGreaterThanOrEqual(2);
    expect(startCount).toBeGreaterThanOrEqual(1);
  }, 10_000);

  it("stop() prevents further restarts", async () => {
    let exitCount = 0;
    handle = runDetached(supervisedWorker, {
      workerData: { crashAfterMs: 10 },
      restartDelayMs: 10,
      onExit: () => {
        exitCount += 1;
      },
    });

    await new Promise((r) => setTimeout(r, 50));
    await handle.stop();
    const countAfterStop = exitCount;
    await new Promise((r) => setTimeout(r, 100));
    expect(exitCount).toBe(countAfterStop);
  });
});
