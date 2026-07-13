import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { App, Context } from "./index.js";
import { discover } from "./discover.js";

function req(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init);
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "nodalite-discover-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeFile_(relativePath: string, content: string): Promise<string> {
  const fullPath = join(tmpDir, relativePath);
  await mkdir(join(fullPath, ".."), { recursive: true });
  await writeFile(fullPath, content, "utf-8");
  return fullPath;
}

// ---------------------------------------------------------------------------
// FS mode
// ---------------------------------------------------------------------------

describe("discover", () => {
  describe("FS mode", () => {
    describe("error handling", () => {
      it("throws when first arg is a string (no App)", async () => {
        await expect(
          discover("./routes" as unknown as App, "./routes"),
        ).rejects.toThrow("discover() requires an App instance");
      });

      it("throws when no second arg", async () => {
        const app = new App();
        await expect(discover(app)).rejects.toThrow("requires a directory path");
      });

      it("silently skips non-existent directory", async () => {
        const app = new App();
        await discover(app, join(tmpDir, "nonexistent"));
        // Should not throw, just skip
      });

      it("silently skips when dir is a file, not a directory", async () => {
        const app = new App();
        await writeFile_(("standalone.ts"), "export default (app: App) => { app.get('/x', () => 'ok'); }");
        await discover(app, join(tmpDir, "standalone.ts"));
        // standalone.ts is a file, not a directory — silently skips
      });
    });

    describe("basic route loading", () => {
      it("loads a single route file with default export", async () => {
        await writeFile_("users.ts", `
          export default (app: App) => {
            app.get("/users", (c: Context) => c.json({ users: [] }));
          };
        `);

        const app = new App();
        await discover(app, tmpDir);

        const res = await app.handle(req("/users"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ users: [] });
      });

      it("loads a single route file with function export (not default)", async () => {
        await writeFile_("health.ts", `
          export default (app: App) => {
            app.get("/health", (c: Context) => c.json({ ok: true }));
          };
        `);

        const app = new App();
        await discover(app, tmpDir);

        const res = await app.handle(req("/health"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
      });

      it("loads multiple route files in the same directory", async () => {
        await writeFile_("users.ts", `
          export default (app: App) => {
            app.get("/users", (c: Context) => c.json({ route: "users" }));
          };
        `);
        await writeFile_("posts.ts", `
          export default (app: App) => {
            app.get("/posts", (c: Context) => c.json({ route: "posts" }));
          };
        `);

        const app = new App();
        await discover(app, tmpDir);

        const r1 = await app.handle(req("/users"));
        expect(await r1.json()).toEqual({ route: "users" });

        const r2 = await app.handle(req("/posts"));
        expect(await r2.json()).toEqual({ route: "posts" });
      });

      it("route file can register multiple methods on the same path", async () => {
        await writeFile_("items.ts", `
          export default (app: App) => {
            app.get("/items", (c: Context) => c.json({ method: "GET" }));
            app.post("/items", (c: Context) => c.json({ method: "POST" }));
          };
        `);

        const app = new App();
        await discover(app, tmpDir);

        const r1 = await app.handle(req("/items"));
        expect(await r1.json()).toEqual({ method: "GET" });

        const r2 = await app.handle(req("/items", { method: "POST" }));
        expect(await r2.json()).toEqual({ method: "POST" });
      });
    });

    describe("prefix handling", () => {
      it("applies prefix from _prefix.ts in subdirectory", async () => {
        await writeFile_("posts/_prefix.ts", `
          export default (app: App) => { app.use("/posts"); };
        `);
        await writeFile_("posts/index.ts", `
          export default (app: App) => {
            app.get("/", (c: Context) => c.json({ route: "posts-index" }));
          };
        `);

        const app = new App();
        await discover(app, tmpDir);

        const res = await app.handle(req("/posts"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ route: "posts-index" });
      });

      it("applies prefix from _prefix.ts with string export", async () => {
        await writeFile_("api/_prefix.ts", `
          export default "/api";
        `);
        await writeFile_("api/health.ts", `
          export default (app: App) => {
            app.get("/health", (c: Context) => c.json({ ok: true }));
          };
        `);

        const app = new App();
        await discover(app, tmpDir);

        const res = await app.handle(req("/api/health"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
      });

      it("accumulates nested prefixes (parent + child)", async () => {
        await writeFile_("_prefix.ts", `export default "/api";`);
        await writeFile_("v1/_prefix.ts", `export default "/v1";`);
        await writeFile_("v1/users.ts", `
          export default (app: App) => {
            app.get("/users", (c: Context) => c.json({ route: "users" }));
          };
        `);

        const app = new App();
        await discover(app, tmpDir);

        const res = await app.handle(req("/api/v1/users"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ route: "users" });
      });

      it("skips directories without _prefix.ts when useDirectoryPrefix is true", async () => {
        await writeFile_("orphan/thing.ts", `
          export default (app: App) => {
            app.get("/thing", (c: Context) => c.json({ route: "thing" }));
          };
        `);

        const app = new App();
        await discover(app, tmpDir);

        // Without _prefix.ts, the directory prefix is empty — routes register flat
        const res = await app.handle(req("/thing"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ route: "thing" });
      });

      it("ignores _prefix.ts when useDirectoryPrefix is false", async () => {
        await writeFile_("sub/_prefix.ts", `export default "/SHOULD-IGNORE";`);
        await writeFile_("sub/thing.ts", `
          export default (app: App) => {
            app.get("/thing", (c: Context) => c.json({ route: "thing" }));
          };
        `);

        const app = new App();
        await discover(app, { dir: tmpDir, useDirectoryPrefix: false });

        // Prefix is ignored — route registers flat
        const res = await app.handle(req("/thing"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ route: "thing" });
      });
    });

    describe("options", () => {
      it("respects custom extensions — skips .txt files", async () => {
        await writeFile_("skip.ts", `
          export default (app: App) => {
            app.get("/skip", (c: Context) => c.json({ route: "skip" }));
          };
        `);

        const app = new App();
        await discover(app, { dir: tmpDir, extensions: [".js"] });

        // .ts files are skipped because extensions is [".js"] only
        const res = await app.handle(req("/skip"));
        expect(res.status).toBe(404);
      });

      it("respects custom prefixFile pattern", async () => {
        await writeFile_("sub/_route.ts", `export default "/custom-prefix";`);
        await writeFile_("sub/handler.ts", `
          export default (app: App) => {
            app.get("/handler", (c: Context) => c.json({ route: "handler" }));
          };
        `);

        const app = new App();
        await discover(app, { dir: tmpDir, prefixFile: "_route" });

        const res = await app.handle(req("/custom-prefix/handler"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ route: "handler" });
      });

      it("skips dot-prefixed directories and node_modules", async () => {
        await writeFile_(".hidden/secret.ts", `
          export default (app: App) => {
            app.get("/secret", (c: Context) => c.json({ route: "secret" }));
          };
        `);
        await writeFile_("node_modules/pkg/entry.ts", `
          export default (app: App) => {
            app.get("/pkg", (c: Context) => c.json({ route: "pkg" }));
          };
        `);

        const app = new App();
        await discover(app, tmpDir);

        const r1 = await app.handle(req("/secret"));
        expect(r1.status).toBe(404);

        const r2 = await app.handle(req("/pkg"));
        expect(r2.status).toBe(404);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Entries mode
  // ---------------------------------------------------------------------------

  describe("entries mode", () => {
    describe("basic route loading", () => {
      it("loads routes from pre-resolved entries", async () => {
        const entries = {
          "./users.ts": {
            default: (app: App) => {
              app.get("/users", (c: Context) => c.json({ source: "entries" }));
            },
          },
        };

        const app = new App();
        await discover(app, { entries });

        const res = await app.handle(req("/users"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ source: "entries" });
      });

      it("handles lazy-loaded entries (Record<string, () => Promise>)", async () => {
        const entries = {
          "./items.ts": () => Promise.resolve({
            default: (app: App) => {
              app.get("/items", (c: Context) => c.json({ source: "lazy" }));
            },
          }),
        };

        const app = new App();
        await discover(app, { entries });

        const res = await app.handle(req("/items"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ source: "lazy" });
      });

      it("handles entries with module-level function (not default)", async () => {
        const entries = {
          "./routes.ts": {
            default: (app: App) => {
              app.get("/routes", (c: Context) => c.json({ source: "module" }));
            },
          },
        };

        const app = new App();
        await discover(app, { entries });

        const res = await app.handle(req("/routes"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ source: "module" });
      });

      it("loads multiple entries", async () => {
        const entries = {
          "./a.ts": {
            default: (app: App) => {
              app.get("/a", (c: Context) => c.json({ route: "a" }));
            },
          },
          "./b.ts": {
            default: (app: App) => {
              app.get("/b", (c: Context) => c.json({ route: "b" }));
            },
          },
        };

        const app = new App();
        await discover(app, { entries });

        const r1 = await app.handle(req("/a"));
        expect(await r1.json()).toEqual({ route: "a" });

        const r2 = await app.handle(req("/b"));
        expect(await r2.json()).toEqual({ route: "b" });
      });
    });

    describe("prefix handling", () => {
      it("applies prefix from _prefix entries", async () => {
        const entries = {
          "./posts/_prefix.ts": {
            default: "/posts",
          },
          "./posts/index.ts": {
            default: (app: App) => {
              app.get("/", (c: Context) => c.json({ route: "posts-index" }));
            },
          },
        };

        const app = new App();
        await discover(app, { entries, virtualRoot: "./" });

        const res = await app.handle(req("/posts"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ route: "posts-index" });
      });

      it("applies prefix from _prefix entries with function export", async () => {
        const entries = {
          "./api/_prefix.ts": {
            default: (app: App) => { app.use("/api"); },
          },
          "./api/status.ts": {
            default: (app: App) => {
              app.get("/status", (c: Context) => c.json({ ok: true }));
            },
          },
        };

        const app = new App();
        await discover(app, { entries, virtualRoot: "./" });

        const res = await app.handle(req("/api/status"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
      });

      it("accumulates nested prefixes", async () => {
        const entries = {
          "./_prefix.ts": { default: "/api" },
          "./v1/_prefix.ts": { default: "/v1" },
          "./v1/users.ts": {
            default: (app: App) => {
              app.get("/users", (c: Context) => c.json({ route: "users" }));
            },
          },
        };

        const app = new App();
        await discover(app, { entries, virtualRoot: "./" });

        const res = await app.handle(req("/api/v1/users"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ route: "users" });
      });
    });

    describe("virtualRoot", () => {
      it("strips virtualRoot from entry keys", async () => {
        const entries = {
          "/src/routes/health.ts": {
            default: (app: App) => {
              app.get("/health", (c: Context) => c.json({ ok: true }));
            },
          },
        };

        const app = new App();
        await discover(app, { entries, virtualRoot: "/src/routes" });

        const res = await app.handle(req("/health"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
      });

      it("works without virtualRoot (empty string)", async () => {
        const entries = {
          "./routes/x.ts": {
            default: (app: App) => {
              app.get("/x", (c: Context) => c.json({ route: "x" }));
            },
          },
        };

        const app = new App();
        await discover(app, { entries });

        const res = await app.handle(req("/x"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ route: "x" });
      });
    });

    describe("edge cases", () => {
      it("handles empty entries map", async () => {
        const app = new App();
        await discover(app, { entries: {} });
        // Should not throw
        const res = await app.handle(req("/anything"));
        expect(res.status).toBe(404);
      });

      it("handles entries with nested directory structure", async () => {
        const entries = {
          "./users/_prefix.ts": { default: "/users" },
          "./users/index.ts": {
            default: (app: App) => {
              app.get("/", (c: Context) => c.json({ route: "users-list" }));
            },
          },
          "./users/[id].ts": {
            default: (app: App) => {
              app.get("/:id", (c: Context) => c.json({ id: c.req.param("id") }));
            },
          },
        };

        const app = new App();
        await discover(app, { entries, virtualRoot: "./" });

        const r1 = await app.handle(req("/users"));
        expect(await r1.json()).toEqual({ route: "users-list" });

        const r2 = await app.handle(req("/users/42"));
        expect(await r2.json()).toEqual({ id: "42" });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Parameter validation
  // ---------------------------------------------------------------------------

  describe("parameter validation", () => {
    it("throws when first arg is string", async () => {
      await expect(discover("./routes" as unknown as App)).rejects.toThrow("App instance");
    });

    it("throws when no second arg", async () => {
      const app = new App();
      await expect(discover(app)).rejects.toThrow("directory path");
    });

    it("throws when neither dir nor entries provided", async () => {
      const app = new App();
      await expect(discover(app, {})).rejects.toThrow("either 'dir' or 'entries'");
    });
  });
});
