# @nodalite/openapi

OpenAPI 3.1.0 spec generation, Swagger UI, and ReDoc for Nodalite —
auto-document your API, just like FastAPI.

```bash
npm install @nodalite/openapi
```

```ts
import { openapi } from '@nodalite/openapi';
```

Peer dependency: `zod` (optional — only needed if using Zod schemas for
request/response metadata).

## Quick Start

```ts
import { App } from '@nodalite/core';
import { openapi } from '@nodalite/openapi';
import { serve } from '@nodalite/adapter-node';
import { z } from 'zod';

const app = new App();
const api = openapi(app, {
  info: { title: 'My API', version: '1.0.0' },
});

api.get('/users', handler, {
  openapi: {
    summary: 'List all users',
    tags: ['Users'],
    responses: {
      200: { description: 'A list of users' },
    },
  },
});

serve(app, { port: 3000 });
```

- `GET /openapi.json` — the generated OpenAPI spec
- `GET /swagger` — Swagger UI
- `GET /redoc` — ReDoc

## `openapi(app, options)`

Factory function that wraps an existing `App` and returns an `OpenAPIApp`.

```ts
import { openapi } from '@nodalite/openapi';

const api = openapi(app, {
  info: { title: 'My API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
});
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `info` | `OpenAPIInfo` | — | API title, version, description, terms of service |
| `servers` | `OpenAPIServer[]` | `[]` | Server entries for the spec |
| `specPath` | `string` | `"/openapi.json"` | Path for the JSON spec endpoint |
| `docsPath` | `string` | `"/swagger"` | Path for the Swagger UI endpoint |
| `redocPath` | `string` | `"/redoc"` | Path for the ReDoc endpoint |

### `OpenAPIInfo`

| Property | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | yes | API title |
| `version` | `string` | yes | API version string |
| `description` | `string` | no | API description |
| `termsOfService` | `string` | no | Terms of service URL |

### `OpenAPIServer`

| Property | Type | Required | Description |
|---|---|---|---|
| `url` | `string` | yes | Server URL |
| `description` | `string` | no | Server description |

## `OpenAPIApp`

Mirrors the `App` API so adding OpenAPI metadata is a drop-in wrapper, not a
rewrite. Every route method accepts an optional `opts` parameter with an
`openapi` field for metadata.

### Route Methods

```ts
api.get(path, handler, opts?)
api.post(path, handler, opts?)
api.put(path, handler, opts?)
api.patch(path, handler, opts?)
api.delete(path, handler, opts?)
api.all(path, handler, opts?)
```

#### `RouteOptions`

| Option | Type | Description |
|---|---|---|
| `middlewares` | `Middleware[]` | Route-scoped middleware |
| `openapi` | `RouteOpenAPIMeta` | OpenAPI metadata for this route |

#### `RouteOpenAPIMeta`

| Property | Type | Description |
|---|---|---|
| `summary` | `string` | Short summary of the operation |
| `description` | `string` | Detailed description |
| `operationId` | `string` | Unique operation identifier |
| `tags` | `string[]` | Tags for grouping in the UI |
| `deprecated` | `boolean` | Mark the operation as deprecated |
| `request` | `OpenAPIRequestMeta` | Request schema metadata |
| `responses` | `Record<number, OpenAPIResponseMeta>` | Response schemas by status code |

### `use(middleware)` / `use(path, middleware)`

Register middleware on the underlying app.

```ts
api.use(cors());
api.use('/api/*', authMiddleware);
```

### `group(prefix, build)`

Register documented route groups under a shared prefix.

```ts
api.group('/users', (g) => {
  g.get('/', listHandler, {
    openapi: { summary: 'List users', tags: ['Users'] },
  });
  g.post('/', createHandler, {
    openapi: { summary: 'Create user', tags: ['Users'] },
  });
});
```

### `onError(handler)` / `notFound(handler)`

Delegate to the underlying app's error handling.

## Request Metadata

The `request` field in `RouteOpenAPIMeta` describes the shape of incoming
requests. Schemas can be Zod v3, Zod v4, raw JSON Schema objects, or anything
with a `toJSONSchema()` method.

```ts
import { z } from 'zod';

