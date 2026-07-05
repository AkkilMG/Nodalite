# Testing Strategy

Nodalite's tests follow one rule: **prefer a real integration test over a
mocked one wherever it's cheap to run.**

## Per-package approach

### adapter-node

Tests start a real `http.Server` on an OS-assigned port and hit it with a
real `fetch()` — not a simulated request object.

### adapter-lambda

Tests use realistic API Gateway v1/v2 event fixtures, not simplified
stand-ins, so a real shape mismatch would actually fail.

### workers

Tests spawn real `worker_threads`, including a real crash-and-restart cycle
with real timing — not a mocked `Worker` class.

### ml

Tests spin up a real local HTTP server to verify actual disk caching of
downloaded model bytes. The ~270MB `onnxruntime-node` dependency is replaced
with a fake `InferenceEngine` implementing the same two-method interface.

### core

Unit tests for the router, middleware compose, error handling, and validation
logic, plus integration tests that exercise the full request pipeline.

## Running tests

```bash
# All packages
npm test

# Single package
npm test -w @nodalite/core
```

## Why not mocked tests?

Mocking hides real problems:
- Changes in the runtime's `worker_threads` API that break your worker code
- Differences between your simulated Lambda event and a real one
- Timing issues that only show up with real network calls

When a real dependency is genuinely too heavy (native binaries, large models),
the code is still written against its real API — only the *test* uses a fake,
so the logic under test (caching, dedup, warm reuse) is validated for real.
