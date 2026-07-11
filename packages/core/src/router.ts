import type { Handler, HttpMethod, Middleware, RouteMatch } from "./types.js";

interface Node<Env extends Record<string, unknown>> {
  static: Map<string, Node<Env>>;
  paramName?: string;
  paramChild?: Node<Env>;
  wildcardChild?: Node<Env>;
  handlers: Map<HttpMethod, Handler<Env>>;
  middlewares: Middleware<Env>[];
}

function createNode<Env extends Record<string, unknown>>(): Node<Env> {
  return { static: new Map(), handlers: new Map(), middlewares: [] };
}

/**
 * A small trie (prefix tree) router. Supports:
 *  - static segments: /users/active
 *  - params:          /users/:id
 *  - wildcards:       /files/*             (captured as params['*'])
 *
 * Deliberately not regex-based: trie lookup is O(path segments), which keeps
 * routing cost flat and predictable even with thousands of routes — matters
 * on cold starts where every millisecond of setup/lookup counts.
 */
export class Router<Env extends Record<string, unknown> = Record<string, unknown>> {
  private root: Node<Env> = createNode<Env>();
  private reservedPaths = new Set<string>();

  reserve(path: string): void {
    this.reservedPaths.add(normalizeReservePath(path));
  }

  isReserved(path: string): boolean {
    return this.reservedPaths.has(normalizeReservePath(path));
  }

  add(method: HttpMethod, path: string, handler: Handler<Env>, middlewares: Middleware<Env>[] = []): void {
    if (this.isReserved(path)) {
      const suggestion = suggestAlternative(path, this.reservedPaths);
      console.warn(
        `[Nodalite] Route "${method} ${path}" is reserved and cannot be overridden. ` +
          `Please use a different path (e.g. "${suggestion}").`
      );
      return;
    }

    const segments = splitPath(path);
    let node = this.root;

    for (const segment of segments) {
      if (segment === "*") {
        node.wildcardChild ??= createNode<Env>();
        node = node.wildcardChild;
      } else if (segment.startsWith(":")) {
        node.paramChild ??= createNode<Env>();
        node.paramName = segment.slice(1);
        node = node.paramChild;
      } else {
        if (!node.static.has(segment)) node.static.set(segment, createNode<Env>());
        node = node.static.get(segment)!;
      }
    }

    node.handlers.set(method, handler);
    node.middlewares = middlewares;
  }

  match(method: HttpMethod, path: string): RouteMatch<Env> | null {
    const segments = splitPath(path);
    const params: Record<string, string> = {};
    const node = this.walk(this.root, segments, 0, params);
    if (!node) return null;

    const handler = node.handlers.get(method) ?? node.handlers.get("ALL");
    if (!handler) return null;

    return { handler, params, middlewares: node.middlewares };
  }

  private walk(node: Node<Env>, segments: string[], i: number, params: Record<string, string>): Node<Env> | null {
    if (i === segments.length) return node.handlers.size > 0 ? node : null;

    const segment = segments[i]!;

    const staticChild = node.static.get(segment);
    if (staticChild) {
      const result = this.walk(staticChild, segments, i + 1, params);
      if (result) return result;
    }

    if (node.paramChild && node.paramName) {
      params[node.paramName] = decodeURIComponent(segment);
      const result = this.walk(node.paramChild, segments, i + 1, params);
      if (result) return result;
      delete params[node.paramName];
    }

    if (node.wildcardChild) {
      params["*"] = segments.slice(i).join("/");
      return node.wildcardChild.handlers.size > 0 ? node.wildcardChild : null;
    }

    return null;
  }
}

function splitPath(path: string): string[] {
  const trimmed = path.split("?")[0]!.replace(/^\/+|\/+$/g, "");
  return trimmed.length === 0 ? [] : trimmed.split("/");
}

function normalizeReservePath(path: string): string {
  return path.split("?")[0]!.replace(/\/+$/, "") || "/";
}

function suggestAlternative(basePath: string, reserved: Set<string>): string {
  const stripped = basePath.replace(/-\d+$/, "");
  for (let i = 1; i < 100; i++) {
    const candidate = `${stripped}-${i}`;
    if (!reserved.has(candidate)) return candidate;
  }
  return `${stripped}-100`;
}
