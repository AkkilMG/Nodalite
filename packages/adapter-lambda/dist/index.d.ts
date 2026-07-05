import { App } from '@nodalite/core';
import { APIGatewayProxyEvent, APIGatewayProxyEventV2, Context, APIGatewayProxyResult, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

type LambdaEvent = APIGatewayProxyEvent | APIGatewayProxyEventV2;
type LambdaResult = APIGatewayProxyResult | APIGatewayProxyStructuredResultV2;
interface LambdaAdapterOptions {
    /**
     * Called once per cold start, before the first request is handled. Use it
     * for anything expensive you want to pay for once per container instead
     * of once per request — e.g. loading an ML model into `/tmp` (see
     * `@nodalite/ml`), warming a DB connection pool, etc.
     */
    onColdStart?: () => Promise<void> | void;
}
type LambdaHandler = (event: LambdaEvent, context: Context) => Promise<LambdaResult>;
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
declare function createLambdaHandler(app: App<any>, opts?: LambdaAdapterOptions): LambdaHandler;

declare function v1EventToRequest(event: APIGatewayProxyEvent): Request;
declare function responseToV1Result(response: Response): Promise<APIGatewayProxyResult>;

declare function v2EventToRequest(event: APIGatewayProxyEventV2): Request;
declare function responseToV2Result(response: Response): Promise<APIGatewayProxyStructuredResultV2>;

export { type LambdaAdapterOptions, type LambdaHandler, createLambdaHandler, responseToV1Result, responseToV2Result, v1EventToRequest, v2EventToRequest };
