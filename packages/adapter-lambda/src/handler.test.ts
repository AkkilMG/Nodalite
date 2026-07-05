import { App } from "@nodalite/core";
import type { APIGatewayProxyEvent, APIGatewayProxyEventV2, Context as LambdaContext } from "aws-lambda";
import { describe, expect, it } from "vitest";
import { createLambdaHandler } from "./handler.js";

function fakeLambdaContext(): LambdaContext {
  return {
    awsRequestId: "req-123",
    getRemainingTimeInMillis: () => 5000,
  } as unknown as LambdaContext;
}

function v2Event(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: "/health",
    rawQueryString: "",
    headers: { host: "abc123.execute-api.us-east-1.amazonaws.com" },
    requestContext: {
      http: { method: "GET", path: "/health", sourceIp: "203.0.113.5" },
      domainName: "abc123.execute-api.us-east-1.amazonaws.com",
    },
    isBase64Encoded: false,
    ...overrides,
  } as unknown as APIGatewayProxyEventV2;
}

function v1Event(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: "GET",
    path: "/health",
    headers: { Host: "example.execute-api.us-east-1.amazonaws.com" },
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: {},
    body: null,
    isBase64Encoded: false,
    requestContext: { identity: { sourceIp: "198.51.100.2" }, domainName: "example.execute-api.us-east-1.amazonaws.com" },
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

describe("createLambdaHandler", () => {
  it("handles a v2 (HTTP API) GET request", async () => {
    const app = new App();
    app.get("/health", (c) => c.json({ ok: true, ip: c.platform.ip }));
    const handler = createLambdaHandler(app);

    const result: any = await handler(v2Event(), fakeLambdaContext());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(Buffer.from(result.body, "base64").toString("utf8"));
    expect(body).toEqual({ ok: true, ip: "203.0.113.5" });
  });

  it("handles a v2 POST with a JSON body", async () => {
    const app = new App();
    app.post("/echo", async (c) => c.json(await c.req.json()));
    const handler = createLambdaHandler(app);

    const payload = JSON.stringify({ hello: "world" });
    const event = v2Event({
      rawPath: "/echo",
      requestContext: {
        http: { method: "POST", path: "/echo", sourceIp: "203.0.113.5" },
        domainName: "abc123.execute-api.us-east-1.amazonaws.com",
      } as any,
      headers: { host: "abc123.execute-api.us-east-1.amazonaws.com", "content-type": "application/json" },
      body: payload,
    });

    const result: any = await handler(event, fakeLambdaContext());
    const body = JSON.parse(Buffer.from(result.body, "base64").toString("utf8"));
    expect(body).toEqual({ hello: "world" });
  });

  it("handles a v1 (REST API) GET request", async () => {
    const app = new App();
    app.get("/health", (c) => c.json({ ok: true, ip: c.platform.ip }));
    const handler = createLambdaHandler(app);

    const result: any = await handler(v1Event(), fakeLambdaContext());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(Buffer.from(result.body, "base64").toString("utf8"));
    expect(body).toEqual({ ok: true, ip: "198.51.100.2" });
  });

  it("runs onColdStart exactly once across multiple invocations", async () => {
    let calls = 0;
    const app = new App();
    app.get("/health", (c) => c.json({ ok: true }));
    const handler = createLambdaHandler(app, { onColdStart: () => void calls++ });

    await handler(v2Event(), fakeLambdaContext());
    await handler(v2Event(), fakeLambdaContext());
    await handler(v2Event(), fakeLambdaContext());
    expect(calls).toBe(1);
  });
});
