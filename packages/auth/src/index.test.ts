import { App } from "@nodalite/core";
import { describe, expect, it } from "vitest";
import { SignJWT, jwtVerify } from "jose";
import {
  jwtAuth,
  issueTokenPair,
  tokenRefreshHandler,
  revokeToken,
  providers,
  oauth2authorize,
  oauth2Callback,
  rbac,
  requireRole,
  requirePermission,
  sessions,
  csrf,
  hashPassword,
  verifyPassword,
  MemoryTokenStore,
  MemorySessionStore,
  type RbacContext,
} from "./index.js";

function req(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init);
}

const SECRET = "test-secret-key-for-auth-tests";
const SECRET_BYTES = new TextEncoder().encode(SECRET);

// ── Password Hashing ──

describe("hashPassword / verifyPassword", () => {
  it("produces a hash and verifies correctly", async () => {
    const hash = await hashPassword("mypassword");
    expect(hash).toMatch(/^pbkdf2:sha256:\d+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(await verifyPassword("mypassword", hash)).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("correct");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("rejects malformed hash string", async () => {
    expect(await verifyPassword("pw", "not-a-hash")).toBe(false);
    expect(await verifyPassword("pw", "pbkdf2:md5:100:abc:def")).toBe(false);
  });

  it("supports custom iterations", async () => {
    const hash = await hashPassword("test", { iterations: 100_000 });
    expect(await verifyPassword("test", hash)).toBe(true);
    expect(hash).toContain("100000");
  });

  it("uses unique salts", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(h1).not.toBe(h2);
    expect(await verifyPassword("same", h1)).toBe(true);
    expect(await verifyPassword("same", h2)).toBe(true);
  });
});

// ── JWT ──

describe("jwtAuth", () => {
  it("rejects missing bearer token", async () => {
    const app = new App();
    app.use("/api/*", jwtAuth({ secret: SECRET }));
    app.get("/api/me", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/api/me"));
    expect(res.status).toBe(401);
  });

  it("rejects invalid token", async () => {
    const app = new App();
    app.use("/api/*", jwtAuth({ secret: SECRET }));
    app.get("/api/me", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/api/me", {
      headers: { authorization: "Bearer invalid.token.here" },
    }));
    expect(res.status).toBe(401);
  });

  it("accepts valid token and attaches payload", async () => {
    const app = new App();
    app.use("/api/*", jwtAuth({ secret: SECRET }));
    app.get("/api/me", (c) => c.json(c.get("user")));

    const token = await new SignJWT({ sub: "user-1", tokenType: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(SECRET_BYTES);

    const res = await app.handle(req("/api/me", {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { sub: string };
    expect(body.sub).toBe("user-1");
  });

  it("supports custom contextKey", async () => {
    const app = new App();
    app.use("/api/*", jwtAuth({ secret: SECRET, contextKey: "auth" }));
    app.get("/api/me", (c) => c.json(c.get("auth")));

    const token = await new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(SECRET_BYTES);

    const res = await app.handle(req("/api/me", {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { sub: string };
    expect(body.sub).toBe("user-1");
  });

  it("supports custom getToken", async () => {
    const app = new App();
    app.use("/api/*", jwtAuth({
      secret: SECRET,
      getToken: (c) => c.req.query("token"),
    }));
    app.get("/api/me", (c) => c.json(c.get("user")));

    const token = await new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(SECRET_BYTES);

    const res = await app.handle(req(`/api/me?token=${token}`));
    expect(res.status).toBe(200);
  });
});

describe("issueTokenPair", () => {
  it("returns access and refresh tokens", async () => {
    const result = await issueTokenPair({
      secret: SECRET,
      userId: "user-1",
      roles: ["admin"],
      permissions: ["read", "write"],
    });

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.accessTokenPayload.sub).toBe("user-1");
    expect(result.accessTokenPayload.roles).toEqual(["admin"]);
    expect(result.accessTokenPayload.tokenType).toBe("access");
    expect(result.refreshTokenPayload.tokenType).toBe("refresh");
    expect(result.refreshTokenPayload.family).toBeDefined();
    expect(result.refreshTokenPayload.tokenId).toBeDefined();
  });

  it("access token is verifiable", async () => {
    const result = await issueTokenPair({ secret: SECRET, userId: "u1" });
    const { payload } = await jwtVerify(result.accessToken, SECRET_BYTES);
    expect(payload.sub).toBe("u1");
  });
});

describe("tokenRefreshHandler", () => {
  it("refreshes a valid token pair", async () => {
    const store = new MemoryTokenStore();
    const { refreshToken, refreshTokenPayload } = await issueTokenPair({
      secret: SECRET,
      userId: "user-1",
    });

    // Store the refresh token
    const now = Date.now();
    await store.set(refreshTokenPayload.tokenId, {
      tokenId: refreshTokenPayload.tokenId,
      family: refreshTokenPayload.family,
      userId: "user-1",
      revoked: false,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000,
    }, 7 * 24 * 60 * 60 * 1000);

    const app = new App();
    app.post("/auth/refresh", tokenRefreshHandler({ secret: SECRET, store }));

    const res = await app.handle(req("/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }));

    expect(res.status).toBe(200);
    const body = await res.json() as { accessToken: string; refreshToken: string };
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(body.refreshToken).not.toBe(refreshToken);
  });

  it("rejects missing refreshToken", async () => {
    const app = new App();
    app.post("/auth/refresh", tokenRefreshHandler({ secret: SECRET, store: new MemoryTokenStore() }));

    const res = await app.handle(req("/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
  });

  it("rejects revoked token and revokes family", async () => {
    const store = new MemoryTokenStore();
    const { refreshToken, refreshTokenPayload } = await issueTokenPair({
      secret: SECRET,
      userId: "user-1",
    });

    await store.set(refreshTokenPayload.tokenId, {
      tokenId: refreshTokenPayload.tokenId,
      family: refreshTokenPayload.family,
      userId: "user-1",
      revoked: true,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    }, 7 * 24 * 60 * 60 * 1000);

    const app = new App();
    app.post("/auth/refresh", tokenRefreshHandler({ secret: SECRET, store }));

    const res = await app.handle(req("/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }));
    expect(res.status).toBe(401);
  });

  it("rejects non-refresh token type", async () => {
    const accessToken = await new SignJWT({ sub: "u1", tokenType: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(SECRET_BYTES);

    const app = new App();
    app.post("/auth/refresh", tokenRefreshHandler({ secret: SECRET, store: new MemoryTokenStore() }));

    const res = await app.handle(req("/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: accessToken }),
    }));
    expect(res.status).toBe(401);
  });
});

describe("revokeToken", () => {
  it("marks token as revoked in store", async () => {
    const store = new MemoryTokenStore();
    const { refreshTokenPayload } = await issueTokenPair({ secret: SECRET, userId: "u1" });

    await store.set(refreshTokenPayload.tokenId, {
      tokenId: refreshTokenPayload.tokenId,
      family: refreshTokenPayload.family,
      userId: "u1",
      revoked: false,
      expiresAt: Date.now() + 3600_000,
    }, 3600_000);

    await revokeToken(refreshTokenPayload.tokenId, store);
    const entry = await store.get(refreshTokenPayload.tokenId);
    expect(entry?.revoked).toBe(true);
  });
});

// ── OAuth2 ──

describe("providers", () => {
  it("has google, github, discord presets", () => {
    expect(providers.google).toBeDefined();
    expect(providers.github).toBeDefined();
    expect(providers.discord).toBeDefined();
    expect(providers.google.scopes).toContain("openid");
    expect(providers.github.scopes).toContain("user:email");
  });
});

describe("oauth2authorize", () => {
  it("redirects to provider authorization URL with PKCE params", async () => {
    const app = new App();
    app.get("/auth/login", oauth2authorize({
      provider: { ...providers.github, clientId: "my-client-id", clientSecret: "secret" },
      redirectUri: "https://myapp.com",
      callbackUrl: "/auth/callback",
    }));

    const res = await app.handle(req("/auth/login"));
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("github.com/login/oauth/authorize");
    expect(location).toContain("client_id=my-client-id");
    expect(location).toContain("code_challenge=");
    expect(location).toContain("code_challenge_method=S256");
    expect(location).toContain("state=");
  });

  it("includes custom scopes", async () => {
    const app = new App();
    app.get("/auth/login", oauth2authorize({
      provider: { ...providers.github, clientId: "id", clientSecret: "secret" },
      redirectUri: "https://myapp.com",
      callbackUrl: "/auth/callback",
      scopes: ["repo", "read:user"],
    }));

    const res = await app.handle(req("/auth/login"));
    const location = res.headers.get("location")!;
    expect(location).toContain("scope=repo+read%3Auser");
  });
});

describe("oauth2Callback", () => {
  it("rejects missing code/state", async () => {
    const app = new App();
    app.get("/auth/callback", oauth2Callback({
      provider: { ...providers.github, clientId: "id", clientSecret: "secret" },
      callback: async () => ({ userId: "1" }),
    }));

    const res = await app.handle(req("/auth/callback"));
    expect(res.status).toBe(400);
  });

  it("rejects invalid state", async () => {
    const app = new App();
    app.get("/auth/callback", oauth2Callback({
      provider: { ...providers.github, clientId: "id", clientSecret: "secret" },
      callback: async () => ({ userId: "1" }),
    }));

    const res = await app.handle(req("/auth/callback?code=abc&state=invalid-state"));
    expect(res.status).toBe(400);
  });
});

// ── RBAC ──

describe("rbac", () => {
  it("builds RBAC context from JWT payload", async () => {
    const app = new App();
    app.use("/api/*", jwtAuth({ secret: SECRET }));
    app.use("/api/*", rbac({
      roles: { admin: ["read", "write", "delete"], user: ["read"] },
    }));
    app.get("/api/check", (c) => {
      const rbacCtx = c.get("rbac") as RbacContext | undefined;
      return c.json({
        isAdmin: rbacCtx?.hasRole("admin"),
        canDelete: rbacCtx?.hasPermission("delete"),
        canRead: rbacCtx?.hasPermission("read"),
      });
    });

    const token = await new SignJWT({ sub: "u1", roles: ["admin"], tokenType: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(SECRET_BYTES);

    const res = await app.handle(req("/api/check", {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { isAdmin: boolean; canDelete: boolean; canRead: boolean };
    expect(body.isAdmin).toBe(true);
    expect(body.canDelete).toBe(true);
    expect(body.canRead).toBe(true);
  });

  it("rejects when rbac middleware is missing", async () => {
    const app = new App();
    app.use("/api/*", jwtAuth({ secret: SECRET }));
    // requireRole needs rbac middleware, but we use it as middleware via app.use
    // Here we test that requireRole throws when rbac context is missing
    app.get("/api/check", (c) => {
      // Simulate what happens when rbac middleware wasn't run
      return c.json({ ok: true });
    });

    // Use requireRole as middleware via app.use to test the error
    const app2 = new App();
    app2.use("/api/*", jwtAuth({ secret: SECRET }));
    app2.use("/api/*", requireRole("admin"));
    app2.get("/api/check", (c) => c.json({ ok: true }));

    const token = await new SignJWT({ sub: "u1", roles: ["admin"], tokenType: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(SECRET_BYTES);

    const res = await app2.handle(req("/api/check", {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(403);
  });

  it("requireRole blocks unauthorized roles", async () => {
    const app = new App();
    app.use("/api/*", jwtAuth({ secret: SECRET }));
    app.use("/api/*", rbac({ roles: { admin: ["delete"] } }));
    app.get("/api/admin", (c) => c.json({ ok: true }), [requireRole("admin")]);

    const token = await new SignJWT({ sub: "u1", roles: ["user"], tokenType: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(SECRET_BYTES);

    const res = await app.handle(req("/api/admin", {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(403);
  });

  it("requireRole allows correct role", async () => {
    const app = new App();
    app.use("/api/*", jwtAuth({ secret: SECRET }));
    app.use("/api/*", rbac({ roles: { admin: ["delete"] } }));
    app.get("/api/admin", (c) => c.json({ ok: true }), [requireRole("admin")]);

    const token = await new SignJWT({ sub: "u1", roles: ["admin"], tokenType: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(SECRET_BYTES);

    const res = await app.handle(req("/api/admin", {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(200);
  });

  it("requirePermission checks permissions from roles", async () => {
    const app = new App();
    app.use("/api/*", jwtAuth({ secret: SECRET }));
    app.use("/api/*", rbac({ roles: { editor: ["read", "write"] } }));
    app.put("/api/doc", (c) => c.json({ ok: true }), [requirePermission("write")]);
    app.delete("/api/doc", (c) => c.json({ ok: true }), [requirePermission("delete")]);

    const token = await new SignJWT({ sub: "u1", roles: ["editor"], tokenType: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(SECRET_BYTES);

    const headers = { authorization: `Bearer ${token}` };
    const res1 = await app.handle(req("/api/doc", { method: "PUT", headers }));
    expect(res1.status).toBe(200);
    const res2 = await app.handle(req("/api/doc", { method: "DELETE", headers }));
    expect(res2.status).toBe(403);
  });

  it("supports custom extractRoles", async () => {
    const app = new App();
    app.use("/api/*", jwtAuth({ secret: SECRET }));
    app.use("/api/*", rbac({
      roles: { superadmin: ["all"] },
      extractRoles: (payload) => {
        const p = payload as { custom_roles?: string[] };
        return p.custom_roles ?? [];
      },
    }));
    app.get("/api/admin", (c) => c.json({ ok: true }), [requireRole("superadmin")]);

    const token = await new SignJWT({ sub: "u1", custom_roles: ["superadmin"], tokenType: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(SECRET_BYTES);

    const res = await app.handle(req("/api/admin", {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(200);
  });

  it("hasAnyRole and hasAllPermissions work correctly", async () => {
    const app = new App();
    app.use("/api/*", jwtAuth({ secret: SECRET }));
    app.use("/api/*", rbac({ roles: { editor: ["read", "write"], viewer: ["read"] } }));
    app.get("/api/check", (c) => {
      const ctx = c.get("rbac") as RbacContext | undefined;
      return c.json({
        anyRole: ctx?.hasAnyRole("admin", "editor"),
        allPerms: ctx?.hasAllPermissions("read", "write"),
        allPermsMissing: ctx?.hasAllPermissions("read", "delete"),
      });
    });

    const token = await new SignJWT({ sub: "u1", roles: ["editor"], tokenType: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(SECRET_BYTES);

    const res = await app.handle(req("/api/check", {
      headers: { authorization: `Bearer ${token}` },
    }));
    const body = await res.json() as { anyRole: boolean; allPerms: boolean; allPermsMissing: boolean };
    expect(body.anyRole).toBe(true);
    expect(body.allPerms).toBe(true);
    expect(body.allPermsMissing).toBe(false);
  });
});

// ── Sessions ──

describe("sessions", () => {
  it("creates and persists session data", async () => {
    const app = new App();
    app.use("*", sessions({ secret: SECRET }));
    app.get("/login", async (c) => {
      const session = c.get("session") as Record<string, unknown> | undefined;
      if (session) session.userId = "user-1";
      return c.json({ loggedIn: true });
    });
    app.get("/me", (c) => {
      const session = c.get("session") as Record<string, unknown> | undefined;
      return c.json({ userId: session?.userId });
    });

    const loginRes = await app.handle(req("/login"));
    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers.get("set-cookie")!;
    expect(setCookie).toContain("sid=");

    const sid = setCookie.split("sid=")[1]!.split(";")[0]!;
    const meRes = await app.handle(req("/me", {
      headers: { cookie: `sid=${sid}` },
    }));
    expect(meRes.status).toBe(200);
    const body = await meRes.json() as { userId: string };
    expect(body.userId).toBe("user-1");
  });

  it("uses custom contextKey", async () => {
    const app = new App();
    app.use("*", sessions({ secret: SECRET, contextKey: "sess" }));
    app.get("/test", (c) => {
      const sess = c.get("sess") as Record<string, unknown> | undefined;
      if (sess) sess.val = 42;
      return c.json({ val: sess?.val });
    });

    const res = await app.handle(req("/test"));
    const setCookie = res.headers.get("set-cookie")!;
    const sid = setCookie.split("sid=")[1]!.split(";")[0]!;
    const res2 = await app.handle(req("/test", {
      headers: { cookie: `sid=${sid}` },
    }));
    const body = await res2.json() as { val: number };
    expect(body.val).toBe(42);
  });

  it("MemorySessionStore works correctly", async () => {
    const store = new MemorySessionStore();
    await store.set("id1", { foo: "bar" }, 60);
    const data = await store.get("id1");
    expect(data).toEqual({ foo: "bar" });

    await store.destroy("id1");
    expect(await store.get("id1")).toBeNull();
  });
});

// ── CSRF ──

describe("csrf", () => {
  it("seeds CSRF cookie on safe methods", async () => {
    const app = new App();
    app.use("*", csrf());
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/"));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toContain("XSRF-TOKEN=");
  });

  it("rejects POST without CSRF token", async () => {
    const app = new App();
    app.use("*", csrf());
    app.post("/", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/", { method: "POST" }));
    expect(res.status).toBe(403);
  });

  it("accepts POST with matching header token", async () => {
    const app = new App();
    app.use("*", csrf());
    app.get("/token", (c) => {
      const cookies = c.req.header("cookie") ?? "";
      const match = cookies.split(";").map(s => s.trim()).find(s => s.startsWith("XSRF-TOKEN="));
      return c.json({ token: match?.split("=")[1] });
    });
    app.post("/", (c) => c.json({ ok: true }));

    // First get the token
    const getRes = await app.handle(req("/token"));
    const getCookies = getRes.headers.get("set-cookie")!;
    const token = getCookies.split("XSRF-TOKEN=")[1]!.split(";")[0]!;

    // Then POST with the token
    const postRes = await app.handle(req("/", {
      method: "POST",
      headers: {
        cookie: `XSRF-TOKEN=${token}`,
        "x-xsrf-token": token,
      },
    }));
    expect(postRes.status).toBe(200);
  });

  it("uses custom cookie and header names", async () => {
    const app = new App();
    app.use("*", csrf({ cookieName: "CSRF", headerName: "X-CSRF" }));
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.handle(req("/"));
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toContain("CSRF=");
  });
});

// ── MemoryTokenStore ──

describe("MemoryTokenStore", () => {
  it("stores and retrieves tokens", async () => {
    const store = new MemoryTokenStore();
    const now = Date.now();
    await store.set("tok1", {
      tokenId: "tok1",
      family: "fam1",
      userId: "u1",
      revoked: false,
      expiresAt: now + 3600_000,
    }, 3600_000);

    const entry = await store.get("tok1");
    expect(entry).toBeDefined();
    expect(entry?.tokenId).toBe("tok1");
    expect(entry?.revoked).toBe(false);
  });

  it("returns null for expired tokens", async () => {
    const store = new MemoryTokenStore();
    await store.set("tok1", {
      tokenId: "tok1",
      family: "fam1",
      userId: "u1",
      revoked: false,
      expiresAt: Date.now() - 1000,
    }, 1);

    expect(await store.get("tok1")).toBeNull();
  });

  it("revokes entire family", async () => {
    const store = new MemoryTokenStore();
    const now = Date.now();
    await store.set("tok1", { tokenId: "tok1", family: "fam1", userId: "u1", revoked: false, expiresAt: now + 3600_000 }, 3600_000);
    await store.set("tok2", { tokenId: "tok2", family: "fam1", userId: "u1", revoked: false, expiresAt: now + 3600_000 }, 3600_000);
    await store.set("tok3", { tokenId: "tok3", family: "fam2", userId: "u2", revoked: false, expiresAt: now + 3600_000 }, 3600_000);

    await store.revokeFamily("fam1");

    const t1 = await store.get("tok1");
    const t2 = await store.get("tok2");
    const t3 = await store.get("tok3");
    expect(t1?.revoked).toBe(true);
    expect(t2?.revoked).toBe(true);
    expect(t3?.revoked).toBe(false);
  });

  it("deletes tokens", async () => {
    const store = new MemoryTokenStore();
    const now = Date.now();
    await store.set("tok1", { tokenId: "tok1", family: "fam1", userId: "u1", revoked: false, expiresAt: now + 3600_000 }, 3600_000);
    await store.delete("tok1");
    expect(await store.get("tok1")).toBeNull();
  });
});

// ── Full integration: JWT + RBAC + Sessions ──

describe("integration", () => {
  it("complete auth flow: issue tokens, refresh, RBAC check", async () => {
    const store = new MemoryTokenStore();
    const app = new App();

    app.use("/api/*", jwtAuth({ secret: SECRET }));
    app.use("/api/*", rbac({ roles: { admin: ["read", "write"], user: ["read"] } }));
    app.post("/auth/refresh", tokenRefreshHandler({ secret: SECRET, store }));
    app.get("/api/profile", (c) => c.json(c.get("user")));
    app.get("/api/admin", (c) => c.json({ admin: true }), [requireRole("admin")]);

    // Issue tokens
    const tokens = await issueTokenPair({
      secret: SECRET,
      userId: "user-1",
      roles: ["admin"],
    });

    // Store refresh token
    await store.set(tokens.refreshTokenPayload.tokenId, {
      tokenId: tokens.refreshTokenPayload.tokenId,
      family: tokens.refreshTokenPayload.family,
      userId: "user-1",
      revoked: false,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    }, 7 * 24 * 60 * 60 * 1000);

    // Access protected route
    const profileRes = await app.handle(req("/api/profile", {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    }));
    expect(profileRes.status).toBe(200);

    // Access admin route
    const adminRes = await app.handle(req("/api/admin", {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    }));
    expect(adminRes.status).toBe(200);

    // Refresh tokens
    const refreshRes = await app.handle(req("/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    }));
    expect(refreshRes.status).toBe(200);
    const newTokens = await refreshRes.json() as { accessToken: string; refreshToken: string };
    expect(newTokens.accessToken).toBeDefined();
    expect(newTokens.refreshToken).toBeDefined();
    expect(newTokens.refreshToken).not.toBe(tokens.refreshToken);

    // Old refresh token should be gone
    const oldEntry = await store.get(tokens.refreshTokenPayload.tokenId);
    expect(oldEntry).toBeNull();

    // New access token should work
    const newProfileRes = await app.handle(req("/api/profile", {
      headers: { authorization: `Bearer ${newTokens.accessToken}` },
    }));
    expect(newProfileRes.status).toBe(200);
  });
});
