// src/context.ts
var RequestFacade = class {
  raw;
  params;
  method;
  _url;
  _jsonCache;
  _textCache;
  constructor(raw, params) {
    this.raw = raw;
    this.params = params;
    this.method = raw.method;
  }
  get url() {
    if (!this._url) this._url = new URL(this.raw.url);
    return this._url;
  }
  /** Typed route param, e.g. `/users/:id` -> `c.req.param('id')`. */
  param(name) {
    return this.params[name];
  }
  query(name) {
    return this.url.searchParams.get(name);
  }
  queryAll(name) {
    return this.url.searchParams.getAll(name);
  }
  header(name) {
    return this.raw.headers.get(name);
  }
  /** Parsed JSON body. Cached so multiple reads (e.g. by a validation middleware, then a handler) are safe. */
  async json() {
    if (!this._jsonCache) this._jsonCache = this.raw.clone().json();
    return this._jsonCache;
  }
  async text() {
    if (!this._textCache) this._textCache = this.raw.clone().text();
    return this._textCache;
  }
  async formData() {
    return this.raw.formData();
  }
  async arrayBuffer() {
    return this.raw.arrayBuffer();
  }
  /** Raw body stream, for large uploads you want to pipe straight to storage instead of buffering. */
  get bodyStream() {
    return this.raw.body;
  }
};
var Context = class {
  req;
  /** Arbitrary adapter-supplied info: client IP, raw Lambda event, runtime name, etc. Not typed strictly on purpose. */
  platform;
  store = /* @__PURE__ */ new Map();
  _resHeaders = new Headers();
  _status = 200;
  constructor(opts) {
    this.req = new RequestFacade(opts.request, opts.params);
    this.platform = opts.platform ?? {};
  }
  /** Set a value for the rest of this request's middleware chain. Typed against `Env`. */
  set(key, value) {
    this.store.set(key, value);
  }
  get(key) {
    return this.store.get(key);
  }
  /** Queue a response header without finalizing the response yet (useful in early middleware). */
  header(name, value) {
    this._resHeaders.set(name, value);
    return this;
  }
  status(code) {
    this._status = code;
    return this;
  }
  json(data, init) {
    return this.respond(JSON.stringify(data), init, "application/json; charset=utf-8");
  }
  text(data, init) {
    return this.respond(data, init, "text/plain; charset=utf-8");
  }
  html(data, init) {
    return this.respond(data, init, "text/html; charset=utf-8");
  }
  redirect(location, status = 302) {
    return this.respond(null, { status, headers: { location } });
  }
  noContent() {
    return this.respond(null, { status: 204 });
  }
  stream(body, init) {
    return this.respond(body, init);
  }
  respond(body, init, defaultContentType) {
    const headers = new Headers(this._resHeaders);
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (defaultContentType && !headers.has("content-type")) headers.set("content-type", defaultContentType);
    return new Response(body, {
      status: init?.status ?? this._status,
      statusText: init?.statusText,
      headers
    });
  }
};

// src/compose.ts
function compose(middlewares, final) {
  return function run(c) {
    let index = -1;
    function dispatch(i) {
      if (i <= index) {
        return Promise.reject(new Error("next() called multiple times in one middleware"));
      }
      index = i;
      const fn = middlewares[i];
      if (!fn) return final(c);
      return Promise.resolve(fn(c, () => dispatch(i + 1)));
    }
    return dispatch(0);
  };
}

