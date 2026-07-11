import { App } from "@nodalite/core";
import { describe, expect, it } from "vitest";
import { createEdgeHandler } from "./index.js";

describe("createEdgeHandler", () => {
  it("forwards env bindings into c.platform", async () => {
    const app = new App();
    app.get("/kv", (c) => c.json({ value: (c.platform.env as Record<string, unknown>)?.MY_KV_VALUE }));
    const worker = createEdgeHandler(app);

    const res = await worker.fetch(new Request("https://example.com/kv"), { MY_KV_VALUE: "hello" });
    expect(await res.json()).toEqual({ value: "hello" });
  });

  it("sets runtime to 'edge' in platform", async () => {
    const app = new App();
    app.get("/rt", (c) => c.json({ runtime: c.platform.runtime as string }));
    const worker = createEdgeHandler(app);

    const res = await worker.fetch(new Request("https://example.com/rt"));
    expect(await res.json()).toEqual({ runtime: "edge" });
  });

  it("works without env parameter", async () => {
    const app = new App();
    app.get("/", (c) => c.json({ env: c.platform.env, ok: true }));
    const worker = createEdgeHandler(app);

    const res = await worker.fetch(new Request("https://example.com/"));
    expect(await res.json()).toEqual({ env: undefined, ok: true });
  });

  it("works without ctx parameter", async () => {
    const app = new App();
    app.get("/", (c) => c.json({ ok: true }));
    const worker = createEdgeHandler(app);

    const res = await worker.fetch(new Request("https://example.com/"), { KEY: "val" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("forwards ctx.waitUntil so handlers can extend request lifetime", async () => {
    const waitUntilCalls: Promise<unknown>[] = [];
    const ctx = {
      waitUntil(p: Promise<unknown>) {
        waitUntilCalls.push(p);
      },
    };

    const app = new App();
    app.get("/", (c) => {
      const p = Promise.resolve("bg-work");
      (c.platform as { waitUntil: (p: Promise<unknown>) => void }).waitUntil(p);
      return c.json({ ok: true });
    });
    const worker = createEdgeHandler(app);

    await worker.fetch(new Request("https://example.com/"), {}, ctx);
    expect(waitUntilCalls).toHaveLength(1);
  });
});