api.post('/users', createUser, {
  openapi: {
    summary: 'Create a user',
    tags: ['Users'],
    request: {
      body: z.object({
        name: z.string(),
        email: z.string().email(),
      }),
      query: z.object({
        notify: z.boolean().optional(),
      }),
      params: z.object({
        orgId: z.string(),
      }),
      headers: z.object({
        'x-api-key': z.string(),
      }),
    },
    responses: {
      201: {
        description: 'User created',
        schema: z.object({ id: z.string(), name: z.string() }),
      },
    },
  },
});
```

### `OpenAPIRequestMeta`

| Property | Type | Description |
|---|---|---|
| `body` | `unknown` | Request body schema (JSON) |
| `query` | `unknown` | Query parameter schema |
| `params` | `unknown` | Path parameter schema |
| `headers` | `unknown` | Request header schema |

### `OpenAPIResponseMeta`

| Property | Type | Description |
|---|---|---|
| `description` | `string` | Response description (required) |
| `schema` | `unknown` | Response body schema |

Path parameters (`:param` style) are auto-extracted and converted to OpenAPI
`{param}` style in the spec. Query and header schemas are converted to
individual parameter entries with the correct `in` field.

## Schema Conversion

`toOpenAPISchema(schema)` converts supported schema types to OpenAPI-compatible
JSON Schema. This function is exported for advanced use cases.

### Supported Schema Types

**Zod v3** (`_def.typeName`-based):

| Zod Type | OpenAPI Schema |
|---|---|
| `ZodString` | `{ type: "string" }` |
| `ZodNumber` | `{ type: "number" }` |
| `ZodBoolean` | `{ type: "boolean" }` |
| `ZodNull` | `{ type: "null" }` |
| `ZodDate` | `{ type: "string", format: "date-time" }` |
| `ZodLiteral` | `{ type, const }` |
| `ZodEnum` | `{ type: "string", enum }` |
| `ZodObject` | `{ type: "object", properties, required }` |
| `ZodArray` | `{ type: "array", items }` |
| `ZodOptional` | Inner schema |
| `ZodNullable` | `{ anyOf: [inner, { type: "null" }] }` |
| `ZodUnion` / `ZodDiscriminatedUnion` | `{ oneOf }` |
| `ZodRecord` | `{ type: "object", additionalProperties }` |
| `ZodDefault` | Inner schema |

**Zod v4** (`_def.type`-based):

| Zod Type | OpenAPI Schema |
|---|---|
| `string` | `{ type: "string" }` with `minLength`/`maxLength`/`pattern` |
| `number` / `integer` | `{ type: "number" }` with `minimum`/`maximum` |
| `boolean` | `{ type: "boolean" }` |
| `object` | `{ type: "object", properties, required }` |
| `array` | `{ type: "array", items }` |
| `enum` | `{ type: "string", enum }` |
| `union` | `{ oneOf }` |
| `intersection` | `{ allOf }` |
| `record` | `{ type: "object", additionalProperties }` |
| `tuple` | `{ type: "array" }` |
| `literal` | `{ type, enum }` |

**Other**:
- Zod schemas with `toJSONSchema()` — passthrough (strips `$schema` key)
- Raw JSON Schema objects — passed through directly

## `generateSpec(routes, options)`

Low-level function that generates an OpenAPI 3.1.0 document from stored route
metadata. Used internally by `OpenAPIApp` — exported for testing or custom
integrations.

```ts
import { generateSpec } from '@nodalite/openapi';

