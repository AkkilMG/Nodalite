---
description: TypeScript guide for Nodalite: generics, typed route params, request body typing, Standard Schema validation, and middleware typing patterns.
---

# TypeScript Guide

Nodalite is written in TypeScript 6.0+ and designed for full type safety from
request to response.

## Generics (App and Env)

The `App` class accepts a generic `Env` parameter that types all
request-scoped values stored via `c.set()` / `c.get()`:

```ts
import { App } from '@nodalite/core';

type Env = {
  user: { id: string; role: string };
  db: DatabasePool;
};

const app = new App<Env>();
```

This propagates through the entire framework — middleware, handlers, and route
groups all share the same `Env`:

```ts
// Middleware — c.set('user', ...) is typed
const auth: Middleware<Env> = async (c, next) => {
  c.set('user', await verifyToken(c.req.header('Authorization')));
  return next();
};

// Handler — c.get('user') returns { id: string; role: string } | undefined
app.get('/me', async (c) => {
  const user = c.get('user');
  if (!user) throw HttpError.unauthorized();
  return c.json({ id: user.id, role: user.role });
});
```

Without `App<Env>`, `c.get()` returns `unknown` and `c.set()` accepts any
value.

## Typed route params

Route parameters are accessed via `c.req.param('name')` and return `string`:

```ts
app.get('/users/:id/posts/:postId', (c) => {
  const id = c.req.param('id');       // string
  const postId = c.req.param('postId'); // string
});
```

For typed params, parse them explicitly:

```ts
app.get('/users/:id', (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) throw HttpError.badRequest('Invalid user ID');
  // ...
});
```

## Request body typing

`c.req.json()` accepts a generic for typed body parsing:

```ts
interface CreateUserBody {
  name: string;
  email: string;
}

app.post('/users', async (c) => {
  const body = await c.req.json<CreateUserBody>();
  // body.name, body.email are typed
});
```

## Standard Schema validation

`validate()` works with Zod, Valibot, ArkType, and any library implementing
the [Standard Schema](https://standardschema.dev) spec:

```ts
import { validate } from '@nodalite/core';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

app.post('/users', validate(schema), async (c) => {
  const body = await c.req.json(); // typed from schema
});
```

## Middleware typing

Middleware is a function that receives `Context<Env>` and `next`, and must
return `Promise<Response>`:

```ts
import type { Middleware } from '@nodalite/core';

const logging: Middleware<Env> = async (c, next) => {
  const start = Date.now();
  const response = await next();
  console.log(`${c.req.method} ${c.req.url} — ${response.status} (${Date.now() - start}ms)`);
  return response;
};
```

## Handler typing

Handlers are terminal functions — they receive `Context<Env>` and return a
`Response`:

```ts
import type { Handler } from '@nodalite/core';

const getUser: Handler<Env> = async (c) => {
  const user = c.get('user');
  return c.json({ user });
};
```

## Error typing

Throw `HttpError` in handlers and middleware. The error pipeline catches it
and returns a structured JSON response:

```ts
import { HttpError } from '@nodalite/core';

app.get('/admin', (c) => {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    throw HttpError.forbidden('Admin access required');
  }
  return c.json({ secret: 'data' });
});
```

Use `HttpError.isHttpError()` to check in custom error handlers:

```ts
import { isHttpError } from '@nodalite/core';

app.onError((err, c) => {
  if (isHttpError(err)) {
    return c.json(err.toJSON(), { status: err.status });
  }
  return c.json({ error: 'Internal Server Error' }, { status: 500 });
});
```
