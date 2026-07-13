import { HttpError, type Middleware } from "@nodalite/core";

export interface CsrfOptions {
  /** Cookie name for the CSRF token. Defaults to "XSRF-TOKEN". */
  cookieName?: string;
  /** Header name the client must send the token in. Defaults to "X-XSRF-Token". */
  headerName?: string;
  /** Request body field to check as fallback. Defaults to "_csrf". */
  bodyField?: string;
  /** HTTP methods that are safe and skip validation. Defaults to ["GET", "HEAD", "OPTIONS", "QUERY"]. */
  safeMethods?: string[];
  /** Custom function to generate a token. Defaults to crypto.randomUUID(). */
  generateToken?: () => string;
  /** Cookie options. */
  cookie?: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    path?: string;
    maxAge?: number;
  };
}

/**
 * Double-submit cookie CSRF protection. Works across all runtimes without
 * server-side sessions: the server sets a random token as a cookie, and the
 * client must echo it back in a header or body field.
 *
 * ```ts
 * app.use("*", csrf());
 * ```
 */
export function csrf(opts: CsrfOptions = {}): Middleware {
  const cookieName = opts.cookieName ?? "XSRF-TOKEN";
  const headerName = opts.headerName ?? "X-XSRF-Token";
  const bodyField = opts.bodyField ?? "_csrf";
  const safeMethods = new Set(opts.safeMethods ?? ["GET", "HEAD", "OPTIONS", "QUERY"]);
  const generateToken = opts.generateToken ?? (() => crypto.randomUUID());
  const cookieOpts = {
    httpOnly: opts.cookie?.httpOnly ?? false,
    secure: opts.cookie?.secure ?? true,
    sameSite: opts.cookie?.sameSite ?? "Lax" as const,
    path: opts.cookie?.path ?? "/",
    maxAge: opts.cookie?.maxAge ?? 3600,
  };

  return async (c, next) => {
    const method = c.req.method.toUpperCase();

    if (safeMethods.has(method)) {
      const existing = c.req.header("cookie")?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith(cookieName + "="));

      const res = await next();
      if (!existing) {
        const headers = new Headers(res.headers);
        const token = generateToken();
        const cookie = `${cookieName}=${token}; Path=${cookieOpts.path}; Max-Age=${cookieOpts.maxAge}; SameSite=${cookieOpts.sameSite}${cookieOpts.httpOnly ? "; HttpOnly" : ""}${cookieOpts.secure ? "; Secure" : ""}`;
        headers.append("set-cookie", cookie);
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
      }
      return res;
    }

    const cookieToken = extractCookie(c.req.header("cookie"), cookieName);
    const headerToken = c.req.header(headerName.toLowerCase());

    let clientToken = headerToken;
    if (!clientToken && (method === "POST" || method === "PUT" || method === "PATCH")) {
      try {
        const body = await c.req.json<Record<string, unknown>>();
        clientToken = typeof body[bodyField] === "string" ? (body[bodyField] as string) : null;
      } catch {
        clientToken = null;
      }
    }

    if (!cookieToken || !clientToken || cookieToken !== clientToken) {
      throw HttpError.forbidden("Invalid CSRF token");
    }

    return next();
  };
}

function extractCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + "="));
  return match ? match.slice(name.length + 1) : null;
}
