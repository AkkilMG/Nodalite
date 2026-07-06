import type { Context } from "./context.js";

export type Next = () => Promise<Response>;

/**
 * A middleware runs before/around the route handler (onion model, like Koa
 * and Hono). It must always resolve to a `Response`: either by calling and
 * returning `next()` to continue the chain (e.g. `return next()`), or by
 * returning its own `Response` to short-circuit (e.g. an auth rejection or
 * a rate-limit 429). There's no ambiguous "returned nothing" case, so a
 * middleware can never accidentally hang a request.
 */
export type Middleware<Env extends Record<string, unknown> = Record<string, unknown>> = (
  c: Context<Env>,
  next: Next
) => Promise<Response>;

/** A terminal route handler. Distinguished from Middleware only by convention (it usually doesn't call next). */
export type Handler<Env extends Record<string, unknown> = Record<string, unknown>> = (
  c: Context<Env>
) => Promise<Response> | Response;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "ALL";

export interface RouteMatch<Env extends Record<string, unknown> = Record<string, unknown>> {
  handler: Handler<Env>;
  params: Record<string, string>;
  middlewares: Middleware<Env>[];
}
