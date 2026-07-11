import { createServer } from "node:http";
import { mkdtemp, rm, writeFile as writeFileFs } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Model, type InferenceEngine } from "./model.js";
import {
  ModelSizeError,
  ModelPathError,
  ModelFormatError,
} from "./validate.js";

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
    expect([a, b, c].map((r: { y: number }) => r.y)).toEqual([2, 4, 6]);
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

    const model2 = new Model({ type: "url", url }, fakeEngine(loadCount), { cacheDir });
    await model2.predict({ x: 1 });
    expect(requestCount).toBe(1);
    expect(loadCount.n).toBe(2);
  });

  it("rejects url-sourced models exceeding maxBytes", async () => {
    server.close(() => {});
    server = createServer((_req, res) => {
      requestCount += 1;
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(Buffer.alloc(100, 0x41));
    });
    await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

    const loadCount = { n: 0 };
    const url = `http://127.0.0.1:${port}/model.bin`;
    const model = new Model({ type: "url", url }, fakeEngine(loadCount), {
      cacheDir,
      maxBytes: 50,
    });

    await expect(model.predict({ x: 1 })).rejects.toThrow(ModelSizeError);
  });
});

describe("Model size validation", () => {
  it("rejects buffer-sourced models exceeding maxBytes", async () => {
    const loadCount = { n: 0 };
    const model = new Model(
      { type: "buffer", bytes: Buffer.alloc(100, 0x41) },
      fakeEngine(loadCount),
      { maxBytes: 50 },
    );

    await expect(model.predict({ x: 1 })).rejects.toThrow(ModelSizeError);
  });

  it("accepts buffer-sourced models within maxBytes", async () => {
    const loadCount = { n: 0 };
    const model = new Model(
      { type: "buffer", bytes: Buffer.alloc(50, 0x41) },
      fakeEngine(loadCount),
      { maxBytes: 50 },
    );

    await model.predict({ x: 1 });
    expect(loadCount.n).toBe(1);
  });

  it("disables size check when maxBytes is 0", async () => {
    const loadCount = { n: 0 };
    const model = new Model(
      { type: "buffer", bytes: Buffer.alloc(1000, 0x41) },
      fakeEngine(loadCount),
      { maxBytes: 0 },
    );

    await model.predict({ x: 1 });
    expect(loadCount.n).toBe(1);
  });
});

describe("Model file source security", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), "nodalite-ml-proj-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("loads a valid .bin file inside project root", async () => {
    const filePath = path.join(projectRoot, "model.bin");
    await writeFileFs(filePath, "valid-model-bytes");

    const loadCount = { n: 0 };
    const model = new Model(
      { type: "file", path: "model.bin" },
      fakeEngine(loadCount),
      { projectRoot },
    );

    await model.predict({ x: 1 });
    expect(loadCount.n).toBe(1);
  });

  it("rejects path traversal outside project root", async () => {
    const loadCount = { n: 0 };
    const model = new Model(
      { type: "file", path: "../../etc/passwd" },
      fakeEngine(loadCount),
      { projectRoot },
    );

    await expect(model.predict({ x: 1 })).rejects.toThrow(ModelPathError);
  });

  it("rejects disallowed file extensions", async () => {
    const filePath = path.join(projectRoot, "model.txt");
    await writeFileFs(filePath, "some text content");

    const loadCount = { n: 0 };
    const model = new Model(
      { type: "file", path: "model.txt" },
      fakeEngine(loadCount),
      { projectRoot },
    );

    await expect(model.predict({ x: 1 })).rejects.toThrow(ModelFormatError);
  });

  it("accepts custom allowed extensions", async () => {
    const filePath = path.join(projectRoot, "model.onnx");
    // ONNX magic bytes + padding
    const onnxHeader = Buffer.from([0x08, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    await writeFileFs(filePath, Buffer.concat([onnxHeader, Buffer.from("padding")]));

    const loadCount = { n: 0 };
    const model = new Model(
      { type: "file", path: "model.onnx" },
      fakeEngine(loadCount),
      { projectRoot, allowedExtensions: [".onnx"] },
    );

    await model.predict({ x: 1 });
    expect(loadCount.n).toBe(1);
  });

  it("validates ONNX magic bytes for .onnx files", async () => {
    const filePath = path.join(projectRoot, "model.onnx");
    await writeFileFs(filePath, Buffer.from("not a real onnx file"));

    const loadCount = { n: 0 };
    const model = new Model(
      { type: "file", path: "model.onnx" },
      fakeEngine(loadCount),
      { projectRoot, allowedExtensions: [".onnx"] },
    );

    await expect(model.predict({ x: 1 })).rejects.toThrow(ModelFormatError);
  });

  it("accepts .onnx files with correct magic bytes", async () => {
    const filePath = path.join(projectRoot, "model.onnx");
    const onnxHeader = Buffer.from([0x08, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    await writeFileFs(filePath, Buffer.concat([onnxHeader, Buffer.from("model data")]));

    const loadCount = { n: 0 };
    const model = new Model(
      { type: "file", path: "model.onnx" },
      fakeEngine(loadCount),
      { projectRoot, allowedExtensions: [".onnx"] },
    );

    await model.predict({ x: 1 });
    expect(loadCount.n).toBe(1);
  });

  it("rejects file exceeding maxBytes", async () => {
    const filePath = path.join(projectRoot, "model.bin");
    await writeFileFs(filePath, Buffer.alloc(200, 0x41));

    const loadCount = { n: 0 };
    const model = new Model(
      { type: "file", path: "model.bin" },
      fakeEngine(loadCount),
      { projectRoot, maxBytes: 100 },
    );

    await expect(model.predict({ x: 1 })).rejects.toThrow(ModelSizeError);
  });

  it("allows per-source projectRoot override", async () => {
    const altRoot = await mkdtemp(path.join(tmpdir(), "nodalite-ml-alt-"));
    const filePath = path.join(altRoot, "model.bin");
    await writeFileFs(filePath, "alt-model-bytes");

    const loadCount = { n: 0 };
    const model = new Model(
      { type: "file", path: "model.bin", projectRoot: altRoot },
      fakeEngine(loadCount),
    );

    await model.predict({ x: 1 });
    expect(loadCount.n).toBe(1);

    await rm(altRoot, { recursive: true, force: true });
  });
});
