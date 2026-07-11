import { HttpError, type Middleware } from "@nodalite/core";

export interface IpGuardOptions {
  /** Mode: "allow" only allows listed IPs, "deny" blocks listed IPs. Defaults to "deny". */
  mode?: "allow" | "deny";
  /** List of IPs or CIDR ranges. */
  list: string[];
  /** How to derive the client IP per request. Defaults to platform.ip or x-forwarded-for. */
  keyGenerator?: (c: Parameters<Middleware>[0]) => string;
  /** Custom rejection message. */
  message?: string;
}

/**
 * IP allowlisting/blocklisting middleware. Supports individual IPs and
 * CIDR notation (e.g., "192.168.0.0/16").
 *
 * ```ts
 * app.use("*", ipGuard({ mode: "deny", list: ["10.0.0.0/8", "192.168.0.0/16"] }));
 * app.use("/admin/*", ipGuard({ mode: "allow", list: ["203.0.113.50"] }));
 * ```
 */
export function ipGuard(opts: IpGuardOptions): Middleware {
  const mode = opts.mode ?? "deny";
  const list = opts.list.map(parseCidr);
  const keyGenerator = opts.keyGenerator ?? defaultKeyGenerator;

  return async (c, next) => {
    const ip = keyGenerator(c);
    const matched = list.some((entry) => matchCidr(ip, entry));

    if (mode === "deny" && matched) {
      throw HttpError.forbidden(opts.message ?? "Access denied");
    }
    if (mode === "allow" && !matched) {
      throw HttpError.forbidden(opts.message ?? "Access denied");
    }

    return next();
  };
}

interface CidrEntry {
  ip: number;
  mask: number;
}

function parseCidr(cidr: string): CidrEntry {
  const [ipStr, prefixStr] = cidr.split("/");
  const prefix = prefixStr ? parseInt(prefixStr, 10) : 32;
  const parts = ipStr!.split(".").map(Number);
  const ip = ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return { ip: ip & mask, mask };
}

function matchCidr(ipStr: string, entry: CidrEntry): boolean {
  const parts = ipStr.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;
  const ip = ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
  return (ip & entry.mask) === entry.ip;
}

function defaultKeyGenerator(c: Parameters<Middleware>[0]): string {
  const platformIp = (c.platform as { ip?: string }).ip;
  return platformIp ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
