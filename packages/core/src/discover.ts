import type { App } from "./app.js";

export interface DiscoverOptions {
  /** Directory to scan for route files. Relative to the working directory. Mutually exclusive with `entries`. */
  dir?: string;
  /** Pre-resolved route modules. Keys are virtual file paths (e.g. `"./routes/users.ts"`). Mutually exclusive with `dir`. */
  entries?: Record<string, RouteEntryModule>;
  /** Virtual root prefix to strip from entry keys before processing. */
  virtualRoot?: string;
  /** File extensions to include. Defaults to [".ts", ".js", ".mts", ".mjs"]. */
  extensions?: string[];
  /** Whether to use directory names as route prefixes. Defaults to true. */
  useDirectoryPrefix?: boolean;
  /** Pattern for files that define a prefix for their directory. Defaults to "_prefix". */
  prefixFile?: string;
}

type RouteModule = ((app: App) => void | Promise<void>) | { default: (app: App) => void | Promise<void> };
type RouteEntryModule = RouteModule | { default: string } | (() => Promise<RouteModule>);

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
  if (typeof appOrDir === "string") {
    throw new Error("discover() requires an App instance as the first argument: discover(app, './routes')");
  }
  const app = appOrDir;

  let opts: DiscoverOptions;
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

  if (opts.entries) {
    await discoverFromEntries(app, opts.entries, opts.virtualRoot ?? "", extensions, useDirPrefix, prefixFile);
  } else if (opts.dir) {
    await loadDirectory(app, opts.dir, extensions, useDirPrefix, prefixFile, "");
  } else {
    throw new Error("discover() requires either 'dir' or 'entries'");
  }
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
          const captured = capturePrefix(fn);
          if (captured) dirPrefix = captured;
        } else if (typeof fn === "string") {
          dirPrefix = fn;
        }
      }
    }
  }

  const currentPrefix = parentPrefix + dirPrefix;

  // Load route files (non-prefix files)
  for (const entry of entries) {
    if (entry.isFile() && entry.name.slice(0, entry.name.lastIndexOf('.')) !== prefixFile && extensions.has(getExtension(entry.name))) {
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

// ---------------------------------------------------------------------------
// Entries mode
// ---------------------------------------------------------------------------

interface VirtualNode {
  name: string;
  module?: RouteEntryModule;
  children: Map<string, VirtualNode>;
}

async function discoverFromEntries(
  app: App,
  entries: Record<string, RouteEntryModule>,
  virtualRoot: string,
  extensions: Set<string>,
  useDirPrefix: boolean,
  prefixFile: string,
): Promise<void> {
  const root: VirtualNode = { name: "", children: new Map() };

  for (const [key, mod] of Object.entries(entries)) {
    let normalizedKey = key;
    if (virtualRoot && normalizedKey.startsWith(virtualRoot)) {
      normalizedKey = normalizedKey.slice(virtualRoot.length);
    }
    normalizedKey = normalizedKey.replace(/^\.\//, "").replace(/^\//, "");

    const parts = normalizedKey.split("/").filter(Boolean);
    if (parts.length === 0) continue;

    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isFile = i === parts.length - 1 && extensions.has(getExtension(part));

      if (isFile) {
        current.children.set(part, { name: part, module: mod, children: new Map() });
      } else {
        if (!current.children.has(part)) {
          current.children.set(part, { name: part, children: new Map() });
        }
        current = current.children.get(part)!;
      }
    }
  }

  await loadVirtualDirectory(app, root, extensions, useDirPrefix, prefixFile, "");
}

async function loadVirtualDirectory(
  app: App,
  dir: VirtualNode,
  extensions: Set<string>,
  useDirPrefix: boolean,
  prefixFile: string,
  parentPrefix: string,
): Promise<void> {
  let dirPrefix = "";

  if (useDirPrefix) {
    for (const child of dir.children.values()) {
      if (child.module && child.name.startsWith(prefixFile) && extensions.has(getExtension(child.name))) {
        const resolved = await resolveModuleEntry(child.module);
        const fn = typeof resolved === "function" ? resolved : resolved.default;
        if (typeof fn === "function") {
          const captured = capturePrefix(fn);
          if (captured) dirPrefix = captured;
        } else if (typeof fn === "string") {
          dirPrefix = fn;
        }
      }
    }
  }

  const currentPrefix = parentPrefix + dirPrefix;

  for (const child of dir.children.values()) {
    if (child.module && child.name.slice(0, child.name.lastIndexOf('.')) !== prefixFile && extensions.has(getExtension(child.name))) {
      const resolved = await resolveModuleEntry(child.module);
      const fn = typeof resolved === "function" ? resolved : resolved.default;
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

    if (!child.module && child.children.size > 0) {
      await loadVirtualDirectory(app, child, extensions, useDirPrefix, prefixFile, currentPrefix);
    }
  }
}

async function resolveModuleEntry(entry: RouteEntryModule): Promise<RouteModule | { default: string }> {
  if (typeof entry === "function" && !("default" in entry)) {
    return (entry as () => Promise<RouteModule>)();
  }
  return entry as RouteModule | { default: string };
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
