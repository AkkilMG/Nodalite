import { HttpError, type Middleware } from "@nodalite/core";

export interface ContentTypeGuardOptions {
  /** Required Content-Type(s). Accepts exact types or patterns with wildcards. */
  required: string[];
  /** HTTP methods to enforce this on. Defaults to ["POST", "PUT", "PATCH", "QUERY"]. */
  methods?: string[];
  /** Custom rejection message. */
  message?: string;
}

/**
 * Validates that incoming requests have an allowed Content-Type header.
 * Rejects with 415 Unsupported Media Type if the type doesn't match.
 *
 * ```ts
 * app.post("/data", handler, [contentTypeGuard({ required: ["application/json"] })]);
 * app.use("/upload/*", contentTypeGuard({ required: ["multipart/*", "application/json"] }));
 * ```
 */
export function contentTypeGuard(opts: ContentTypeGuardOptions): Middleware {
  const methods = new Set(opts.methods ?? ["POST", "PUT", "PATCH", "QUERY"]);
  const patterns = opts.required.map((p) => p.toLowerCase());

  return async (c, next) => {
    if (!methods.has(c.req.method.toUpperCase())) {
      return next();
    }

    const contentType = c.req.header("content-type")?.toLowerCase().split(";")[0]?.trim();
    if (!contentType) {
      throw HttpError.unsupportedMediaType(opts.message ?? "Content-Type header is required");
    }

    const allowed = patterns.some((pattern) => {
      if (pattern.endsWith("/*")) {
        return contentType.startsWith(pattern.slice(0, -1));
      }
      if (pattern.startsWith("*/")) {
        return contentType.endsWith(pattern.slice(1));
      }
      return contentType === pattern;
    });

    if (!allowed) {
      throw HttpError.unsupportedMediaType(
        opts.message ?? `Content-Type must be one of: ${opts.required.join(", ")}`
      );
    }

    return next();
  };
}
