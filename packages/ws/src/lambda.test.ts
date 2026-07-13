import { describe, it, expect, vi, beforeEach } from "vitest";
import { WsServer } from "./index.js";
import { createLambdaWsHandler } from "./lambda.js";
import type { ConnectionStore, ConnectionMetadata } from "./lambda-store.js";
import type { WsPlatform } from "./types.js";

// ---------------------------------------------------------------------------
// In-memory ConnectionStore for testing
// ---------------------------------------------------------------------------

function createMockStore(): ConnectionStore & { data: Map<string, ConnectionMetadata> } {
  const data = new Map<string, ConnectionMetadata>();
  return {
    data,
    async set(id: string, metadata: ConnectionMetadata) { data.set(id, metadata); },
    async get(id: string) { return data.get(id) ?? null; },
    async delete(id: string) { data.delete(id); },
    async findBy(key: string, value: unknown) {
      return [...data.values()].filter((m) => m.data?.[key] === value);
    },
  };
}

function createConnectEvent(overrides?: Partial<{
  connectionId: string;
  connectedAt: number;
  domainName: string;
  stage: string;
  sourceIp: string;
  apiId: string;
  queryStringParameters: Record<string, string>;
  headers: Record<string, string>;
}>) {
  return {
    requestContext: {
      routeKey: "$connect",
      messageId: "msg-1",
      eventType: "CONNECT" as const,
      messageDirection: "IN" as const,
      connectionId: overrides?.connectionId ?? "conn-test-1",
      apiId: overrides?.apiId ?? "api-test",
      connectedAt: overrides?.connectedAt ?? Date.now(),
      requestTimeEpoch: Date.now(),
      identity: { sourceIp: overrides?.sourceIp ?? "127.0.0.1", userAgent: "test" },
      domainName: overrides?.domainName ?? "test.execute-api.us-east-1.amazonaws.com",
      stage: overrides?.stage ?? "dev",
    },
    headers: overrides?.headers ?? {},
    queryStringParameters: overrides?.queryStringParameters,
  };
}

function createMessageEvent(body: string, connectionId = "conn-test-1", opts?: { isBase64Encoded?: boolean }) {
  return {
    requestContext: {
      routeKey: "$default",
      messageId: "msg-2",
      eventType: "MESSAGE" as const,
      messageDirection: "IN" as const,
      connectionId,
      apiId: "api-test",
      connectedAt: Date.now(),
      requestTimeEpoch: Date.now(),
      identity: { sourceIp: "127.0.0.1" },
      domainName: "test.execute-api.us-east-1.amazonaws.com",
      stage: "dev",
    },
    body,
    isBase64Encoded: opts?.isBase64Encoded ?? false,
  };
}

function createDisconnectEvent(connectionId = "conn-test-1") {
  return {
    requestContext: {
      routeKey: "$disconnect",
      messageId: "msg-3",
      eventType: "DISCONNECT" as const,
      messageDirection: "IN" as const,
      connectionId,
      apiId: "api-test",
      connectedAt: Date.now(),
      requestTimeEpoch: Date.now(),
      identity: { sourceIp: "127.0.0.1" },
      domainName: "test.execute-api.us-east-1.amazonaws.com",
      stage: "dev",
    },
  };
}

