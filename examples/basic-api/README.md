# basic-api example

Demonstrates most of the framework in one small app:

- Global security middleware: `logger`, `securityHeaders`, `cors`, `bodyLimit`, `rateLimit`
- `POST /auth/signup`, `POST /auth/login` — JWT issuance, request validation via Zod (Standard Schema)
- `GET /api/me`, `POST /api/sentiment` — a JWT-protected route group
- `POST /api/sentiment` — a CPU-bound "ML" endpoint offloaded to a `WorkerPool`
  so it can't stall other concurrent requests. `src/sentiment-worker.ts` is a
  dependency-free stand-in — swap it for `@nodalite/ml`'s `Model` +
  `onnxEngine()` to run a real ONNX model with identical wiring.
- `GET /users/:id` — route params + `HttpError.notFound()`
- A scheduled background task (`server.ts`), running in the same long-lived
  process via `@nodalite/scheduler`.

## Run it

```bash
npm install
npm run dev -w examples-basic-api
```

```bash
curl -X POST localhost:3000/auth/signup -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"hunter22"}'
# => { "token": "..." }

curl localhost:3000/api/me -H "authorization: Bearer <token>"

curl -X POST localhost:3000/api/sentiment -H "authorization: Bearer <token>" \
  -H 'content-type: application/json' -d '{"text":"this is great"}'
```

**Note:** the password hashing in `app.ts` is a deliberately-flagged unsafe
stand-in (plain SHA-256, no salt) to keep the example dependency-free — see
the comment above `hashPassword()` for what to use in production.
