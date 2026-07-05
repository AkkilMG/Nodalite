/** Local stand-in for the DOM `BodyInit` type, which @types/node doesn't expose as a global. */
export type ResponseBody = string | ReadableStream<Uint8Array> | FormData | Blob | ArrayBuffer | URLSearchParams | null;

export interface ContextOptions {
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
export class RequestFacade {
  readonly raw: Request;
  readonly params: Record<string, string>;
  readonly method: string;

  private _url?: URL;
  private _jsonCache?: Promise<unknown>;
  private _textCache?: Promise<string>;

  constructor(raw: Request, params: Record<string, string>) {
    this.raw = raw;
    this.params = params;
    this.method = raw.method;
  }

  get url(): URL {
    if (!this._url) this._url = new URL(this.raw.url);
    return this._url;
  }

  /** Typed route param, e.g. `/users/:id` -> `c.req.param('id')`. */
  param(name: string): string | undefined {
    return this.params[name];
  }

  query(name: string): string | null {
    return this.url.searchParams.get(name);
  }

  queryAll(name: string): string[] {
    return this.url.searchParams.getAll(name);
  }

  header(name: string): string | null {
    return this.raw.headers.get(name);
  }

  /** Parsed JSON body. Cached so multiple reads (e.g. by a validation middleware, then a handler) are safe. */
  async json<T = unknown>(): Promise<T> {
    if (!this._jsonCache) this._jsonCache = this.raw.clone().json();
    return this._jsonCache as Promise<T>;
  }

  async text(): Promise<string> {
    if (!this._textCache) this._textCache = this.raw.clone().text();
    return this._textCache;
  }

  async formData(): Promise<FormData> {
    return this.raw.formData();
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.raw.arrayBuffer();
  }

  /** Raw body stream, for large uploads you want to pipe straight to storage instead of buffering. */
  get bodyStream(): ReadableStream<Uint8Array> | null {
    return this.raw.body;
  }
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
export class Context<Env extends Record<string, unknown> = Record<string, unknown>> {
  readonly req: RequestFacade;
  /** Arbitrary adapter-supplied info: client IP, raw Lambda event, runtime name, etc. Not typed strictly on purpose. */
  readonly platform: Record<string, unknown>;

  private store = new Map<string, unknown>();
  private _resHeaders = new Headers();
  private _status = 200;

  constructor(opts: ContextOptions) {
    this.req = new RequestFacade(opts.request, opts.params);
    this.platform = opts.platform ?? {};
  }

  /** Set a value for the rest of this request's middleware chain. Typed against `Env`. */
  set<K extends keyof Env>(key: K, value: Env[K]): void {
    this.store.set(key as string, value);
  }

  get<K extends keyof Env>(key: K): Env[K] | undefined {
    return this.store.get(key as string) as Env[K] | undefined;
  }

  /** Queue a response header without finalizing the response yet (useful in early middleware). */
  header(name: string, value: string): this {
    this._resHeaders.set(name, value);
    return this;
  }

  status(code: number): this {
    this._status = code;
    return this;
  }

  json(data: unknown, init?: ResponseInit): Response {
    return this.respond(JSON.stringify(data), init, "application/json; charset=utf-8");
  }

  text(data: string, init?: ResponseInit): Response {
    return this.respond(data, init, "text/plain; charset=utf-8");
  }

  html(data: string, init?: ResponseInit): Response {
    return this.respond(data, init, "text/html; charset=utf-8");
  }

  redirect(location: string, status: 301 | 302 | 303 | 307 | 308 = 302): Response {
    return this.respond(null, { status, headers: { location } });
  }

  noContent(): Response {
    return this.respond(null, { status: 204 });
  }

  stream(body: ReadableStream, init?: ResponseInit): Response {
    return this.respond(body, init);
  }

  private respond(body: ResponseBody, init: ResponseInit | undefined, defaultContentType?: string): Response {
    const headers = new Headers(this._resHeaders);
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (defaultContentType && !headers.has("content-type")) headers.set("content-type", defaultContentType);
    return new Response(body, {
      status: init?.status ?? this._status,
      statusText: init?.statusText,
      headers,
    });
  }
}
