import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export function v1EventToRequest(event: APIGatewayProxyEvent): Request {
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
  // Fall back to single-value headers for anything multiValueHeaders missed.
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    if (value !== undefined && !headers.has(key)) headers.set(key, value);
  }

  const method = event.httpMethod;
  const hasBody = method !== "GET" && method !== "HEAD" && event.body !== null && event.body !== undefined;
  const body = hasBody ? (event.isBase64Encoded ? Buffer.from(event.body!, "base64") : event.body) : undefined;

  return new Request(url, { method, headers, body });
}

export async function responseToV1Result(response: Response): Promise<APIGatewayProxyResult> {
  const headers: Record<string, string> = {};
  const multiValueHeaders: Record<string, string[]> = {};
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
    isBase64Encoded: true,
  };
}
