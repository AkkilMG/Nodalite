import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export function v2EventToRequest(event: APIGatewayProxyEventV2): Request {
  const host = event.headers.host ?? event.requestContext.domainName ?? "lambda.local";
  const proto = event.headers["x-forwarded-proto"] ?? "https";
  const query = event.rawQueryString ? `?${event.rawQueryString}` : "";
  const url = `${proto}://${host}${event.rawPath}${query}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(event.headers)) {
    if (value !== undefined) headers.set(key, value);
  }
  if (event.cookies?.length) headers.set("cookie", event.cookies.join("; "));

  const method = event.requestContext.http.method;
  const hasBody = method !== "GET" && method !== "HEAD" && event.body !== undefined;
  const body = hasBody ? (event.isBase64Encoded ? Buffer.from(event.body!, "base64") : event.body) : undefined;

  return new Request(url, { method, headers, body });
}

export async function responseToV2Result(response: Response): Promise<APIGatewayProxyStructuredResultV2> {
  const headers: Record<string, string> = {};
  const cookies: string[] = [];
  response.headers.forEach((value, key) => {
    if (key === "set-cookie") cookies.push(value);
    else headers[key] = value;
  });

  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    statusCode: response.status,
    headers,
    cookies: cookies.length ? cookies : undefined,
    body: buffer.toString("base64"),
    isBase64Encoded: true,
  };
}
