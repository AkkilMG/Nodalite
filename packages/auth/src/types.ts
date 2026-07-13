import type { JWTPayload } from "jose";

export interface AccessTokenPayload extends JWTPayload {
  sub: string;
  roles?: string[];
  permissions?: string[];
  tokenType: "access";
}

export interface RefreshTokenPayload extends JWTPayload {
  sub: string;
  tokenId: string;
  family: string;
  tokenType: "refresh";
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenPayload: AccessTokenPayload;
  refreshTokenPayload: RefreshTokenPayload;
}

export interface TokenEntry {
  tokenId: string;
  family: string;
  userId: string;
  revoked: boolean;
  expiresAt: number;
}

export interface OAuth2Profile {
  id: string;
  email?: string;
  name?: string;
  avatar?: string;
  provider: string;
  raw: Record<string, unknown>;
}

export interface OAuth2ProviderBase {
  name: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scopes: string[];
}

export interface OAuth2Provider extends OAuth2ProviderBase {
  clientId: string;
  clientSecret: string;
}

export interface Role {
  name: string;
  permissions: string[];
}

export interface RbacMap {
  [roleName: string]: string[];
}

export interface RbacContext {
  hasRole(role: string): boolean;
  hasPermission(perm: string): boolean;
  hasAnyRole(...roles: string[]): boolean;
  hasAllPermissions(...perms: string[]): boolean;
}
