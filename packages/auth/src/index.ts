// Types
export type {
  AccessTokenPayload,
  RefreshTokenPayload,
  TokenPair,
  TokenEntry,
  OAuth2Profile,
  OAuth2Provider,
  OAuth2ProviderBase,
  Role,
  RbacMap,
  RbacContext,
} from "./types.js";

// Store interfaces
export type { TokenStore, SessionStore } from "./stores/interface.js";

// JWT
export {
  jwtAuth,
  issueTokenPair,
  tokenRefreshHandler,
  revokeToken,
  type JwtAuthOptions,
  type IssueTokenPairOptions,
  type TokenRefreshOptions,
} from "./jwt.js";

// OAuth2
export {
  providers,
  oauth2authorize,
  oauth2Callback,
  type OAuth2AuthorizeOptions,
  type OAuth2CallbackOptions,
} from "./oauth2.js";

// RBAC
export {
  rbac,
  requireRole,
  requirePermission,
  type RbacOptions,
} from "./rbac.js";

// Sessions
export { sessions, type SessionOptions } from "./session.js";

// Password
export { hashPassword, verifyPassword } from "./password.js";

// CSRF
export { csrf, type CsrfOptions } from "./csrf.js";

// Stores (memory)
export { MemoryTokenStore, MemorySessionStore } from "./stores/memory.js";
