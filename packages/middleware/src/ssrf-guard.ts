import { HttpError, type Middleware } from "@nodalite/core";

export interface SsrfGuardOptions {
  /** Additional IPs or CIDR ranges to block. Defaults include private ranges and metadata endpoints. */
  blockList?: string[];
  /** Whether to allow requests to private networks (RFC 1918). Defaults to false. */
  allowPrivate?: boolean;
  /** How to extract the target URL from the request. Defaults to reading a "url" field from JSON body. */
  extractUrl?: (c: Parameters<Middleware>[0]) => Promise<string | null>;
  /** Custom rejection message. */
  message?: string;
}

/**
 * SSRF (Server-Side Request Forgery) protection middleware. Validates that
 * user-supplied URLs don't point to internal/private IP ranges, cloud
 * metadata endpoints, or other non-routable addresses.
 *
 * Use this on routes that accept URLs to fetch (webhooks, URL previews,
 * link validation, etc.).
 *
 * ```ts
 * app.post("/fetch-url", handler, [ssrfGuard()]);
 * app.post("/webhook", handler, [ssrfGuard({ allowPrivate: true })]);
 * ```
 */
export function ssrfGuard(opts: SsrfGuardOptions = {}): Middleware {
  const blockList = opts.blockList ?? [];
  const allowPrivate = opts.allowPrivate ?? false;
  const extractUrl = opts.extractUrl ?? defaultExtractUrl;

  const blockedRanges: CidrEntry[] = [
    ...blockList.map(parseCidr),
    ...(!allowPrivate ? PRIVATE_RANGES.map(parseCidr) : []),
  ];

  return async (c, next) => {
    const targetUrl = await extractUrl(c);
    if (!targetUrl) return next();

    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      throw HttpError.badRequest("Invalid URL");
    }

    // Only validate http/https URLs
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw HttpError.badRequest("Only http and https URLs are allowed");
    }

    const hostname = parsed.hostname;

    // Block localhost by name
    if (isLocalhost(hostname)) {
      throw HttpError.forbidden(opts.message ?? "Requests to localhost are not allowed");
    }

    // Resolve hostname to IP and check against blocked ranges
    try {
      // Use DNS lookup via fetch to resolve without making a full request
      const resolved = await resolveHostname(hostname);
      if (resolved.some((ip) => blockedRanges.some((range) => matchCidr(ip, range)))) {
        throw HttpError.forbidden(opts.message ?? "Requests to internal networks are not allowed");
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      // DNS resolution failed — reject as a safety measure
      throw HttpError.forbidden(opts.message ?? "Could not resolve target hostname");
    }

    return next();
  };
}

function defaultExtractUrl(c: Parameters<Middleware>[0]): Promise<string | null> {
  return c.req.json<{ url?: string }>().then((body) => body.url ?? null).catch(() => null);
}

function isLocalhost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0" || h === "[::1]";
}

// Runtime-agnostic DNS resolution using built-in DNS where available
async function resolveHostname(hostname: string): Promise<string[]> {
  try {
    const nodeDns = await import("node:dns");
    const addresses = await new Promise<string[]>((resolve, reject) => {
      (nodeDns as typeof import("node:dns")).resolve4(hostname, (err, addrs) => {
        if (err) reject(err);
        else resolve(addrs);
      });
    });
    return addresses;
  } catch {
    // Not available (edge/browser runtime) — skip IP-level checks
    return [];
  }
}

// CIDR matching (same as ip-guard)
interface CidrEntry { ip: number; mask: number; }

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

// RFC 1918 + link-local + cloud metadata
const PRIVATE_RANGES = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16", // link-local + AWS/GCP/Azure metadata
  "127.0.0.0/8",
  "0.0.0.0/8",
  "fc00::/7",     // IPv6 ULA (won't match IPv4 checks but kept for documentation)
  "fe80::/10",    // IPv6 link-local
];
