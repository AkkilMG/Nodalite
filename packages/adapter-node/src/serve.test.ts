import { App } from "@nodalite/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serve, type ServeHandle } from "./serve.js";

describe("serve", () => {
  let handle: ServeHandle | undefined;

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
  });

  it("serves real HTTP requests end-to-end", async () => {
    const app = new App();
    app.get("/health", (c) => c.json({ ok: true }));
    app.post("/echo", async (c) => {
      const body = await c.req.json<{ msg: string }>();
      return c.json({ echoed: body.msg });
    });

    handle = serve(app, { port: 0 });
    await new Promise<void>((resolve) => handle!.server.once("listening", resolve));
    const address = handle.server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
    expect(await healthRes.json()).toEqual({ ok: true });

    const echoRes = await fetch(`http://127.0.0.1:${port}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ msg: "hi" }),
    });
    expect(await echoRes.json()).toEqual({ echoed: "hi" });
  });

  it("exposes the client IP to the app via platform", async () => {
    const app = new App();
    app.get("/ip", (c) => c.json({ ip: c.platform.ip }));
    handle = serve(app, { port: 0 });
    await new Promise<void>((resolve) => handle!.server.once("listening", resolve));
    const address = handle.server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const res = await fetch(`http://127.0.0.1:${port}/ip`);
    const body = (await res.json()) as { ip: string };
    expect(body.ip).toBeTruthy();
  });

  it("sets runtime to 'node' in platform", async () => {
    const app = new App();
    app.get("/rt", (c) => c.json({ runtime: c.platform.runtime }));
    handle = serve(app, { port: 0 });
    await new Promise<void>((resolve) => handle!.server.once("listening", resolve));
    const address = handle.server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const res = await fetch(`http://127.0.0.1:${port}/rt`);
    expect(await res.json()).toEqual({ runtime: "node" });
  });

  it("returns 500 JSON when the handler throws an unhandled error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = new App();
    app.get("/crash", () => {
      throw new Error("boom");
    });
    handle = serve(app, { port: 0 });
    await new Promise<void>((resolve) => handle!.server.once("listening", resolve));
    const address = handle.server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const res = await fetch(`http://127.0.0.1:${port}/crash`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Internal Server Error" });
    errSpy.mockRestore();
  });

  it("invokes the onListen callback with port and hostname", async () => {
    const app = new App();
    app.get("/", (c) => c.json({}));
    const onListen = vi.fn();
    handle = serve(app, { port: 0, hostname: "127.0.0.1", onListen });
    await new Promise<void>((resolve) => handle!.server.once("listening", resolve));

    expect(onListen).toHaveBeenCalledOnce();
    expect(onListen.mock.calls[0]![0]).toMatchObject({ hostname: "127.0.0.1" });
    expect(typeof onListen.mock.calls[0]![0].port).toBe("number");
  });

  it("close() resolves and stops accepting new connections", async () => {
    const app = new App();
    app.get("/", (c) => c.json({}));
    handle = serve(app, { port: 0 });
    await new Promise<void>((resolve) => handle!.server.once("listening", resolve));

    const closed = handle.close();
    expect(closed).toBeInstanceOf(Promise);
    await closed;

    const address = handle.server.address();
    expect(address).toBeNull();
    handle = undefined;
  });
});
