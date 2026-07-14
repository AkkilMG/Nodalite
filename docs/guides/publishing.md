---
description: Guide to publishing and versioning Nodalite packages: npm workspaces, tsup builds, Changesets, dual ESM/CJS, and release workflow.
---

# Publishing & Versioning

## Monorepo tooling

- **npm workspaces** for the monorepo (`"workspaces"` in root `package.json`)
- **tsup** to build each package to both ESM (`dist/index.js`) and CJS
  (`dist/index.cjs`) with generated `.d.ts` files
- The `exports` map in each `package.json` routes `import`/`require` to the
  right file

## Versioning with Changesets

Install and initialize:

```bash
npm install -D @changesets/cli
npx changeset init
```

### Workflow

1. After making a change, run `npx changeset` — it asks which packages
   changed and whether it's a patch/minor/major bump, and writes a small
   markdown file describing the change.
2. Merge that alongside your PR.
3. A CI job (or you, locally) runs `npx changeset version` — this bumps
   every affected package's `package.json`, updates their changelogs, and
   bumps dependent packages' version ranges to real version numbers.
4. `npm publish --workspaces` or `npx changeset publish` publishes everything
   that changed to npm in the correct dependency order.

### Semantic versioning discipline

- **`@nodalite/core`** — any public API signature change is a **major** bump,
  always. This is the package everything depends on.
- **Adapters** — can iterate faster, but breaking `serve()` or
  `createLambdaHandler()` signatures is still major.
- Be honest — resist under-bumping to avoid a major version number. Consumers
  pinning `^` ranges will get broken installs.

## CI/CD (GitHub Actions)

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck --workspaces --if-present
      - run: npm test
      - run: npm run build --workspaces --if-present

  release:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - uses: changesets/action@v1
        with:
          publish: npm run release
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Security auditing

- `npm audit` or Dependabot for known-vulnerable dependencies
- `@nodalite/core`'s zero-dependency policy keeps its supply-chain attack
  surface minimal by construction
- Run `npm pack --dry-run` in each package before publishing to verify only
  `dist/` files ship to consumers
