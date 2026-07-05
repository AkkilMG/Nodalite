import { App, HttpError } from "@nodalite/core";
import { cors, rateLimit, securityHeaders } from "@nodalite/middleware";

// Anything expensive (DB clients, config fetched from Secrets Manager, a
// loaded ML model) should be created at module scope, *outside* any
// handler function — Lambda keeps this module loaded and reuses it across
// invocations on the same warm container, so this only runs once per
// container instead of once per request.
const startedAt = new Date().toISOString();

export const app = new App({ name: "lambda-example-api" });

app.use("*", securityHeaders());
app.use("*", cors({ origin: "*" })); // tighten this to your real frontend origin in production
app.use("*", rateLimit({ windowMs: 60_000, max: 50 }));

app.get("/health", (c) => c.json({ ok: true, containerStartedAt: startedAt }));

app.get("/items/:id", (c) => {
  const id = c.req.param("id")!;
  if (id === "missing") throw HttpError.notFound("No such item");
  return c.json({ id, name: `Item ${id}` });
});

app.onError((err, c) => {
  const httpErr = err instanceof HttpError ? err : HttpError.internal(undefined, err);
  return c.status(httpErr.status).json(httpErr.toJSON());
});
