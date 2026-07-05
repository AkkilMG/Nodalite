import type { Context } from "./context.js";
import type { Middleware } from "./types.js";

/**
 * Composes an array of middleware plus a terminal handler into a single
 * function, using the same "onion" model as Koa/Hono: each middleware wraps
 * everything after it. `next()` resumes downstream execution and resolves
 * to the eventual Response, so code written after `await next()` runs on
 * the way back out — perfect for timing logs, wrapping errors from inner
 * handlers, or mutating response headers just before they go out.
 */
export function compose<Env extends Record<string, unknown>>(
  middlewares: Middleware<Env>[],
  final: (c: Context<Env>) => Promise<Response>
): (c: Context<Env>) => Promise<Response> {
  return function run(c: Context<Env>): Promise<Response> {
    let index = -1;

    function dispatch(i: number): Promise<Response> {
      if (i <= index) {
        return Promise.reject(new Error("next() called multiple times in one middleware"));
      }
      index = i;

      const fn = middlewares[i];
      if (!fn) return final(c);

      return Promise.resolve(fn(c, () => dispatch(i + 1)));
    }

    return dispatch(0);
  };
}
