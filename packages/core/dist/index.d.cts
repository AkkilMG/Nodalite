interface ContextOptions {
    request: Request;
    params: Record<string, string>;
    /** Arbitrary per-request platform info an adapter wants to expose (e.g. raw Lambda event, client IP, etc). */
    platform?: Record<string, unknown>;
}
/**
 * Thin, ergonomic wrapper around the incoming `Request`. This is what
 * `c.req` gives you: typed route params, query helpers, and cached body
 * parsers (calling `.json()` twice returns the same parsed value instead of
 * throwing "body already used").
 */
declare class RequestFacade {
    readonly raw: Request;
    readonly params: Record<string, string>;
    readonly method: string;
    private _url?;
    private _jsonCache?;
    private _textCache?;
    constructor(raw: Request, params: Record<string, string>);
    get url(): URL;
    /** Typed route param, e.g. `/users/:id` -> `c.req.param('id')`. */
    param(name: string): string | undefined;
    query(name: string): string | null;
    queryAll(name: string): string[];
    header(name: string): string | null;
    /** Parsed JSON body. Cached so multiple reads (e.g. by a validation middleware, then a handler) are safe. */
    json<T = unknown>(): Promise<T>;
    text(): Promise<string>;
    formData(): Promise<FormData>;
    arrayBuffer(): Promise<ArrayBuffer>;
    /** Raw body stream, for large uploads you want to pipe straight to storage instead of buffering. */
    get bodyStream(): ReadableStream<Uint8Array> | null;
}
/**
 * `Context` (conventionally destructured as `c`) is the single object every
 * middleware and handler receives. It's built on the standard Fetch API
 * `Request`/`Response`, so the exact same handler code runs unmodified on
 * Node, Bun, Deno, Cloudflare Workers, and AWS Lambda (via the lambda adapter).
 *
 * `Env` is a generic type param so an app can get typed `c.set`/`c.get` for
 * request-scoped values, e.g.:
 *
 * ```ts
 * type Env = { user: { id: string } };
 * const app = new App<Env>();
 * app.use('*', async (c, next) => { c.set('user', await auth(c)); return next(); });
 * app.get('/me', (c) => c.json(c.get('user')));
 * ```
 */
declare class Context<Env extends Record<string, unknown> = Record<string, unknown>> {
    readonly req: RequestFacade;
    /** Arbitrary adapter-supplied info: client IP, raw Lambda event, runtime name, etc. Not typed strictly on purpose. */
    readonly platform: Record<string, unknown>;
    private store;
    private _resHeaders;
    private _status;
    constructor(opts: ContextOptions);
    /** Set a value for the rest of this request's middleware chain. Typed against `Env`. */
    set<K extends keyof Env>(key: K, value: Env[K]): void;
    get<K extends keyof Env>(key: K): Env[K] | undefined;
    /** Queue a response header without finalizing the response yet (useful in early middleware). */
    header(name: string, value: string): this;
    status(code: number): this;
    json(data: unknown, init?: ResponseInit): Response;
    text(data: string, init?: ResponseInit): Response;
    html(data: string, init?: ResponseInit): Response;
    redirect(location: string, status?: 301 | 302 | 303 | 307 | 308): Response;
    noContent(): Response;
    stream(body: ReadableStream, init?: ResponseInit): Response;
    private respond;
}

type Next = () => Promise<Response>;
/**
 * A middleware runs before/around the route handler (onion model, like Koa
 * and Hono). It must always resolve to a `Response`: either by calling and
 * returning `next()` to continue the chain (e.g. `return next()`), or by
 * returning its own `Response` to short-circuit (e.g. an auth rejection or
 * a rate-limit 429). There's no ambiguous "returned nothing" case, so a
 * middleware can never accidentally hang a request.
 */
type Middleware<Env extends Record<string, unknown> = Record<string, unknown>> = (c: Context<Env>, next: Next) => Promise<Response>;
/** A terminal route handler. Distinguished from Middleware only by convention (it usually doesn't call next). */
type Handler<Env extends Record<string, unknown> = Record<string, unknown>> = (c: Context<Env>) => Promise<Response> | Response;
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "ALL";
interface RouteMatch<Env extends Record<string, unknown> = Record<string, unknown>> {
    handler: Handler<Env>;
    params: Record<string, string>;
    middlewares: Middleware<Env>[];
}

