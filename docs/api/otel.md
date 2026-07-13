# @nodalite/otel

OpenTelemetry integration for Nodalite: built-in tracing, metrics, and context propagation for production observability.

```
npm install @nodalite/otel
```

Depends on `@nodalite/core` and `@opentelemetry/api`. You must also install an OTel SDK (e.g. `@opentelemetry/sdk-trace-node`) to export spans and metrics.

## otel()

Middleware that creates HTTP server spans and records metrics for every request. Extracts incoming trace context from headers for distributed tracing.

```ts
import { otel } from '@nodalite/otel';

app.use('*', otel({ serviceName: 'my-api' }));
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `serviceName` | `string` | `"nodalite-app"` | Service name for OTel resource |
| `tracing` | `boolean` | `true` | Enable span creation |
| `metrics` | `boolean` | `true` | Enable metric instruments |
| `recordHeaders` | `boolean` | `false` | Record request headers as span attributes |
| `recordResponseHeaders` | `boolean` | `false` | Record response headers as span attributes |
| `ignoredPaths` | `string[]` | `[]` | Paths to skip (e.g. `['/health']`) |
| `getSpanName` | `(c) => string` | HTTP method | Custom span naming function |

### Metrics recorded

The middleware automatically records these OTel instruments:

| Instrument | Type | Description |
|---|---|---|
| `http.server.request.duration` | Histogram (ms) | Request duration |
| `http.server.active_requests` | UpDownCounter | Currently active requests |
| `http.server.request.count` | Counter | Total request count |
| `http.server.request.body.size` | Histogram (By) | Request body size |
| `http.server.response.body.size` | Histogram (By) | Response body size |

All instruments include attributes: `http.request.method`, `http.response.status_code`, `http.route`.

### Span attributes

| Attribute | Description |
|---|---|
| `http.request.method` | HTTP method |
| `url.full` | Full request URL |
| `url.path` | Request path |
| `url.scheme` | Protocol (`http` or `https`) |
| `server.address` | Hostname |
| `server.port` | Port |
| `http.response.status_code` | Response status code |
| `http.request.header.*` | Request headers (when `recordHeaders: true`) |
| `http.response.header.*` | Response headers (when `recordResponseHeaders: true`) |

### Setup example

```ts
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

// Initialize OTel SDK (once, at startup)
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter()));
provider.register();

// Use in your app
import { App } from '@nodalite/core';
import { otel } from '@nodalite/otel';

const app = new App();
app.use('*', otel({ serviceName: 'my-api' }));
```

## getSpan()

Retrieve the current OTel span from the Nodalite context. Returns `undefined` if no `otel()` middleware is active.

```ts
import { getSpan } from '@nodalite/otel';

app.get('/api/data', async (c) => {
  const span = getSpan(c);
  span?.setAttribute('custom.key', 'value');
  return c.json({ ok: true });
});
```

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `c` | `Context` | The Nodalite request context |

### Returns

`Span | undefined` — the current OTel span, or `undefined` if not available.

## withSpan()

Execute a function within a new child span. The span is automatically ended when the function completes, and exceptions are recorded.

```ts
import { withSpan } from '@nodalite/otel';

app.get('/api/users/:id', async (c) => {
  return withSpan('db-query', async (span) => {
    const user = await db.findUser(c.req.param('id'));
    span.setAttribute('db.system', 'postgresql');
    return c.json(user);
  });
});
```

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `name` | `string` | Span name |
| `fn` | `(span: Span) => Promise<T> \| T` | Function to execute within the span |
| `opts` | `WithSpanOptions` | Optional: `{ attributes }` to set on the span |

### Returns

The return value of `fn`. The span is ended automatically (including on error).

## createMetrics()

Factory for custom OTel metric instruments beyond the built-in HTTP metrics.

```ts
import { createMetrics } from '@nodalite/otel';

const metrics = createMetrics({ serviceName: 'my-api' });

app.get('/api/jobs', async (c) => {
  metrics.jobsProcessed.add(1, { status: 'success' });
  return c.json({ ok: true });
});
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `serviceName` | `string` | `"nodalite-app"` | Service name for the OTel Meter |

### Returns

An `OtelMetrics` object containing:

| Field | Type | Description |
|---|---|---|
| `meter` | `Meter` | The underlying OTel Meter for creating custom instruments |
| `requestDuration` | `Histogram` | HTTP request duration histogram |
| `activeRequests` | `UpDownCounter` | Active request counter |
| `requestCount` | `Counter` | Total request counter |
| `requestBodySize` | `Histogram` | Request body size histogram |
| `responseBodySize` | `Histogram` | Response body size histogram |

Use the `meter` field to create your own instruments:

```ts
const metrics = createMetrics({ serviceName: 'my-api' });
const jobsProcessed = metrics.meter.createCounter('jobs.processed');
const queueDepth = metrics.meter.createUpDownCounter('jobs.queue_depth');
```

## SPAN_KEY

The context key used to store the current span. For advanced use cases where you need direct access to the context map.

```ts
import { SPAN_KEY } from '@nodalite/otel';
const span = c.get(SPAN_KEY);
```
