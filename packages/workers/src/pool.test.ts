import { afterEach, describe, expect, it } from "vitest";
import { WorkerPool } from "./pool.js";

const echoWorker = new URL("./__fixtures__/echo-worker.mjs", import.meta.url);

describe("WorkerPool", () => {
  let pool: WorkerPool | undefined;

  afterEach(async () => {
    await pool?.terminate();
    pool = undefined;
  });

  it("runs real work on a real worker thread and returns the result", async () => {
    pool = new WorkerPool(echoWorker, { size: 2 });
    const result = await pool.run({ n: 21 });
    expect(result).toEqual({ doubled: 42 });
  });

  it("distributes concurrent tasks across multiple workers", async () => {
    pool = new WorkerPool(echoWorker, { size: 2 });
    const results = await Promise.all([
      pool.run({ n: 1, slow: true }),
      pool.run({ n: 2, slow: true }),
      pool.run({ n: 3 }),
    ]);
    expect(results).toEqual([{ doubled: 2 }, { doubled: 4 }, { doubled: 6 }]);
  });

  it("rejects the caller's promise when the worker reports an error", async () => {
    pool = new WorkerPool(echoWorker, { size: 1 });
    await expect(pool.run({ throw: true })).rejects.toThrow("intentional failure");
  });

  it("times out a task that never responds", async () => {
    pool = new WorkerPool(echoWorker, { size: 1, taskTimeoutMs: 50 });
    await expect(pool.run({ n: 1, slow: true, __forceTimeout: true })).rejects.toThrow(/timed out/);
  });
});
