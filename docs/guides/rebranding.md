# Naming & Rebranding

This repo uses **Nodalite** as a working name. Before publishing for real:

## 1. Check npm availability

```bash
npm view @yourscope/core
npm view @yourscope/middleware
npm view @yourscope/adapter-node
# ... for every package
```

Check the full scope `@yourscope/*` for name conflicts.

## 2. Rename packages

Every file that needs updating:

- `packages/*/package.json` — the `"name"` field
- Any internal import of `@nodalite/*` across `src/` files
- The `App`'s default `name` option in `app.ts` (optional)

This is a single find-and-replace across the repo — nothing depends on the
literal string "nodalite" beyond the package names themselves.

## 3. Register the npm org

```bash
npm org create <scope>
```

## 4. Update docs config

Update the GitHub link in `docs/.vitepress/config.ts` and any references in
docs pages.
