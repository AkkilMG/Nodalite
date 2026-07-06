import { Context } from "./context.js";
import { compose } from "./compose.js";
import { HttpError, isHttpError } from "./errors.js";
import { Router } from "./router.js";
import type { Handler, HttpMethod, Middleware } from "./types.js";

interface UseEntry<Env extends Record<string, unknown>> {
  prefix: string;
  middleware: Middleware<Env>;
}

export type ErrorHandler<Env extends Record<string, unknown>> = (
  err: unknown,
  c: Context<Env>
) => Promise<Response> | Response;

export interface AppOptions {
  /** Included in error responses / logs to identify this service. Defaults to "nodalite-app". */
  name?: string;
}

/**
 * The core of Nodalite. Deliberately small: routing, middleware, and error
 * handling — nothing about *how* requests arrive (that's the adapters'
 * job) or platform specifics. This is what makes the same `App` instance
 * runnable, unmodified, as a Node HTTP server, a Lambda function, or a
 * Cloudflare Worker.
 */
export class App<Env extends Record<string, unknown> = Record<string, unknown>> {
  private router = new Router<Env>();
  private globalMiddlewares: UseEntry<Env>[] = [];
  private errorHandler?: ErrorHandler<Env>;
  private notFoundHandler?: Handler<Env>;
  readonly name: string;

  constructor(opts: AppOptions = {}) {
    this.name = opts.name ?? "nodalite-app";
  }

  /** Register a middleware for all routes ('*') or a path prefix ('/api/*', '/api'). */
  use(pathOrMiddleware: string | Middleware<Env>, maybeMiddleware?: Middleware<Env>): this {
    const [prefix, middleware] =
      typeof pathOrMiddleware === "string" ? [pathOrMiddleware, maybeMiddleware!] : ["*", pathOrMiddleware];
    this.globalMiddlewares.push({ prefix: normalizePrefix(prefix), middleware });
    return this;
  }

  get(path: string, handler: Handler<Env>, middlewares: Middleware<Env>[] = []): this {
    return this.on("GET", path, handler, middlewares);
  }
  post(path: string, handler: Handler<Env>, middlewares: Middleware<Env>[] = []): this {
    return this.on("POST", path, handler, middlewares);
  }
  put(path: string, handler: Handler<Env>, middlewares: Middleware<Env>[] = []): this {
    return this.on("PUT", path, handler, middlewares);
  }
  patch(path: string, handler: Handler<Env>, middlewares: Middleware<Env>[] = []): this {
    return this.on("PATCH", path, handler, middlewares);
  }
  delete(path: string, handler: Handler<Env>, middlewares: Middleware<Env>[] = []): this {
    return this.on("DELETE", path, handler, middlewares);
  }
  all(path: string, handler: Handler<Env>, middlewares: Middleware<Env>[] = []): this {
    return this.on("ALL", path, handler, middlewares);
  }

  on(method: HttpMethod, path: string, handler: Handler<Env>, middlewares: Middleware<Env>[] = []): this {
    this.router.add(method, path, handler, middlewares);
    return this;
  }

  /** Group routes under a shared prefix, optionally with group-scoped middleware. */
  group(prefix: string, build: (group: RouteGroup<Env>) => void): this {
    build(new RouteGroup(this, prefix));
    return this;
  }

  onError(handler: ErrorHandler<Env>): this {
    this.errorHandler = handler;
    return this;
  }

  notFound(handler: Handler<Env>): this {
    this.notFoundHandler = handler;
    return this;
  }

  /**
   * The single entrypoint. Every adapter (Node, Lambda, edge) ultimately
   * just needs to convert its native request shape into a standard `Request`,
   * call this, and convert the returned `Response` back.
   */
  async handle(request: Request, platform?: Record<string, unknown>): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase() as HttpMethod;
    const match = this.router.match(method, url.pathname);

    const applicableGlobals = this.globalMiddlewares
      .filter((m) => matchesPrefix(m.prefix, url.pathname))
      .map((m) => m.middleware);

    const c = new Context<Env>({ request, params: match?.params ?? {}, platform });

    const finalStep = async (ctx: Context<Env>): Promise<Response> => {
      if (!match) {
        if (this.notFoundHandler) return this.notFoundHandler(ctx);
        throw HttpError.notFound(`No route for ${method} ${url.pathname}`);
      }
      return match.handler(ctx);
    };

    const chain = compose<Env>([...applicableGlobals, ...(match?.middlewares ?? [])], finalStep);

    try {
      return await chain(c);
    } catch (err) {
      return this.handleError(err, c);
    }
  }

  /** Alias matching the `fetch(request)` convention used by Bun, Deno, and Cloudflare Workers. */
  fetch = (request: Request, platform?: Record<string, unknown>): Promise<Response> => this.handle(request, platform);

  private async handleError(err: unknown, c: Context<Env>): Promise<Response> {
    if (this.errorHandler) {
      try {
        return await this.errorHandler(err, c);
      } catch (nested) {
        err = nested;
      }
    }
    const httpErr = isHttpError(err) ? err : HttpError.internal(undefined, err);
    if (!httpErr.expose) {
      // Never leak internals by default; adapters/observability plugins can
      // still log the original `err.cause` server-side.
      console.error(`[${this.name}] Unhandled error:`, err);
    }
    return c.status(httpErr.status).json(httpErr.toJSON());
  }
}

/** Returned by `app.group()` to scope routes/middleware under a shared prefix. */
export class RouteGroup<Env extends Record<string, unknown>> {
  constructor(private app: App<Env>, private prefix: string) {}

  use(middleware: Middleware<Env>): this {
    this.app.use(joinPath(this.prefix, "*"), middleware);
    return this;
  }
  get(path: string, handler: Handler<Env>, mw: Middleware<Env>[] = []): this {
    this.app.get(joinPath(this.prefix, path), handler, mw);
    return this;
  }
  post(path: string, handler: Handler<Env>, mw: Middleware<Env>[] = []): this {
    this.app.post(joinPath(this.prefix, path), handler, mw);
    return this;
  }
  put(path: string, handler: Handler<Env>, mw: Middleware<Env>[] = []): this {
    this.app.put(joinPath(this.prefix, path), handler, mw);
    return this;
  }
  patch(path: string, handler: Handler<Env>, mw: Middleware<Env>[] = []): this {
    this.app.patch(joinPath(this.prefix, path), handler, mw);
    return this;
  }
  delete(path: string, handler: Handler<Env>, mw: Middleware<Env>[] = []): this {
    this.app.delete(joinPath(this.prefix, path), handler, mw);
    return this;
  }
}

function normalizePrefix(prefix: string): string {
  if (prefix === "*" || prefix === "/*") return "*";
  return prefix.replace(/\/\*$/, "").replace(/\/+$/, "") || "/";
}

function matchesPrefix(prefix: string, pathname: string): boolean {
  if (prefix === "*") return true;
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

function joinPath(prefix: string, path: string): string {
  const p = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const s = path.startsWith("/") ? path : `/${path}`;
  return `${p}${s}` || "/";
}