// src/errors.ts
var HttpError = class _HttpError extends Error {
  status;
  expose;
  details;
  constructor(status, message, opts) {
    super(message, { cause: opts?.cause });
    this.name = "HttpError";
    this.status = status;
    this.expose = opts?.expose ?? status < 500;
    this.details = opts?.details;
  }
  static badRequest(message = "Bad Request", details) {
    return new _HttpError(400, message, { details, expose: true });
  }
  static unauthorized(message = "Unauthorized") {
    return new _HttpError(401, message, { expose: true });
  }
  static forbidden(message = "Forbidden") {
    return new _HttpError(403, message, { expose: true });
  }
  static notFound(message = "Not Found") {
    return new _HttpError(404, message, { expose: true });
  }
  static conflict(message = "Conflict") {
    return new _HttpError(409, message, { expose: true });
  }
  static tooManyRequests(message = "Too Many Requests", retryAfterSeconds) {
    return new _HttpError(429, message, { expose: true, details: { retryAfterSeconds } });
  }
  static internal(message = "Internal Server Error", cause) {
    return new _HttpError(500, message, { expose: false, cause });
  }
  toJSON() {
    return {
      error: this.expose ? this.message : "Internal Server Error",
      status: this.status,
      ...this.expose && this.details !== void 0 ? { details: this.details } : {}
    };
  }
};
function isHttpError(err) {
  return err instanceof HttpError;
}