const doc = generateSpec(routes, {
  info: { title: 'My API', version: '1.0.0' },
});
// doc is an OpenAPIDocument object
```

### Behavior

- Converts `:param` route paths to `{param}` OpenAPI style
- Extracts path/query/header parameters from schemas
- Request body schemas are registered in `components.schemas` with `$ref`
  deduplication — identical schemas are referenced, not duplicated
- Schema names are auto-generated from property names (e.g., `{ name, email }`
  → `NameAndEmail`)

## `swaggerUIHTML(specURL, title)` / `redocHTML(specURL, title)`

Generate self-contained HTML pages for Swagger UI and ReDoc. Used internally to
serve the docs endpoints. Exported for custom integrations (e.g., serving from a
different path or embedding in an existing page).

```ts
import { swaggerUIHTML, redocHTML } from '@nodalite/openapi';

const html = swaggerUIHTML('/openapi.json', 'My API');
// Serve this HTML with content-type: text/html
```

## Types

```ts
import type {
  OpenAPIInfo,
  OpenAPIServer,
  OpenAPIOptions,
  OpenAPIRequestMeta,
  OpenAPIResponseMeta,
  RouteOpenAPIMeta,
  RouteOptions,
  StoredRoute,
  OpenAPIDocument,
  OpenAPIPathItem,
  OpenAPIParameter,
  OpenAPIRequestBody,
  OpenAPIResponse,
  OpenAPISchema,
} from '@nodalite/openapi';
```

### `OpenAPIDocument`

The top-level OpenAPI 3.1.0 document structure.

| Property | Type | Description |
|---|---|---|
| `openapi` | `string` | Always `"3.1.0"` |
| `info` | `OpenAPIInfo` | API information |
| `servers` | `OpenAPIServer[]` | Server entries |
| `paths` | `Record<string, Record<string, OpenAPIPathItem>>` | Path → method → operation |
| `components` | `{ schemas: Record<string, OpenAPISchema> }` | Reusable schema definitions |

## Full Example

```ts
import { App } from '@nodalite/core';
import { openapi } from '@nodalite/openapi';
import { cors, securityHeaders, jwtAuth } from '@nodalite/middleware';
import { serve } from '@nodalite/adapter-node';
import { z } from 'zod';

const app = new App();
app.use('*', securityHeaders());
app.use('*', cors({ origin: 'https://your-frontend.example' }));

const api = openapi(app, {
  info: {
    title: 'Nodalite API',
    version: '1.0.0',
    description: 'A runtime-agnostic API with auto-generated documentation.',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Development' },
  ],
});

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['admin', 'user']),
});

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
});

api.group('/users', (g) => {
  g.get('/', async (c) => {
    return c.json([{ id: '1', name: 'Alice', email: 'alice@example.com', role: 'admin' }]);
  }, {
    openapi: {
      summary: 'List all users',
      operationId: 'listUsers',
      tags: ['Users'],
      responses: {
        200: { description: 'A list of users', schema: z.array(UserSchema) },
      },
    },
  });

  g.post('/', async (c) => {
    const body = await c.req.json();
    return c.json({ id: '2', ...body }, 201);
  }, {
    middlewares: [jwtAuth({ secret: process.env.JWT_SECRET! })],
    openapi: {
      summary: 'Create a user',
      operationId: 'createUser',
      tags: ['Users'],
      request: {
        body: CreateUserSchema,
      },
      responses: {
        201: { description: 'User created', schema: UserSchema },
      },
    },
  });

  g.get('/:id', async (c) => {
    return c.json({ id: c.req.param('id'), name: 'Alice', email: 'alice@example.com', role: 'admin' });
  }, {
    openapi: {
      summary: 'Get a user by ID',
      operationId: 'getUser',
      tags: ['Users'],
      request: {
        params: z.object({ id: z.string() }),
      },
      responses: {
        200: { description: 'User found', schema: UserSchema },
        404: { description: 'User not found' },
      },
    },
  });
});

serve(app, { port: 3000 });
```

Visit:

- **`http://localhost:3000/openapi.json`** — raw OpenAPI spec
- **`http://localhost:3000/swagger`** — interactive Swagger UI
- **`http://localhost:3000/redoc`** — clean ReDoc documentation
