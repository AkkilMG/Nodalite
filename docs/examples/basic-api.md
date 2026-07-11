# Basic API Example

The fullest example in the repo: signup/login with JWT, request validation,
rate limiting, security headers, route groups, and a CPU-bound "ML" endpoint
offloaded to a `WorkerPool`.

## Run it

```bash
npm run dev -w examples-basic-api
```

## What it demonstrates

### App setup

```ts
const app = new App();

// Global middleware
app.use('*', logger());
app.use('*', securityHeaders());
app.use('*', cors({ origin: 'http://localhost:5173' }));
app.use('/api/*', bodyLimit({ max: 10_000 }));
```

### Route groups

```ts
app.group('/api/v1', (g) => {
  g.post('/auth/signup', validate(signupSchema), signup);
  g.post('/auth/login', validate(loginSchema), login);

  // Protected routes
  g.get('/profile', authMiddleware, profile);
});
```

### JWT auth

```ts
app.post('/auth/login', async (c) => {
  const { email, password } = await c.req.json();
  const user = await db.findUser(email);

  if (!user || !verifyPassword(password, user.hash)) {
    throw HttpError.unauthorized('Invalid credentials');
  }

  const token = await signJwt(
    { sub: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  return c.json({ token });
});
```

### ML endpoint with WorkerPool

```ts
app.post('/analyze-sentiment', authMiddleware, async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  const result = await pool.run(sentimentTask, { text });
  return c.json(result);
});
```

The example uses a dependency-free stand-in model to prove the wiring works.
Swap in a real ONNX model via `@nodalite/ml` and nothing changes:
`Model.warm()` in `onColdStart`, `model.predict()` in the worker task.
