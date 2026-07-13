import { HttpError, type Middleware } from "@nodalite/core";
import type { RbacMap, RbacContext, AccessTokenPayload } from "./types.js";

export interface RbacOptions {
  /** Role-to-permissions mapping. */
  roles: RbacMap;
  /** Context key where the JWT payload is stored. Defaults to "user". */
  userContextKey?: string;
  /** Context key where the RBAC context is stored. Defaults to "rbac". */
  rbacContextKey?: string;
  /** Extract roles from the JWT payload. Defaults to reading `payload.roles`. */
  extractRoles?: (payload: AccessTokenPayload) => string[];
  /** Extract permissions from the JWT payload. Defaults to reading `payload.permissions`. */
  extractPermissions?: (payload: AccessTokenPayload) => string[];
}

/**
 * Middleware that builds an RBAC context from the verified JWT payload.
 * Must be used after `jwtAuth`.
 *
 * ```ts
 * app.use("/api/*", jwtAuth({ secret }));
 * app.use("/api/*", rbac({
 *   roles: { admin: ["read", "write", "delete"], user: ["read"] },
 * }));
 * app.get("/api/admin", requireRole("admin"), handler);
 * ```
 */
export function rbac(opts: RbacOptions): Middleware {
  const userKey = opts.userContextKey ?? "user";
  const rbacKey = opts.rbacContextKey ?? "rbac";
  const extractRoles = opts.extractRoles ?? ((p) => p.roles ?? []);
  const extractPermissions = opts.extractPermissions ?? ((p) => p.permissions ?? []);

  // Build a permission lookup from the roles map
  const rolePermissions = new Map<string, Set<string>>();
  for (const [role, perms] of Object.entries(opts.roles)) {
    rolePermissions.set(role, new Set(perms));
  }

  return async (c, next) => {
    const payload = c.get(userKey as never) as AccessTokenPayload | undefined;
    if (!payload) {
      throw HttpError.forbidden("RBAC requires jwtAuth middleware upstream");
    }

    const userRoles = extractRoles(payload);
    const explicitPermissions = new Set(extractPermissions(payload));

    // Resolve permissions from roles
    const resolvedPermissions = new Set<string>();
    for (const role of userRoles) {
      const perms = rolePermissions.get(role);
      if (perms) {
        for (const p of perms) resolvedPermissions.add(p);
      }
    }
    // Add explicit permissions
    for (const p of explicitPermissions) resolvedPermissions.add(p);

    const ctx: RbacContext = {
      hasRole: (role) => userRoles.includes(role),
      hasPermission: (perm) => resolvedPermissions.has(perm),
      hasAnyRole: (...roles) => roles.some((r) => userRoles.includes(r)),
      hasAllPermissions: (...perms) => perms.every((p) => resolvedPermissions.has(p)),
    };

    c.set(rbacKey as never, ctx as never);
    return next();
  };
}

/**
 * Middleware that requires the user to have at least one of the specified roles.
 * Must be used as middleware (not as a terminal handler), e.g.:
 * ```ts
 * app.get("/admin", handler, [requireRole("admin")]);
 * ```
 */
export function requireRole(...roles: string[]): Middleware {
  return async (c, next) => {
    const rbacCtx = c.get("rbac" as never) as RbacContext | undefined;
    if (!rbacCtx) {
      throw HttpError.forbidden("RBAC middleware not configured");
    }
    if (!rbacCtx.hasAnyRole(...roles)) {
      throw HttpError.forbidden(`Required role: ${roles.join(" or ")}`);
    }
    return next();
  };
}

/**
 * Middleware that requires the user to have at least one of the specified permissions.
 * Must be used as middleware (not as a terminal handler), e.g.:
 * ```ts
 * app.delete("/doc", handler, [requirePermission("delete")]);
 * ```
 */
export function requirePermission(...permissions: string[]): Middleware {
  return async (c, next) => {
    const rbacCtx = c.get("rbac" as never) as RbacContext | undefined;
    if (!rbacCtx) {
      throw HttpError.forbidden("RBAC middleware not configured");
    }
    if (!permissions.some((p) => rbacCtx.hasPermission(p))) {
      throw HttpError.forbidden(`Required permission: ${permissions.join(" or ")}`);
    }
    return next();
  };
}