// src/router.ts
function createNode() {
  return { static: /* @__PURE__ */ new Map(), handlers: /* @__PURE__ */ new Map(), middlewares: [] };
}
var Router = class {
  root = createNode();
  add(method, path, handler, middlewares = []) {
    const segments = splitPath(path);
    let node = this.root;
    for (const segment of segments) {
      if (segment === "*") {
        node.wildcardChild ??= createNode();
        node = node.wildcardChild;
      } else if (segment.startsWith(":")) {
        node.paramChild ??= createNode();
        node.paramName = segment.slice(1);
        node = node.paramChild;
      } else {
        if (!node.static.has(segment)) node.static.set(segment, createNode());
        node = node.static.get(segment);
      }
    }
    node.handlers.set(method, handler);
    node.middlewares = middlewares;
  }
  match(method, path) {
    const segments = splitPath(path);
    const params = {};
    const node = this.walk(this.root, segments, 0, params);
    if (!node) return null;
    const handler = node.handlers.get(method) ?? node.handlers.get("ALL");
    if (!handler) return null;
    return { handler, params, middlewares: node.middlewares };
  }
  walk(node, segments, i, params) {
    if (i === segments.length) return node.handlers.size > 0 ? node : null;
    const segment = segments[i];
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
};
function splitPath(path) {
  const trimmed = path.split("?")[0].replace(/^\/+|\/+$/g, "");
  return trimmed.length === 0 ? [] : trimmed.split("/");
}

// src/app.ts
var App = class {
  router = new Router();
  globalMiddlewares = [];
  errorHandler;
  notFoundHandler;
  name;
  constructor(opts = {}) {
    this.name = opts.name ?? "nodalite-app";
  }
  /** Register a middleware for all routes ('*') or a path prefix ('/api/*', '/api'). */
  use(pathOrMiddleware, maybeMiddleware) {
    const [prefix, middleware] = typeof pathOrMiddleware === "string" ? [pathOrMiddleware, maybeMiddleware] : ["*", pathOrMiddleware];
    this.globalMiddlewares.push({ prefix: normalizePrefix(prefix), middleware });
    return this;
  }
  get(path, handler, middlewares = []) {
    return this.on("GET", path, handler, middlewares);
  }
  post(path, handler, middlewares = []) {
    return this.on("POST", path, handler, middlewares);
  }
  put(path, handler, middlewares = []) {
    return this.on("PUT", path, handler, middlewares);
  }
  patch(path, handler, middlewares = []) {
    return this.on("PATCH", path, handler, middlewares);
  }
  delete(path, handler, middlewares = []) {
    return this.on("DELETE", path, handler, middlewares);
  }
  all(path, handler, middlewares = []) {
    return this.on("ALL", path, handler, middlewares);
  }
  on(method, path, handler, middlewares = []) {
    this.router.add(method, path, handler, middlewares);
    return this;
  }
  /** Group routes under a shared prefix, optionally with group-scoped middleware. */
  group(prefix, build) {
    build(new RouteGroup(this, prefix));
    return this;
  }
  onError(handler) {
    this.errorHandler = handler;
    return this;
  }
  notFound(handler) {
    this.notFoundHandler = handler;
    return this;
  }
  /**
   * The single entrypoint. Every adapter (Node, Lambda, edge) ultimately
   * just needs to convert its native request shape into a standard `Request`,
   * call this, and convert the returned `Response` back.
   */
  async handle(request, platform) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const match = this.router.match(method, url.pathname);
    const applicableGlobals = this.globalMiddlewares.filter((m) => matchesPrefix(m.prefix, url.pathname)).map((m) => m.middleware);
    const c = new Context({ request, params: match?.params ?? {}, platform });
    const finalStep = async (ctx) => {
      if (!match) {
        if (this.notFoundHandler) return this.notFoundHandler(ctx);
        throw HttpError.notFound(`No route for ${method} ${url.pathname}`);
      }
      return match.handler(ctx);
    };
    const chain = compose([...applicableGlobals, ...match?.middlewares ?? []], finalStep);
    try {
      return await chain(c);
    } catch (err) {
      return this.handleError(err, c);
    }
  }
  /** Alias matching the `fetch(request)` convention used by Bun, Deno, and Cloudflare Workers. */
  fetch = (request, platform) => this.handle(request, platform);
  async handleError(err, c) {
    if (this.errorHandler) {
      try {
        return await this.errorHandler(err, c);
      } catch (nested) {
        err = nested;
      }
    }
    const httpErr = isHttpError(err) ? err : HttpError.internal(void 0, err);
    if (!httpErr.expose) {
      console.error(`[${this.name}] Unhandled error:`, err);
    }
    return c.status(httpErr.status).json(httpErr.toJSON());
  }
};
var RouteGroup = class {
  constructor(app, prefix) {
    this.app = app;
    this.prefix = prefix;
  }
  app;
  prefix;
  use(middleware) {
    this.app.use(joinPath(this.prefix, "*"), middleware);
    return this;
  }
  get(path, handler, mw = []) {
    this.app.get(joinPath(this.prefix, path), handler, mw);
    return this;
  }
  post(path, handler, mw = []) {
    this.app.post(joinPath(this.prefix, path), handler, mw);
    return this;
  }
  put(path, handler, mw = []) {
    this.app.put(joinPath(this.prefix, path), handler, mw);
    return this;
  }
  patch(path, handler, mw = []) {
    this.app.patch(joinPath(this.prefix, path), handler, mw);
    return this;
  }
  delete(path, handler, mw = []) {
    this.app.delete(joinPath(this.prefix, path), handler, mw);
    return this;
  }
};
function normalizePrefix(prefix) {
  if (prefix === "*" || prefix === "/*") return "*";
  return prefix.replace(/\/\*$/, "").replace(/\/+$/, "") || "/";
}
function matchesPrefix(prefix, pathname) {
  if (prefix === "*") return true;
  return pathname === prefix || pathname.startsWith(prefix + "/");
}
function joinPath(prefix, path) {
  const p = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const s = path.startsWith("/") ? path : `/${path}`;
  return `${p}${s}` || "/";
}

// src/validate.ts
function validate(schemas) {
  return async (c, next) => {
    if (schemas.query) {
      const raw = Object.fromEntries(c.req.url.searchParams.entries());
      await runSchema(schemas.query, raw, "query");
    }
    if (schemas.params) {
      await runSchema(schemas.params, c.req.params, "params");
    }
    if (schemas.body) {
      const raw = await safeJson(c);
      await runSchema(schemas.body, raw, "body");
    }
    return next();
  };
}
async function safeJson(c) {
  try {
    return await c.req.json();
  } catch {
    throw HttpError.badRequest("Request body must be valid JSON");
  }
}
async function runSchema(schema, value, where) {
  const result = await schema["~standard"].validate(value);
  if (result.issues) {
    throw HttpError.badRequest(`Invalid ${where}`, {
      issues: result.issues.map((i) => ({ message: i.message, path: i.path }))
    });
  }
}
export {
  App,
  Context,
  HttpError,
  RequestFacade,
  RouteGroup,
  Router,
  compose,
  isHttpError,
  validate
};
