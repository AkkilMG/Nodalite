import type { App, Handler, Middleware, HttpMethod, Context } from "@nodalite/core";
import type { OpenAPIOptions, RouteOptions, StoredRoute } from "./types.js";
import { generateSpec } from "./spec.js";
import { swaggerUIHTML, redocHTML } from "./templates.js";

export class OpenAPIApp<Env extends Record<string, unknown> = Record<string, unknown>> {
  private routes: StoredRoute<Env>[] = [];
  private app: App<Env>;
  private options: OpenAPIOptions;

  constructor(app: App<Env>, options: OpenAPIOptions) {
    this.app = app;
    this.options = options;

    const specPath = options.specPath ?? "/openapi.json";
    const docsPath = options.docsPath ?? "/swagger";
    const redocPath = options.redocPath ?? "/redoc";
    const title = options.info.title;

    this.app.get(specPath, () => {
      const doc = generateSpec(this.routes, this.options);
      return new Response(JSON.stringify(doc, null, 2), {
        headers: { "content-type": "application/json" },
      });
    });

    this.app.get(docsPath, () => {
      return new Response(swaggerUIHTML(specPath, title), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    });

    this.app.get(redocPath, () => {
      return new Response(redocHTML(specPath, title), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    });

    this.app.reserve(specPath);
    this.app.reserve(docsPath);
    this.app.reserve(redocPath);
  }

  get(path: string, handler: Handler<Env>, opts?: RouteOptions<Env>): this {
    return this.add("GET", path, handler, opts);
  }

  post(path: string, handler: Handler<Env>, opts?: RouteOptions<Env>): this {
    return this.add("POST", path, handler, opts);
  }

  put(path: string, handler: Handler<Env>, opts?: RouteOptions<Env>): this {
    return this.add("PUT", path, handler, opts);
  }

  patch(path: string, handler: Handler<Env>, opts?: RouteOptions<Env>): this {
    return this.add("PATCH", path, handler, opts);
  }

  delete(path: string, handler: Handler<Env>, opts?: RouteOptions<Env>): this {
    return this.add("DELETE", path, handler, opts);
  }

  all(path: string, handler: Handler<Env>, opts?: RouteOptions<Env>): this {
    return this.add("ALL", path, handler, opts);
  }

  use(middleware: Middleware<Env>): this;
  use(path: string, middleware: Middleware<Env>): this;
  use(path: string | Middleware<Env>, middleware?: Middleware<Env>): this {
    if (typeof path === "function") {
      this.app.use("*", path);
    } else {
      this.app.use(path, middleware!);
    }
    return this;
  }

  onError(handler: (err: unknown, c: Context<Env>) => Response | Promise<Response>): this {
    this.app.onError(handler as never);
    return this;
  }

  notFound(handler: Handler<Env>): this {
    this.app.notFound(handler);
    return this;
  }

  group(prefix: string, build: (g: OpenAPIRouteGroup<Env>) => void): this {
    const group = new OpenAPIRouteGroup(this.app, this.routes, prefix);
    build(group);
    return this;
  }

  private add(method: HttpMethod, path: string, handler: Handler<Env>, opts?: RouteOptions<Env>): this {
    const mws = opts?.middlewares ?? [];
    this.app.on(method, path, handler, mws);

    if (opts?.openapi) {
      this.routes.push({
        method,
        path,
        handler,
        middlewares: mws,
        openapi: {
          ...opts.openapi,
          path,
          method,
        },
      });
    }

    return this;
  }
}

export class OpenAPIRouteGroup<Env extends Record<string, unknown> = Record<string, unknown>> {
  private routes: StoredRoute<Env>[];
  private prefix: string;
  private app: App<Env>;

  constructor(app: App<Env>, routes: StoredRoute<Env>[], prefix: string) {
    this.app = app;
    this.routes = routes;
    this.prefix = prefix;
  }

  use(middleware: Middleware<Env>): this {
    this.app.use(joinPath(this.prefix, "*"), middleware);
    return this;
  }

  get(path: string, handler: Handler<Env>, opts?: RouteOptions<Env>): this {
    return this.add("GET", path, handler, opts);
  }

  post(path: string, handler: Handler<Env>, opts?: RouteOptions<Env>): this {
    return this.add("POST", path, handler, opts);
  }

  put(path: string, handler: Handler<Env>, opts?: RouteOptions<Env>): this {
    return this.add("PUT", path, handler, opts);
  }

  patch(path: string, handler: Handler<Env>, opts?: RouteOptions<Env>): this {
    return this.add("PATCH", path, handler, opts);
  }

  delete(path: string, handler: Handler<Env>, opts?: RouteOptions<Env>): this {
    return this.add("DELETE", path, handler, opts);
  }

  private add(method: HttpMethod, path: string, handler: Handler<Env>, opts?: RouteOptions<Env>): this {
    const fullPath = joinPath(this.prefix, path);
    const mws = opts?.middlewares ?? [];
    this.app.on(method, fullPath, handler, mws);

    if (opts?.openapi) {
      this.routes.push({
        method,
        path: fullPath,
        handler,
        middlewares: mws,
        openapi: {
          ...opts.openapi,
          path: fullPath,
          method,
        },
      });
    }

    return this;
  }
}

export function openapi<Env extends Record<string, unknown> = Record<string, unknown>>(
  app: App<Env>,
  options: OpenAPIOptions
): OpenAPIApp<Env> {
  return new OpenAPIApp(app, options);
}

function joinPath(prefix: string, path: string): string {
  const p = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const s = path.startsWith("/") ? path : `/${path}`;
  return `${p}${s}` || "/";
}
