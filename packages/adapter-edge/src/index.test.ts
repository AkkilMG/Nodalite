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
});
