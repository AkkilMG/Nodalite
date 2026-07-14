---
description: API reference for HttpError: typed HTTP errors with factory methods, expose flag, structured JSON responses, and custom error handlers.
---

# Errors

## HttpError

Typed HTTP error class. Throw it in handlers or middleware and the error
pipeline converts it to a structured JSON response.

```ts
import { HttpError } from '@nodalite/core';

app.get('/admin', (c) => {
  const user = c.get('user');
  if (!user) throw HttpError.unauthorized('Login required');
  if (user.role !== 'admin') throw HttpError.forbidden();
  return c.json({ ok: true });
});
```

### Properties

| Property | Type | Description |
|---|---|---|
| `status` | `number` | HTTP status code |
| `message` | `string` | Error message |
| `expose` | `boolean` | Whether the message is safe to send to clients (`true` for 4xx, `false` for 5xx) |
| `details` | `unknown \| undefined` | Optional structured error details |

### Factory methods

| Method | Status | Default message | Notes |
|---|---|---|---|
| `badRequest(message?, details?)` | 400 | `"Bad Request"` | Accepts optional `details` object |
| `unauthorized(message?)` | 401 | `"Unauthorized"` | |
| `forbidden(message?)` | 403 | `"Forbidden"` | |
| `notFound(message?)` | 404 | `"Not Found"` | |
| `conflict(message?)` | 409 | `"Conflict"` | |
| `tooManyRequests(message?, retryAfterSeconds?)` | 429 | `"Too Many Requests"` | Includes `retryAfterSeconds` in details |
| `requestTimeout(message?)` | 408 | `"Request Timeout"` | |
| `unsupportedMediaType(message?)` | 415 | `"Unsupported Media Type"` | |
| `serviceUnavailable(message?)` | 503 | `"Service Unavailable"` | Not exposed to clients |
| `internal(message?, cause?)` | 500 | `"Internal Server Error"` | Not exposed to clients |

### Response format

Errors are serialized to JSON:

```json
{
  "error": "Unauthorized",
  "status": 401
}
```

For `badRequest` with details:

```json
{
  "error": "Validation failed",
  "status": 400,
  "details": { "field": "email", "reason": "invalid" }
}
```

The `expose` flag controls whether the message is sent to clients. 5xx errors
default to `expose: false`, so clients see `"Internal Server Error"` instead of
the actual message.

### Custom error handler

Override the default error pipeline with `app.onError()`:

```ts
app.onError((err, c) => {
  if (isHttpError(err)) {
    return c.json(err.toJSON(), { status: err.status });
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal Server Error' }, { status: 500 });
});
```

### Type guard

```ts
import { isHttpError } from '@nodalite/core';

if (isHttpError(err)) {
  console.log(err.status, err.message, err.details);
}
```
