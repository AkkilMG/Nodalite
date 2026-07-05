# Contributing to Nodalite

Thanks for your interest! Nodalite is a monorepo with multiple packages, and
your contributions are welcome.

## Quick start

```bash
git clone <your-fork>
cd nodalite
npm install
npm run build --workspaces --if-present
npm test
```

## Development workflow

- **Build:** `npm run build --workspaces --if-present` (tsup builds ESM + CJS + .d.ts)
- **Test:** `npm test` (Vitest — runs every package's test suite)
- **Type-check:** `npm run typecheck --workspaces --if-present`
- **Docs dev server:** `npm run docs:dev` (VitePress, live-reloads on changes)

## Code style

- TypeScript strict mode, no unchecked index access, no implicit returns
- Runtime-agnostic: never import Node-specific APIs in `@nodalite/core` or
  `@nodalite/middleware`. Adapters can use runtime-specific APIs.
- Zero runtime dependencies in `@nodalite/core` — preserve this deliberately.
- Every public export has a JSDoc comment explaining *why*, not just *what*.
- Tests prefer real integration over mocks (see `docs/GUIDE.md §8.4`).

## Pull request process

1. Fork the repo and create a branch from `main`.
2. Run tests before pushing: `npm test`.
3. If you're adding functionality, include tests.
4. If you're changing a public API, update the relevant docs page.
5. Open a PR with a clear title and description.

## Package conventions

Each package at `packages/<name>/` follows the same shape:

```
src/
  index.ts       # public exports
  *.ts           # implementation
  *.test.ts      # Vitest tests
package.json     # name: @nodalite/<name>, exports map
tsconfig.json    # extends ../../tsconfig.base.json
```

## Questions?

Open a [discussion](https://github.com/AkkilMG/nodalite/discussions)
or email **me@akkil.dev**.
