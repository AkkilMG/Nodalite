import type { App } from "@nodalite/core";
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyStructuredResultV2,
  Context as LambdaContext,
} from "aws-lambda";
import { responseToV1Result, v1EventToRequest } from "./v1.js";
import { responseToV2Result, v2EventToRequest } from "./v2.js";

type LambdaEvent = APIGatewayProxyEvent | APIGatewayProxyEventV2;
type LambdaResult = APIGatewayProxyResult | APIGatewayProxyStructuredResultV2;

function isV2Event(event: LambdaEvent): event is APIGatewayProxyEventV2 {
  return "version" in event && event.version === "2.0";
}

export interface LambdaAdapterOptions {
  /**
   * Called once per cold start, before the first request is handled. Use it
   * for anything expensive you want to pay for once per container instead
   * of once per request — e.g. loading an ML model into `/tmp` (see
   * `@nodalite/ml`), warming a DB connection pool, etc.
   */
  onColdStart?: () => Promise<void> | void;
}

export type LambdaHandler = (event: LambdaEvent, context: LambdaContext) => Promise<LambdaResult>;

/**
 * Wraps a Nodalite `App` as an AWS Lambda handler. Works behind API Gateway
 * HTTP API (payload v2), REST API (payload v1), and Lambda Function URLs
 * (which use the v2 shape) — the event format is auto-detected per invocation.
 *
 * ```ts
 * // handler.ts
 * import { createLambdaHandler } from '@nodalite/adapter-lambda';
 * import { app } from './app.js';
 * export const handler = createLambdaHandler(app);
 * ```
 */
export function createLambdaHandler(app: App<any>, opts: LambdaAdapterOptions = {}): LambdaHandler {
  let coldStartPromise: Promise<void> | undefined;

  return async function handler(event: LambdaEvent, context: LambdaContext): Promise<LambdaResult> {
    // Lambda freezes the process between invocations on the same warm
    // container, so a module-level flag correctly runs this exactly once
    // per container lifetime, not once per request.
    if (opts.onColdStart && !coldStartPromise) {
      coldStartPromise = Promise.resolve(opts.onColdStart());
    }
    if (coldStartPromise) await coldStartPromise;

    const v2 = isV2Event(event);
    const request = v2 ? v2EventToRequest(event) : v1EventToRequest(event);

    const sourceIp = v2
      ? (event as APIGatewayProxyEventV2).requestContext.http.sourceIp
      : (event as APIGatewayProxyEvent).requestContext.identity?.sourceIp;

    const response = await app.handle(request, {
      ip: sourceIp,
      runtime: "aws-lambda" as const,
      requestId: context.awsRequestId,
      remainingTimeMs: context.getRemainingTimeInMillis(),
      rawEvent: event,
    });

    return v2 ? responseToV2Result(response) : responseToV1Result(response);
  };
}
