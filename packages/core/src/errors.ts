/**
 * A typed HTTP error. Throw this anywhere inside a handler or middleware
 * and the App's error pipeline will turn it into a proper JSON response
 * with the right status code, instead of leaking a stack trace.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly expose: boolean;
  readonly details?: unknown;

  constructor(status: number, message: string, opts?: { expose?: boolean; details?: unknown; cause?: unknown }) {
    super(message, { cause: opts?.cause });
    this.name = "HttpError";
    this.status = status;
    this.expose = opts?.expose ?? status < 500;
    this.details = opts?.details;
  }

  static badRequest(message = "Bad Request", details?: unknown) {
    return new HttpError(400, message, { details, expose: true });
  }
  static unauthorized(message = "Unauthorized") {
    return new HttpError(401, message, { expose: true });
  }
  static forbidden(message = "Forbidden") {
    return new HttpError(403, message, { expose: true });
  }
  static notFound(message = "Not Found") {
    return new HttpError(404, message, { expose: true });
  }
  static conflict(message = "Conflict") {
    return new HttpError(409, message, { expose: true });
  }
  static tooManyRequests(message = "Too Many Requests", retryAfterSeconds?: number) {
    return new HttpError(429, message, { expose: true, details: { retryAfterSeconds } });
  }
  static internal(message = "Internal Server Error", cause?: unknown) {
    return new HttpError(500, message, { expose: false, cause });
  }

  toJSON() {
    return {
      error: this.expose ? this.message : "Internal Server Error",
      status: this.status,
      ...(this.expose && this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

export function isHttpError(err: unknown): err is HttpError {
  return err instanceof HttpError;
}
