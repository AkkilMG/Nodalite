import { HttpError, type Middleware } from "@nodalite/core";

/**
 * Rejects requests whose declared `Content-Length` exceeds `maxBytes` before
 * the body is ever read into memory — important on serverless where large
 * bodies eat into limited memory/tmp budgets, and a basic DoS mitigation
 * per OWASP's API security guidance to bound request size.
 */
export function bodyLimit(maxBytes: number): Middleware {
  return async (c, next) => {
    const contentLength = c.req.header("content-length");
    if (contentLength && Number(contentLength) > maxBytes) {
      throw new HttpError(413, `Request body exceeds limit of ${maxBytes} bytes`, { expose: true });
    }
    return next();
  };
}
