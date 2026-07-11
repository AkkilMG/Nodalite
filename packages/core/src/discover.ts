import type { App } from "./app.js";

export interface DiscoverOptions {
  /** Directory to scan for route files. Relative to the working directory. */
  dir: string;
  /** File extensions to include. Defaults to [".ts", ".js", ".mts", ".mjs"]. */
  extensions?: string[];
  /** Whether to use directory names as route prefixes. Defaults to true. */
  useDirectoryPrefix?: boolean;
  /** Pattern for files that define a prefix for their directory. Defaults to "_prefix". */
  prefixFile?: string;
}

type RouteModule = ((app: App) => void | Promise<void>) | { default: (app: App) => void | Promise<void> };

/**
 * Auto-discovers route files from a directory and registers them on the app.
 * Each route file should export a default function that receives the app:
 *
 * ```ts
 * // routes/users.ts
 * import type { App } from "nodalite";
 * export default (app: App) => {
 *   app.get("/users", (c) => c.json({ users: [] }));
 *   app.post("/users", async (c) => { ... });
 * };
 * ```
 *
 * Subdirectories become route groups with automatic prefix detection:
 *
 * ```
 * routes/
 *   users.ts          -> app.get("/users", ...)
 *   posts/
 *     _prefix.ts      -> export default "/posts"
 *     index.ts        -> app.get("/", ...)
 *     comments.ts     -> app.get("/comments", ...)
 * ```
 *
 * ```ts
 * import { App } from "nodalite";
 * import { discover } from "@nodalite/core/discover";
 *
 * const app = new App();
 * await discover(app, "./routes");
 * ```
 *
 * Note: auto-discovery uses dynamic `import()`, which works on Node, Bun,
 * and Deno. For Cloudflare Workers or other bundled runtimes, use static
 * imports or a build-time generation step instead.
 */
export async function discover(
  appOrDir: App | string,
  optsOrDir?: string | DiscoverOptions
): Promise<void> {
  let opts: DiscoverOptions;

  if (typeof appOrDir === "string") {
    throw new Error("discover() requires an App instance as the first argument: discover(app, './routes')");
  }
  const app = appOrDir;

  if (typeof optsOrDir === "string") {
    opts = { dir: optsOrDir };
  } else if (optsOrDir) {
    opts = optsOrDir;
  } else {
    throw new Error("discover() requires a directory path as the second argument");
  }

  const extensions = new Set(opts.extensions ?? [".ts", ".js", ".mts", ".mjs"]);
  const useDirPrefix = opts.useDirectoryPrefix ?? true;
  const prefixFile = opts.prefixFile ?? "_prefix";

  await loadDirectory(app, opts.dir, extensions, useDirPrefix, prefixFile, "");
}

async function loadDirectory(
  app: App,
  dir: string,
  extensions: Set<string>,
  useDirPrefix: boolean,
  prefixFile: string,
  parentPrefix: string,
): Promise<void> {
  const fs = await import("node:fs");
  const path = await import("node:path");

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let dirPrefix = "";

  // Check for _prefix file
  if (useDirPrefix) {
    for (const entry of entries) {
      if (entry.isFile() && entry.name.startsWith(prefixFile) && extensions.has(getExtension(entry.name))) {
        const mod = await import(pathToFileURL(path.join(dir, entry.name)).href) as RouteModule;
        const fn = typeof mod === "function" ? mod : mod.default;
        if (typeof fn === "function") {
          // Execute to get the prefix string
          const captured = capturePrefix(fn);
          if (captured) dirPrefix = captured;
        }
      }
    }
  }

  const currentPrefix = parentPrefix + dirPrefix;

  // Load route files (non-prefix files)
  for (const entry of entries) {
    if (entry.isFile() && entry.name !== prefixFile && extensions.has(getExtension(entry.name))) {
      const filePath = path.join(dir, entry.name);
      const mod = await import(pathToFileURL(filePath).href) as RouteModule;
      const fn = typeof mod === "function" ? mod : mod.default;
      if (typeof fn === "function") {
        if (currentPrefix) {
          app.group(currentPrefix, (g) => {
            fn(g as unknown as App);
          });
        } else {
          await fn(app);
        }
      }
    }

    // Recurse into subdirectories
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      await loadDirectory(app, path.join(dir, entry.name), extensions, useDirPrefix, prefixFile, currentPrefix);
    }
  }
}

function capturePrefix(fn: (app: App) => void | Promise<void>): string | null {
  let prefix = "";
  const mockApp = {
    get: () => mockApp,
    post: () => mockApp,
    put: () => mockApp,
    patch: () => mockApp,
    delete: () => mockApp,
    query: () => mockApp,
    all: () => mockApp,
    on: () => mockApp,
    use: (pathOrMw: string | ((...args: unknown[]) => unknown), _?: (...args: unknown[]) => unknown) => {
      if (typeof pathOrMw === "string") prefix = pathOrMw;
      return mockApp;
    },
    group: () => mockApp,
  };
  try {
    fn(mockApp as unknown as App);
  } catch {
    // Ignore
  }
  return prefix || null;
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot);
}

function pathToFileURL(p: string): { href: string } {
  // Convert Windows backslashes to forward slashes and add file:// prefix
  const normalized = p.replace(/\\/g, "/");
  const prefix = normalized.match(/^[A-Z]:\//i) ? "file:///" : "file://";
  return { href: prefix + normalized };
}
