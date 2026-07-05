# @nodalite/core

The foundation of Nodalite. Zero runtime dependencies.

```
npm install @nodalite/core
```

## App

The main application class. Configures routes, middleware, and error handling.

```ts
import { App } from '@nodalite/core';

const app = new App({ name: 'my-api' });
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | `"nodalite-app"` | Service name used in error logs |

### Methods

#### `use(pathOrMiddleware, middleware?)`

Register global middleware. If `pathOrMiddleware` is a string, the middleware
only applies to matching paths.

```ts
app.use('*', cors());                          // all paths
app.use('/api/*', authMiddleware);             // prefixed
app.use(logger());                             // shorthand for '*'
```

#### `get | post | put | patch | delete | all(path, handler, middlewares?)`

Register a route handler with optional route-scoped middleware.

```ts
app.get('/users/:id', handler);
app.post('/users', validate(schema), handler);
```

#### `on(method, path, handler, middlewares?)`

Register a route with a custom HTTP method.

#### `group(prefix, build)`

Group routes under a shared prefix.

```ts
app.group('/api/v1', (g) => {
  g.use(auth);
  g.get('/users', list);
});
```

#### `onError(handler)`

Override the default error handler. Receives `(err, c)`.

#### `notFound(handler)`

Override the default 404 handler.

#### `handle(request, platform?)`

The single entrypoint. Adapters call this. Returns `Promise<Response>`.

#### `fetch(request, platform?)`

Alias for `handle`, matching the Fetch API convention used by Bun, Deno, and
Workers.

## Context

The object every middleware and handler receives.

```ts
import { Context } from '@nodalite/core';
```

### Properties

| Property | Type | Description |
|---|---|---|
| `c.req` | `RequestFacade` | Typed request wrapper |
| `c.platform` | `Record<string, unknown>` | Adapter-supplied platform info |

### Methods

| Method | Description |
|---|---|
| `c.set(key, value)` | Store a value for the request lifetime |
| `c.get(key)` | Retrieve a stored value |
| `c.header(name, value)` | Queue a response header |
| `c.status(code)` | Set the response status code |
| `c.json(data, init?)` | Send JSON response |
| `c.text(data, init?)` | Send plain text response |
| `c.html(data, init?)` | Send HTML response |
| `c.redirect(location, status?)` | Redirect (default 302) |
| `c.noContent()` | Send 204 No Content |
| `c.stream(body, init?)` | Send a streaming response |

### RequestFacade (`c.req`)

| Method | Description |
|---|---|
| `c.req.param(name)` | Typed route param (`/users/:id` → `param('id')`) |
| `c.req.query(name)` | Query string parameter |
| `c.req.queryAll(name)` | All values for a query parameter |
| `c.req.header(name)` | Request header value |
| `c.req.json()` | Parsed JSON body (cached) |
| `c.req.text()` | Raw text body (cached) |
| `c.req.formData()` | Form data body |
| `c.req.arrayBuffer()` | Binary body |
| `c.req.bodyStream` | Raw `ReadableStream` for piping |

## HttpError

Standardized HTTP errors that the framework handles automatically.

```ts
import { HttpError, isHttpError } from '@nodalite/core';

throw HttpError.notFound('User not found');
throw HttpError.badRequest('Invalid input');
throw HttpError.unauthorized('Login required');
throw HttpError.forbidden('Not allowed');
throw HttpError.conflict('Already exists');
throw HttpError.internal('Unexpected error'); // defaults to non-exposed
throw new HttpError(418, "I'm a teapot", { expose: true });
```

### Properties

| Property | Type | Description |
|---|---|---|
| `status` | `number` | HTTP status code |
| `message` | `string` | Human-readable message |
| `expose` | `boolean` | Whether to expose details to the client |

## compose

The middleware composition utility. Used internally by `App`, but also
exported for advanced use cases.

```ts
import { compose } from '@nodalite/core';

const chain = compose([middleware1, middleware2], finalHandler);
await chain(context);
```

## validate

Standard-Schema-based request body validation. Works with Zod 3.24+,
Valibot, ArkType, etc.

```ts
import { validate } from '@nodalite/core';
import { z } from 'zod';

const schema = z.object({ name: z.string() });

app.post('/users', validate(schema), (c) => {
  const { name } = c.req.params; // validated and typed
  return c.json({ name });
});
```

On validation failure, returns a 400 response with structured issues.
