import type { Context, Middleware } from "@nodalite/core";

export interface XssSanitizeOptions {
  /** Fields in the body to sanitize. If omitted, all string values are sanitized. */
  fields?: string[];
  /** Also sanitize query parameters. Defaults to false. */
  sanitizeQuery?: boolean;
  /** Custom sanitizer function. Defaults to HTML entity encoding. */
  sanitizer?: (value: string) => string;
}

const HTML_ENTITY_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
  "`": "&#96;",
};

/**
 * Sanitizes string values in request body to prevent stored XSS. Encodes
 * HTML entities by default, breaking any injected HTML/script tags.
 *
 * The sanitized body is stored in the context under `__sanitizedBody`.
 * Use the `sanitizedBody()` helper to retrieve it in handlers:
 *
 * ```ts
 * app.post("/comments", async (c) => {
 *   const body = sanitizedBody<{ text: string }>(c);
 *   return c.json({ text: body.text });
 * }, [xssSanitize()]);
 * ```
 */
export function xssSanitize(opts: XssSanitizeOptions = {}): Middleware {
  const encode = opts.sanitizer ?? defaultEncode;

  return async (c, next) => {
    if (opts.sanitizeQuery) {
      const url = new URL(c.req.raw.url);
      let changed = false;
      for (const [key, value] of url.searchParams.entries()) {
        const sanitized = encode(value);
        if (sanitized !== value) {
          url.searchParams.set(key, sanitized);
          changed = true;
        }
      }
      if (changed) {
        // Store sanitized query params in context
        c.set("__sanitizedQuery" as never, Object.fromEntries(url.searchParams.entries()) as never);
      }
    }

    // Parse and sanitize body
    const contentType = c.req.header("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("application/json")) {
      try {
        const body = await c.req.json();
        const sanitized = sanitizeObject(body, opts.fields, encode);
        c.set("__sanitizedBody" as never, sanitized as never);
      } catch {
        // Not JSON or empty body — skip
      }
    }

    return next();
  };
}

/**
 * Retrieve the sanitized body from the context. Use this in handlers
 * instead of `c.req.json()` when `xssSanitize()` middleware is active.
 */
export function sanitizedBody<T = unknown>(c: Context): T {
  return c.get("__sanitizedBody" as never) as T;
}

function sanitizeObject(
  obj: unknown,
  fields: string[] | undefined,
  encode: (s: string) => string
): unknown {
  if (typeof obj === "string") return encode(obj);
  if (Array.isArray(obj)) return obj.map((item) => sanitizeObject(item, fields, encode));
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (fields && !fields.includes(key)) {
        result[key] = value;
      } else {
        result[key] = sanitizeObject(value, fields, encode);
      }
    }
    return result;
  }
  return obj;
}

function defaultEncode(str: string): string {
  return str.replace(/[&<>"'`/]/g, (char) => HTML_ENTITY_MAP[char] ?? char);
}
