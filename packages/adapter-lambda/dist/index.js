// src/v1.ts
function v1EventToRequest(event) {
  const host = event.headers.Host ?? event.headers.host ?? event.requestContext.domainName ?? "lambda.local";
  const proto = event.headers["X-Forwarded-Proto"] ?? event.headers["x-forwarded-proto"] ?? "https";
  const searchParams = new URLSearchParams();
  for (const [key, values] of Object.entries(event.multiValueQueryStringParameters ?? {})) {
    for (const v of values ?? []) searchParams.append(key, v);
  }
  const query = searchParams.toString();
  const url = `${proto}://${host}${event.path}${query ? `?${query}` : ""}`;
  const headers = new Headers();
  for (const [key, values] of Object.entries(event.multiValueHeaders ?? {})) {
    for (const v of values ?? []) headers.append(key, v);
  }
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    if (value !== void 0 && !headers.has(key)) headers.set(key, value);
  }
  const method = event.httpMethod;
  const hasBody = method !== "GET" && method !== "HEAD" && event.body !== null && event.body !== void 0;
  const body = hasBody ? event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body : void 0;
  return new Request(url, { method, headers, body });
}
async function responseToV1Result(response) {
  const headers = {};
  const multiValueHeaders = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
    multiValueHeaders[key] = key === "set-cookie" ? value.split(", ") : [value];
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    statusCode: response.status,
    headers,
    multiValueHeaders,
    body: buffer.toString("base64"),
    isBase64Encoded: true
  };
}

// src/v2.ts
function v2EventToRequest(event) {
  const host = event.headers.host ?? event.requestContext.domainName ?? "lambda.local";
  const proto = event.headers["x-forwarded-proto"] ?? "https";
  const query = event.rawQueryString ? `?${event.rawQueryString}` : "";
  const url = `${proto}://${host}${event.rawPath}${query}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(event.headers)) {
    if (value !== void 0) headers.set(key, value);
  }
  if (event.cookies?.length) headers.set("cookie", event.cookies.join("; "));
  const method = event.requestContext.http.method;
  const hasBody = method !== "GET" && method !== "HEAD" && event.body !== void 0;
  const body = hasBody ? event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body : void 0;
  return new Request(url, { method, headers, body });
}
async function responseToV2Result(response) {
  const headers = {};
  const cookies = [];
  response.headers.forEach((value, key) => {
    if (key === "set-cookie") cookies.push(value);
    else headers[key] = value;
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    statusCode: response.status,
    headers,
    cookies: cookies.length ? cookies : void 0,
    body: buffer.toString("base64"),
    isBase64Encoded: true
  };
}

// src/handler.ts
function isV2Event(event) {
  return "version" in event && event.version === "2.0";
}
function createLambdaHandler(app, opts = {}) {
  let coldStartPromise;
  return async function handler(event, context) {
    if (opts.onColdStart && !coldStartPromise) {
      coldStartPromise = Promise.resolve(opts.onColdStart());
    }
    if (coldStartPromise) await coldStartPromise;
    const v2 = isV2Event(event);
    const request = v2 ? v2EventToRequest(event) : v1EventToRequest(event);
    const sourceIp = v2 ? event.requestContext.http.sourceIp : event.requestContext.identity?.sourceIp;
    const response = await app.handle(request, {
      ip: sourceIp,
      runtime: "aws-lambda",
      requestId: context.awsRequestId,
      remainingTimeMs: context.getRemainingTimeInMillis(),
      rawEvent: event
    });
    return v2 ? responseToV2Result(response) : responseToV1Result(response);
  };
}
export {
  createLambdaHandler,
  responseToV1Result,
  responseToV2Result,
  v1EventToRequest,
  v2EventToRequest
};
