import { App, HttpError } from "@nodalite/core";
import {
  apiKey,
  cors,
  csrf,
  contentTypeGuard,
  ipGuard,
  MemoryApiKeyStore,
  rateLimit,
  requestId,
  requestTimeout,
  securityHeaders,
  sessions,
  ssrfGuard,
  xssSanitize,
  sanitizedBody,
} from "@nodalite/middleware";

// --- In-memory stores (use Redis/DB in production) ---

const apiKeyStore = new MemoryApiKeyStore();
apiKeyStore.add("demo-key-abc123", { plan: "pro", team: "backend" });
apiKeyStore.add("demo-key-def456", { plan: "free", team: "frontend" });

// --- App ---

export const app = new App({ name: "security-api" });

// ---- Layer 1: Global middleware ----

// Request ID — every request gets a unique ID for log correlation
app.use("*", requestId());

// Security headers — OWASP-recommended set
app.use("*", securityHeaders());

// CORS — restrict to your frontend origin
app.use("*", cors({ origin: ["http://localhost:5173"], credentials: true }));

// Rate limiting — prevent abuse (100 req/min per IP)
app.use("*", rateLimit({ windowMs: 60_000, max: 100 }));

// Request timeout — kill hung requests after 15s
app.use("*", requestTimeout({ ms: 15_000 }));

// CSRF — double-submit cookie for browser-facing routes
app.use("*", csrf());

// ---- Layer 2: Session middleware ----

app.use(
  "*",
  sessions({
    secret: process.env.SESSION_SECRET ?? "dev-session-secret-change-me",
    cookie: { secure: false }, // allow HTTP in dev
  })
);

// ---- Layer 3: IP guard for admin routes ----

app.use("/admin/*", ipGuard({ mode: "allow", list: ["127.0.0.1", "::1"] }));

// ---- Routes ----

app.get("/health", (c) =>
  c.json({ status: "ok", requestId: c.get("requestId") })
);

// -- Public: session demo --
app.get("/session/set", (c) => {
  const session = c.get("session");
  session.views = ((session.views as number) ?? 0) + 1;
  return c.json({ views: session.views });
});

app.get("/session/get", (c) => {
  const session = c.get("session");
  return c.json({ views: session.views ?? 0 });
});

// -- API key protected routes --
app.use("/api/*", apiKey({ store: apiKeyStore }));

app.get("/api/data", (c) => {
  const key = c.get("apiKey") as { id: string; metadata?: Record<string, unknown> } | undefined;
  return c.json({
    message: "Authenticated via API key",
    plan: key?.metadata?.plan,
    requestId: c.get("requestId"),
  });
});

// -- XSS sanitization demo --
app.post(
  "/api/comments",
  async (c) => {
    // IMPORTANT: use sanitizedBody() instead of c.req.json()
    const body = sanitizedBody<{ text: string; author: string }>(c);
    return c.json({
      stored: body.text,
      author: body.author,
      note: "HTML entities have been encoded to prevent stored XSS",
    });
  },
  [xssSanitize()]
);

// -- Content-Type guard: only accept JSON --
app.post(
  "/api/strict-json",
  async (c) => {
    const body = await c.req.json();
    return c.json({ received: body });
  },
  [contentTypeGuard({ required: ["application/json"] })]
);

// -- SSRF protection: safe URL fetching --
app.post(
  "/api/preview",
  async (c) => {
    // ssrfGuard validates the URL before the handler runs
    const { url } = await c.req.json<{ url: string }>();
    return c.json({
      message: "URL passed SSRF checks",
      url,
      note: "In a real app, you would fetch the URL here",
    });
  },
  [ssrfGuard()]
);

// -- Admin route: IP-guarded --
app.get("/admin/stats", (c) => {
  return c.json({ uptime: process.uptime(), memory: process.memoryUsage() });
});

// ---- Error handler ----

app.onError((err, c) => {
  const httpErr = err instanceof HttpError ? err : HttpError.internal(undefined, err);
  return c.status(httpErr.status).json(httpErr.toJSON());
});