const mockContext = {
  awsRequestId: "req-1",
  getRemainingTimeInMillis: () => 30000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("@nodalite/ws/lambda", () => {
  let store: ReturnType<typeof createMockStore>;
  let ws: WsServer;
  let postToConnection: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = createMockStore();
    ws = new WsServer({ heartbeat: false });
    postToConnection = vi.fn().mockResolvedValue(undefined);
  });

  it("should handle CONNECT events", async () => {
    ws.path("/", {});

    const handler = createLambdaWsHandler(ws, { store, postToConnection });
    const event = createConnectEvent();
    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    expect(store.data.has("conn-test-1")).toBe(true);
  });

  it("should return 500 when store.set fails on CONNECT", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    store.set = vi.fn().mockRejectedValue(new Error("DynamoDB error"));
    ws.path("/", {});

    const handler = createLambdaWsHandler(ws, { store, postToConnection });
    const event = createConnectEvent();
    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(500);
    spy.mockRestore();
  });

  it("should call open handlers on CONNECT", async () => {
    const openFn = vi.fn();
    ws.path("/", { open: openFn });

    const handler = createLambdaWsHandler(ws, { store, postToConnection });
    const event = createConnectEvent();
    await handler(event, mockContext);

    await new Promise((r) => setTimeout(r, 50));
    expect(openFn).toHaveBeenCalled();
  });

  it("should set platform to aws-lambda with connection info", async () => {
    let capturedPlatform: WsPlatform | undefined;
    ws.path("/", {
      open: (conn) => { capturedPlatform = conn.platform; },
    });

    const handler = createLambdaWsHandler(ws, { store, postToConnection });
    const event = createConnectEvent({ connectionId: "conn-xyz", sourceIp: "10.0.0.1" });
    await handler(event, mockContext);
    await new Promise((r) => setTimeout(r, 50));

    expect(capturedPlatform.runtime).toBe("aws-lambda");
    expect(capturedPlatform.connectionId).toBe("conn-xyz");
    expect(capturedPlatform.ip).toBe("10.0.0.1");
  });

  it("should handle MESSAGE events", async () => {
    const msgFn = vi.fn();
    ws.path("/", { message: msgFn });

    const handler = createLambdaWsHandler(ws, { store, postToConnection });

    // Connect first
    await handler(createConnectEvent(), mockContext);
    await new Promise((r) => setTimeout(r, 50));

    // Send message
    const result = await handler(createMessageEvent("hello"), mockContext);
    expect(result.statusCode).toBe(200);
    expect(msgFn).toHaveBeenCalled();
  });

  it("should return 404 for MESSAGE when connection not found in store", async () => {
    ws.path("/", {});

    const handler = createLambdaWsHandler(ws, { store, postToConnection });
    const event = createMessageEvent("hello", "unknown-conn");
    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(404);
  });

  it("should send data via postToConnection when conn.send() is called", async () => {
    ws.path("/", {
      open: (conn) => { conn.send("welcome"); },
    });

    const handler = createLambdaWsHandler(ws, { store, postToConnection });
    await handler(createConnectEvent(), mockContext);
    await new Promise((r) => setTimeout(r, 50));

    expect(postToConnection).toHaveBeenCalled();
    const [endpoint, connectionId, data] = postToConnection.mock.calls[0];
    expect(endpoint).toContain("test.execute-api.us-east-1.amazonaws.com");
    expect(connectionId).toBe("conn-test-1");
    expect(data).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(data)).toBe("welcome");
  });

  it("should use callbackUrl when provided", async () => {
    ws.path("/", {
      open: (conn) => { conn.send("hi"); },
    });

    const handler = createLambdaWsHandler(ws, {
      store,
      postToConnection,
      callbackUrl: "https://custom-endpoint.example.com/prod",
    });
    await handler(createConnectEvent(), mockContext);
    await new Promise((r) => setTimeout(r, 50));

    const [endpoint] = postToConnection.mock.calls[0];
    expect(endpoint).toBe("https://custom-endpoint.example.com/prod");
  });

  it("should handle DISCONNECT events", async () => {
    const closeFn = vi.fn();
    ws.path("/", { close: closeFn });

    const handler = createLambdaWsHandler(ws, { store, postToConnection });
    await handler(createConnectEvent(), mockContext);
    await new Promise((r) => setTimeout(r, 50));

    const result = await handler(createDisconnectEvent(), mockContext);
    expect(result.statusCode).toBe(200);

    await new Promise((r) => setTimeout(r, 50));
    expect(closeFn).toHaveBeenCalled();
  });

  it("should remove connection from store on DISCONNECT", async () => {
    ws.path("/", {});

    const handler = createLambdaWsHandler(ws, { store, postToConnection });
    await handler(createConnectEvent(), mockContext);
    await new Promise((r) => setTimeout(r, 50));

    expect(store.data.has("conn-test-1")).toBe(true);

    await handler(createDisconnectEvent(), mockContext);
    expect(store.data.has("conn-test-1")).toBe(false);
  });

  it("should handle query parameters in CONNECT", async () => {
    let capturedUrl: string;
    ws.path("/", {
      open: (conn) => { capturedUrl = conn.request.url; },
    });

    const handler = createLambdaWsHandler(ws, { store, postToConnection });
    const event = createConnectEvent({
      queryStringParameters: { token: "abc123", room: "general" },
    });
    await handler(event, mockContext);
    await new Promise((r) => setTimeout(r, 50));

    const url = new URL(capturedUrl!);
    expect(url.searchParams.get("token")).toBe("abc123");
    expect(url.searchParams.get("room")).toBe("general");
  });

  it("should handle base64 encoded messages", async () => {
    const msgFn = vi.fn();
    ws.path("/", { message: msgFn });

    const handler = createLambdaWsHandler(ws, { store, postToConnection });
    await handler(createConnectEvent(), mockContext);
    await new Promise((r) => setTimeout(r, 50));

    const raw = Buffer.from("binary data").toString("base64");
    await handler(createMessageEvent(raw, "conn-test-1", { isBase64Encoded: true }), mockContext);

    expect(msgFn).toHaveBeenCalled();
  });

  it("should return 400 for unknown event types", async () => {
    ws.path("/", {});

    const handler = createLambdaWsHandler(ws, { store, postToConnection });
    const event = {
      requestContext: {
        routeKey: "$unknown",
        messageId: "msg-x",
        eventType: "UNKNOWN" as unknown as "CONNECT" | "MESSAGE" | "DISCONNECT",
        messageDirection: "IN" as const,
        connectionId: "conn-1",
        apiId: "api-test",
        connectedAt: Date.now(),
        requestTimeEpoch: Date.now(),
        identity: { sourceIp: "127.0.0.1" },
        domainName: "test.execute-api.us-east-1.amazonaws.com",
        stage: "dev",
      },
    };
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
  });

  it("should return connection not found for DISCONNECT with unknown connection", async () => {
    ws.path("/", {});

    const handler = createLambdaWsHandler(ws, { store, postToConnection });
    // Disconnect without prior connect — should not throw
    const result = await handler(createDisconnectEvent("unknown"), mockContext);
    expect(result.statusCode).toBe(200);
  });

  it("should register connection in WsServer on CONNECT", async () => {
    ws.path("/", {});

    const handler = createLambdaWsHandler(ws, { store, postToConnection });
    await handler(createConnectEvent({ connectionId: "conn-abc" }), mockContext);

    expect(ws.getConnection("conn-abc")).toBeDefined();
  });

  it("should remove connection from WsServer on DISCONNECT", async () => {
    ws.path("/", {});

    const handler = createLambdaWsHandler(ws, { store, postToConnection });
    await handler(createConnectEvent({ connectionId: "conn-abc" }), mockContext);
    await new Promise((r) => setTimeout(r, 50));

    expect(ws.getConnection("conn-abc")).toBeDefined();

    await handler(createDisconnectEvent("conn-abc"));
    expect(ws.getConnection("conn-abc")).toBeUndefined();
  });

  it("should cache connections within a single handler", async () => {
    const openFn = vi.fn();
    ws.path("/", { open: openFn });

    const handler = createLambdaWsHandler(ws, { store, postToConnection });

    // Connect
    await handler(createConnectEvent(), mockContext);
    await new Promise((r) => setTimeout(r, 50));

    // Message — should reuse cached connection (not create new)
    await handler(createMessageEvent("msg1"), mockContext);

    // openFn should only be called once (during CONNECT)
    expect(openFn).toHaveBeenCalledTimes(1);
  });

  it("should call conn.close on Lambda by removing from store", async () => {
    ws.path("/", {
      open: (conn) => { conn.close(1000, "server done"); },
    });

    const handler = createLambdaWsHandler(ws, { store, postToConnection });
    await handler(createConnectEvent(), mockContext);
    await new Promise((r) => setTimeout(r, 50));

    // The closeFn calls store.delete
    expect(store.data.has("conn-test-1")).toBe(false);
  });
});
