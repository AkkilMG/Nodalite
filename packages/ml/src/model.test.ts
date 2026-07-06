import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Model, type InferenceEngine } from "./model.js";

function fakeEngine(loadCount: { n: number }): InferenceEngine<{ x: number }, { y: number }> {
  return {
    async loadSession(bytes: Buffer) {
      loadCount.n += 1;
      const marker = bytes.toString("utf8");
      return {
        async run(input: { x: number }) {
          return { y: input.x * 2, marker } as unknown as { y: number };
        },
      };
    },
  };
}

describe("Model", () => {
  it("loads the session once and reuses it across multiple predict() calls", async () => {
    const loadCount = { n: 0 };
    const model = new Model({ type: "buffer", bytes: Buffer.from("hello") }, fakeEngine(loadCount));

    await model.predict({ x: 1 });
    await model.predict({ x: 2 });
    await model.predict({ x: 3 });

    expect(loadCount.n).toBe(1);
  });

  it("dedupes concurrent cold-start loads into a single session build", async () => {
    const loadCount = { n: 0 };
    const model = new Model({ type: "buffer", bytes: Buffer.from("hello") }, fakeEngine(loadCount));

    const [a, b, c] = await Promise.all([model.predict({ x: 1 }), model.predict({ x: 2 }), model.predict({ x: 3 })]);
    expect(loadCount.n).toBe(1);
    expect([a, b, c].map((r: any) => r.y)).toEqual([2, 4, 6]);
  });

  it("warm() pre-loads the session ahead of the first request", async () => {
    const loadCount = { n: 0 };
    const model = new Model({ type: "buffer", bytes: Buffer.from("hello") }, fakeEngine(loadCount));
    await model.warm();
    expect(loadCount.n).toBe(1);
    await model.predict({ x: 5 });
    expect(loadCount.n).toBe(1);
  });

  it("release() forces the next predict() to reload", async () => {
    const loadCount = { n: 0 };
    const model = new Model({ type: "buffer", bytes: Buffer.from("hello") }, fakeEngine(loadCount));
    await model.predict({ x: 1 });
    await model.release();
    await model.predict({ x: 1 });
    expect(loadCount.n).toBe(2);
  });
});

describe("Model with a url source", () => {
  let cacheDir: string;
  let server: ReturnType<typeof createServer>;
  let port: number;
  let requestCount = 0;

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), "nodalite-ml-test-"));
    requestCount = 0;
    server = createServer((_req, res) => {
      requestCount += 1;
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end("fake-model-bytes");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    port = typeof address === "object" && address ? address.port : 0;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("downloads the model once and caches it to disk for subsequent Model instances", async () => {
    const loadCount = { n: 0 };
    const url = `http://127.0.0.1:${port}/model.bin`;

    const model1 = new Model({ type: "url", url }, fakeEngine(loadCount), { cacheDir });
    await model1.predict({ x: 1 });
    expect(requestCount).toBe(1);

    // A *new* Model instance (simulating a fresh cold-start module load)
    // pointed at the same cacheDir should hit disk, not the network again.
    const model2 = new Model({ type: "url", url }, fakeEngine(loadCount), { cacheDir });
    await model2.predict({ x: 1 });
    expect(requestCount).toBe(1);
    expect(loadCount.n).toBe(2); // session still rebuilt per-instance, but bytes came from cache
  });
});
