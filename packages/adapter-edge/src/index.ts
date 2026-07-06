import type { App } from "@nodalite/core";

/**
 * Runtimes like Cloudflare Workers, Deno, and Bun already speak the exact
 * Fetch API contract Nodalite is built on — `app.fetch` (an alias for
 * `app.handle`) *is* the handler. This package exists mostly for the
 * Cloudflare Workers case, where the exported `fetch` also receives
 * `env` (bindings: KV, D1, R2, secrets) and `ctx` (for `waitUntil`), which
 * this helper forwards into `c.platform` so handlers can access them.
 *
 * Cloudflare Workers:
 * ```ts
 * import { app } from './app.js';
 * import { createEdgeHandler } from '@nodalite/adapter-edge';
 * export default createEdgeHandler(app);
 * ```
 *
 * Deno / Bun (no extra bindings to forward, so just use the app directly):
 * ```ts
 * // Deno
 * Deno.serve((req) => app.fetch(req));
 * // Bun
 * Bun.serve({ fetch: (req) => app.fetch(req) });
 * ```
 */
export function createEdgeHandler(app: App) {
  return {
    fetch(request: Request, env?: Record<string, unknown>, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
      return app.handle(request, { runtime: "edge", env, waitUntil: ctx?.waitUntil?.bind(ctx) });
    },
  };
}