type ErrorHandler<Env extends Record<string, unknown>> = (err: unknown, c: Context<Env>) => Promise<Response> | Response;
interface AppOptions {
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
declare class App<Env extends Record<string, unknown> = Record<string, unknown>> {
    private router;
    private globalMiddlewares;
    private errorHandler?;
    private notFoundHandler?;
    readonly name: string;
    constructor(opts?: AppOptions);
    /** Register a middleware for all routes ('*') or a path prefix ('/api/*', '/api'). */
    use(pathOrMiddleware: string | Middleware<Env>, maybeMiddleware?: Middleware<Env>): this;
    get(path: string, handler: Handler<Env>, middlewares?: Middleware<Env>[]): this;
    post(path: string, handler: Handler<Env>, middlewares?: Middleware<Env>[]): this;
    put(path: string, handler: Handler<Env>, middlewares?: Middleware<Env>[]): this;
    patch(path: string, handler: Handler<Env>, middlewares?: Middleware<Env>[]): this;
    delete(path: string, handler: Handler<Env>, middlewares?: Middleware<Env>[]): this;
    all(path: string, handler: Handler<Env>, middlewares?: Middleware<Env>[]): this;
    on(method: HttpMethod, path: string, handler: Handler<Env>, middlewares?: Middleware<Env>[]): this;
    /** Group routes under a shared prefix, optionally with group-scoped middleware. */
    group(prefix: string, build: (group: RouteGroup<Env>) => void): this;
    onError(handler: ErrorHandler<Env>): this;
    notFound(handler: Handler<Env>): this;
    /**
     * The single entrypoint. Every adapter (Node, Lambda, edge) ultimately
     * just needs to convert its native request shape into a standard `Request`,
     * call this, and convert the returned `Response` back.
     */
    handle(request: Request, platform?: Record<string, unknown>): Promise<Response>;
    /** Alias matching the `fetch(request)` convention used by Bun, Deno, and Cloudflare Workers. */
    fetch: (request: Request, platform?: Record<string, unknown>) => Promise<Response>;
    private handleError;
}
/** Returned by `app.group()` to scope routes/middleware under a shared prefix. */
declare class RouteGroup<Env extends Record<string, unknown>> {
    private app;
    private prefix;
    constructor(app: App<Env>, prefix: string);
    use(middleware: Middleware<Env>): this;
    get(path: string, handler: Handler<Env>, mw?: Middleware<Env>[]): this;
    post(path: string, handler: Handler<Env>, mw?: Middleware<Env>[]): this;
    put(path: string, handler: Handler<Env>, mw?: Middleware<Env>[]): this;
    patch(path: string, handler: Handler<Env>, mw?: Middleware<Env>[]): this;
    delete(path: string, handler: Handler<Env>, mw?: Middleware<Env>[]): this;
}

/**
 * A typed HTTP error. Throw this anywhere inside a handler or middleware
 * and the App's error pipeline will turn it into a proper JSON response
 * with the right status code, instead of leaking a stack trace.
 */
declare class HttpError extends Error {
    readonly status: number;
    readonly expose: boolean;
    readonly details?: unknown;
    constructor(status: number, message: string, opts?: {
        expose?: boolean;
        details?: unknown;
        cause?: unknown;
    });
    static badRequest(message?: string, details?: unknown): HttpError;
    static unauthorized(message?: string): HttpError;
    static forbidden(message?: string): HttpError;
    static notFound(message?: string): HttpError;
    static conflict(message?: string): HttpError;
    static tooManyRequests(message?: string, retryAfterSeconds?: number): HttpError;
    static internal(message?: string, cause?: unknown): HttpError;
    toJSON(): {
        details?: {} | null | undefined;
        error: string;
        status: number;
    };
}
declare function isHttpError(err: unknown): err is HttpError;

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
declare class Router<Env extends Record<string, unknown> = Record<string, unknown>> {
    private root;
    add(method: HttpMethod, path: string, handler: Handler<Env>, middlewares?: Middleware<Env>[]): void;
    match(method: HttpMethod, path: string): RouteMatch<Env> | null;
    private walk;
}

/**
 * Composes an array of middleware plus a terminal handler into a single
 * function, using the same "onion" model as Koa/Hono: each middleware wraps
 * everything after it. `next()` resumes downstream execution and resolves
 * to the eventual Response, so code written after `await next()` runs on
 * the way back out — perfect for timing logs, wrapping errors from inner
 * handlers, or mutating response headers just before they go out.
 */
declare function compose<Env extends Record<string, unknown>>(middlewares: Middleware<Env>[], final: (c: Context<Env>) => Promise<Response>): (c: Context<Env>) => Promise<Response>;

/**
 * Minimal subset of the "Standard Schema" spec (https://standardschema.dev)
 * implemented by Zod (3.24+), Valibot, ArkType and others. Depending on this
 * tiny interface instead of a concrete library keeps `@nodalite/core` at
 * zero runtime dependencies while still giving full type inference.
 */
interface StandardSchema<Output = unknown> {
    "~standard": {
        validate(value: unknown): {
            value: Output;
            issues?: undefined;
        } | {
            value?: undefined;
            issues: ReadonlyArray<{
                message: string;
                path?: ReadonlyArray<PropertyKey | {
                    key: PropertyKey;
                }>;
            }>;
        } | Promise<{
            value: Output;
            issues?: undefined;
        } | {
            value?: undefined;
            issues: ReadonlyArray<{
                message: string;
                path?: ReadonlyArray<PropertyKey | {
                    key: PropertyKey;
                }>;
            }>;
        }>;
    };
}
type InferSchema<S> = S extends StandardSchema<infer O> ? O : never;
interface ValidateSchemas {
    body?: StandardSchema;
    query?: StandardSchema;
    params?: StandardSchema;
}
/**
 * Validates the request body / query / params against Standard-Schema
 * compatible schemas *before* the handler runs, and rejects with a 400 +
 * structured issue list otherwise. Following OWASP's "reject invalid input
 * rather than trying to sanitize it" guidance.
 *
 * ```ts
 * app.post('/users', createUser, [validate({ body: z.object({ name: z.string(), email: z.string().email() }) })]);
 * ```
 */
declare function validate<Env extends Record<string, unknown>>(schemas: ValidateSchemas): Middleware<Env>;

export { App, type AppOptions, Context, type ContextOptions, type ErrorHandler, type Handler, HttpError, type HttpMethod, type InferSchema, type Middleware, type Next, RequestFacade, RouteGroup, type RouteMatch, Router, type StandardSchema, compose, isHttpError, validate };
