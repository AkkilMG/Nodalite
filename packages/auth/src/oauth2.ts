import { HttpError, type Handler } from "@nodalite/core";
import type { OAuth2Provider, OAuth2ProviderBase, OAuth2Profile } from "./types.js";

export const providers = {
  google: {
    name: "google",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userinfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    scopes: ["openid", "email", "profile"],
  },
  github: {
    name: "github",
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userinfoUrl: "https://api.github.com/user",
    scopes: ["user:email"],
  },
  discord: {
    name: "discord",
    authorizationUrl: "https://discord.com/api/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    userinfoUrl: "https://discord.com/api/users/@me",
    scopes: ["identify", "email"],
  },
} as const satisfies Record<string, OAuth2ProviderBase>;

export interface OAuth2AuthorizeOptions {
  provider: OAuth2Provider;
  redirectUri: string;
  callbackUrl: string;
  scopes?: string[];
  extraParams?: Record<string, string>;
}

export interface OAuth2CallbackOptions {
  provider: OAuth2Provider;
  redirectUri?: string;
  callback: (profile: OAuth2Profile) => Promise<{ userId: string; roles?: string[] } | null>;
  onError?: (error: unknown) => Response;
}

interface PkceState {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  callbackUrl: string;
}

/** In-memory state store for OAuth2 flows. Replace with a distributed store for multi-instance. */
const stateStore = new Map<string, PkceState>();
const STATE_TTL_MS = 10 * 60 * 1000;

function base64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generateCodeVerifier(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes.buffer);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(digest);
}

/**
 * Starts an OAuth2 authorization code flow with PKCE.
 * Redirects the user to the provider's authorization endpoint.
 *
 * ```ts
 * app.get("/auth/login", oauth2authorize({
 *   provider: providers.github,
 *   clientId: process.env.GITHUB_CLIENT_ID!,
 *   redirectUri: "https://myapp.com",
 *   callbackUrl: "/auth/callback",
 * }));
 * ```
 */
export function oauth2authorize(opts: OAuth2AuthorizeOptions): Handler {
  return async (_c) => {
    const state = crypto.randomUUID();
    const codeVerifier = await generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    stateStore.set(state, {
      state,
      codeVerifier,
      redirectUri: opts.redirectUri,
      callbackUrl: opts.callbackUrl,
    });

    // Cleanup expired states
    setTimeout(() => {
      for (const [key, entry] of stateStore) {
        if (Date.now() - new Date(entry.state).getTime() > STATE_TTL_MS) {
          stateStore.delete(key);
        }
      }
    }, STATE_TTL_MS);

    const scopes = opts.scopes ?? opts.provider.scopes;
    const params = new URLSearchParams({
      client_id: opts.provider.clientId,
      redirect_uri: opts.redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      ...opts.extraParams,
    });

    const location = `${opts.provider.authorizationUrl}?${params.toString()}`;
    return new Response(null, {
      status: 302,
      headers: { location },
    });
  };
}

/**
 * Handles the OAuth2 callback, exchanges the code for tokens, fetches the
 * user profile, and calls the user's callback to find/create the user.
 *
 * ```ts
 * app.get("/auth/callback", oauth2Callback({
 *   provider: providers.github,
 *   callback: async (profile) => {
 *     let user = await db.findUserByOAuth(profile.provider, profile.id);
 *     if (!user) user = await db.createUser({ email: profile.email, name: profile.name });
 *     return { userId: user.id, roles: ["user"] };
 *   },
 * }));
 * ```
 */
export function oauth2Callback(opts: OAuth2CallbackOptions): Handler {
  return async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    if (error) {
      if (opts.onError) return opts.onError(new Error(`OAuth2 provider error: ${error}`));
      throw HttpError.badRequest(`OAuth2 provider error: ${error}`);
    }

    if (!code || !state) {
      throw HttpError.badRequest("Missing code or state parameter");
    }

    const saved = stateStore.get(state);
    if (!saved) {
      throw HttpError.badRequest("Invalid or expired OAuth2 state");
    }
    stateStore.delete(state);

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch(opts.provider.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: new URLSearchParams({
          client_id: opts.provider.clientId,
          client_secret: opts.provider.clientSecret,
          code,
          redirect_uri: saved.redirectUri,
          grant_type: "authorization_code",
          code_verifier: saved.codeVerifier,
        }),
      });

      if (!tokenResponse.ok) {
        const body = await tokenResponse.text();
        if (opts.onError) return opts.onError(new Error(`Token exchange failed: ${body}`));
        throw HttpError.internal("Failed to exchange OAuth2 code");
      }

      const tokens = await tokenResponse.json() as { access_token?: string; token_type?: string };

      if (!tokens.access_token) {
        throw HttpError.internal("No access token received from provider");
      }

      // Fetch user profile
      const profileResponse = await fetch(opts.provider.userinfoUrl, {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/json",
        },
      });

      if (!profileResponse.ok) {
        throw HttpError.internal("Failed to fetch user profile from provider");
      }

      const raw = await profileResponse.json() as Record<string, unknown>;
      const profile = mapProfile(opts.provider.name, raw);

      // Call user callback
      const result = await opts.callback(profile);
      if (!result) {
        throw HttpError.forbidden("Authentication rejected by application");
      }

      return c.json(result);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (opts.onError) return opts.onError(err);
      throw HttpError.internal("OAuth2 authentication failed");
    }
  };
}

function mapProfile(providerName: string, raw: Record<string, unknown>): OAuth2Profile {
  switch (providerName) {
    case "google":
      return {
        id: String(raw.sub ?? raw.id ?? ""),
        email: raw.email as string | undefined,
        name: raw.name as string | undefined,
        avatar: raw.picture as string | undefined,
        provider: providerName,
        raw,
      };
    case "github":
      return {
        id: String(raw.id ?? ""),
        email: raw.email as string | undefined,
        name: raw.name as string | undefined,
        avatar: raw.avatar_url as string | undefined,
        provider: providerName,
        raw,
      };
    case "discord":
      return {
        id: String(raw.id ?? ""),
        email: raw.email as string | undefined,
        name: raw.username as string | undefined,
        avatar: raw.avatar ? `https://cdn.discordapp.com/avatars/${raw.id}/${raw.avatar}.png` : undefined,
        provider: providerName,
        raw,
      };
    default:
      return {
        id: String(raw.id ?? raw.sub ?? ""),
        email: raw.email as string | undefined,
        name: raw.name as string | undefined,
        avatar: raw.avatar as string | undefined,
        provider: providerName,
        raw,
      };
  }
}
