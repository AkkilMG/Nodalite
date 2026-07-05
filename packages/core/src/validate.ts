import { HttpError } from "./errors.js";
import type { Context } from "./context.js";
import type { Middleware } from "./types.js";

/**
 * Minimal subset of the "Standard Schema" spec (https://standardschema.dev)
 * implemented by Zod (3.24+), Valibot, ArkType and others. Depending on this
 * tiny interface instead of a concrete library keeps `@nodalite/core` at
 * zero runtime dependencies while still giving full type inference.
 */
export interface StandardSchema<Output = unknown> {
  "~standard": {
    validate(
      value: unknown
    ):
      | { value: Output; issues?: undefined }
      | { value?: undefined; issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> }> }
      | Promise<
          | { value: Output; issues?: undefined }
          | { value?: undefined; issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> }> }
        >;
  };
}

export type InferSchema<S> = S extends StandardSchema<infer O> ? O : never;

interface ValidateSchemas {
  body?: StandardSchema;
  query?: StandardSchema;
  params?: StandardSchema;
}

/**
 * Validates the request body / query / params against Standard-Schema
 * compatible schemas *before* the handler runs, and rejects with a 400 +
 * structured issue list otherwise. Following OWASP's "reject invalid input
 * rather than trying to sanitize it" guidance.
 *
 * ```ts
 * app.post('/users', createUser, [validate({ body: z.object({ name: z.string(), email: z.string().email() }) })]);
 * ```
 */
export function validate<Env extends Record<string, unknown>>(schemas: ValidateSchemas): Middleware<Env> {
  return async (c: Context<Env>, next) => {
    if (schemas.query) {
      const raw = Object.fromEntries(c.req.url.searchParams.entries());
      await runSchema(schemas.query, raw, "query");
    }
    if (schemas.params) {
      await runSchema(schemas.params, c.req.params, "params");
    }
    if (schemas.body) {
      const raw = await safeJson(c);
      await runSchema(schemas.body, raw, "body");
    }
    return next();
  };
}

async function safeJson(c: Context<any>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw HttpError.badRequest("Request body must be valid JSON");
  }
}

async function runSchema(schema: StandardSchema, value: unknown, where: string): Promise<void> {
  const result = await schema["~standard"].validate(value);
  if (result.issues) {
    throw HttpError.badRequest(`Invalid ${where}`, {
      issues: result.issues.map((i) => ({ message: i.message, path: i.path })),
    });
  }
}
