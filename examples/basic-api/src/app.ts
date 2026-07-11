import { App, HttpError, validate } from "@nodalite/core";
import { bodyLimit, cors, jwtAuth, logger, rateLimit, securityHeaders, signJwt } from "@nodalite/middleware";
import { WorkerPool } from "@nodalite/workers";
import { z } from "zod";

// A tiny "database" so this example runs with zero external services.
const users = new Map<string, { id: string; email: string; passwordHash: string }>();
let nextUserId = 1;

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me-in-production";

// One worker pool, shared across requests, sized to leave a core free for
// the event loop. Swap the worker file for one backed by `@nodalite/ml`'s
// `Model` + `onnxEngine()` to run a real ONNX model the same way.
// Resolves to the sibling worker file with the right extension for however
// this module itself is currently running: `.ts` directly under `tsx`
// (dev), or `.js` after a real build (prod). `worker_threads.Worker` can't
// resolve extensionless specifiers, so we mirror our own file's extension.
const workerExt = import.meta.url.endsWith(".ts") ? "ts" : "js";
const sentimentPool = new WorkerPool(new URL(`./sentiment-worker.${workerExt}`, import.meta.url), {
  size: 2,
  taskTimeoutMs: 5000,
});

export const app = new App({ name: "example-api" });

// ---- Global middleware (security + observability), applied to everything ----
app.use("*", logger());
app.use("*", securityHeaders());
app.use("*", cors({ origin: ["http://localhost:5173"], credentials: true }));
app.use("/*", bodyLimit(1_000_000)); // 1MB
app.use("*", rateLimit({ windowMs: 60_000, max: 100 }));

app.get("/health", (c) => c.json({ status: "ok" }));

// QUERY method — safe + idempotent with a body (RFC 10008)
// Use for search/filter operations that need structured input but cause no side effects.
app.query("/search", async (c) => {
  const { q } = await c.req.json<{ q: string }>();
  const results = [...users.values()].filter((u) => u.email.includes(q));
  return c.json({ results: results.map(({ id, email }) => ({ id, email })) });
});

// ---- Public auth routes ----
const signupSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

app.post(
  "/auth/signup",
  async (c) => {
    const { email, password } = await c.req.json<z.infer<typeof signupSchema>>();
    if ([...users.values()].some((u) => u.email === email)) throw HttpError.conflict("Email already registered");

    const id = String(nextUserId++);
    const passwordHash = await hashPassword(password);
    users.set(id, { id, email, passwordHash });

    const token = await signJwt({ sub: id, email }, { secret: JWT_SECRET, expiresIn: "1h" });
    return c.status(201).json({ token });
  },
  [validate({ body: signupSchema })]
);

const loginSchema = z.object({ email: z.string().email(), password: z.string() });

app.post(
  "/auth/login",
  async (c) => {
    const { email, password } = await c.req.json<z.infer<typeof loginSchema>>();
    const user = [...users.values()].find((u) => u.email === email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw HttpError.unauthorized("Invalid email or password");
    }
    const token = await signJwt({ sub: user.id, email: user.email }, { secret: JWT_SECRET, expiresIn: "1h" });
    return c.json({ token });
  },
  [validate({ body: loginSchema })]
);

// ---- Protected routes (JWT required) ----
app.group("/api", (api) => {
  api.use(jwtAuth({ secret: JWT_SECRET }));

  api.get("/me", (c) => c.json(c.get("user" as never)));

  // A lightweight "ML" endpoint, offloaded to a worker pool so a burst of
  // inference requests can't stall the event loop that's serving /health
  // or other API traffic concurrently.
  api.post(
    "/sentiment",
    async (c) => {
      const { text } = await c.req.json<{ text: string }>();
      const result = await sentimentPool.run({ text });
      return c.json(result);
    },
    [validate({ body: z.object({ text: z.string().min(1).max(2000) }) })]
  );
});

// ---- Route with a param, to show path params + error handling together ----
app.get("/users/:id", (c) => {
  const user = users.get(c.req.param("id")!);
  if (!user) throw HttpError.notFound("User not found");
  return c.json({ id: user.id, email: user.email });
});

app.onError((err, c) => {
  const httpErr = err instanceof HttpError ? err : HttpError.internal(undefined, err);
  return c.status(httpErr.status).json(httpErr.toJSON());
});

// --- SHA-256 password "hashing" so this example needs no extra packages ---
// DO NOT use this in production: it has no salt and no work factor, so it's
// fast to brute-force and identical passwords produce identical hashes.
// Use a real password-hashing KDF instead — Argon2id (`argon2` package) or
// bcrypt/scrypt — which are slow-by-design and salt automatically. See the
// guide's "Authentication" section for a drop-in replacement.
async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(digest).toString("hex");
}
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return (await hashPassword(password)) === hash;
}

export async function shutdown(): Promise<void> {
  await sentimentPool.terminate();
}
