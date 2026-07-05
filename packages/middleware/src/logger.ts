import type { Middleware } from "@nodalite/core";

export interface LoggerOptions {
  /** Custom sink, e.g. wire up Pino here: `(line) => logger.info(line)`. Defaults to console.log with JSON lines. */
  write?: (line: Record<string, unknown>) => void;
}

/**
 * Minimal structured request logger. Deliberately dependency-free so the
 * core+middleware bundle stays small; swap `write` for Pino/Winston/etc. in
 * production if you want transports, redaction, or log levels.
 */
export function logger(opts: LoggerOptions = {}): Middleware {
  const write = opts.write ?? ((line: Record<string, unknown>) => console.log(JSON.stringify(line)));

  return async (c, next) => {
    const start = performance.now();
    const { method } = c.req;
    const path = c.req.url.pathname;

    let res: Response;
    try {
      res = await next();
    } catch (err) {
      write({ method, path, status: 500, durationMs: round(performance.now() - start), error: true });
      throw err;
    }

    write({ method, path, status: res.status, durationMs: round(performance.now() - start) });
    return res;
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
