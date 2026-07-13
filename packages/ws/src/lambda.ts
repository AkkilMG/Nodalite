import type { WsServer } from "./server.js";
import { WsConnection } from "./connection.js";
import type { WsMessage, WsPlatform } from "./types.js";
import type { ConnectionStore, ConnectionMetadata } from "./lambda-store.js";
import { RoomManager } from "./rooms.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Simplified API Gateway WebSocket event shape. */
interface ApiGatewayWsEvent {
  requestContext: {
    routeKey: string;
    messageId: string;
    eventType: "CONNECT" | "MESSAGE" | "DISCONNECT";
    messageDirection: "IN";
    connectionId: string;
    apiId: string;
    connectedAt: number;
    requestTimeEpoch: number;
    identity: { sourceIp: string; userAgent?: string };
    domainName: string;
    stage: string;
  };
  headers?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}

interface ApiGatewayWsContext {
  awsRequestId: string;
  getRemainingTimeInMillis(): number;
}

export interface LambdaWsOptions {
  /** Connection store for persisting connection state. */
  store: ConnectionStore;
  /**
   * API Gateway Management API endpoint URL.
   * If not provided, it will be derived from the event's requestContext.
   */
  callbackUrl?: string;
  /**
   * Function to send data to a connected client via API Gateway Management API.
   * Inject this to avoid bundling the AWS SDK in the adapter itself.
   * Signature: (endpoint, connectionId, data) => Promise<void>
   */
  postToConnection?: (endpoint: string, connectionId: string, data: Uint8Array) => Promise<void>;
}

export interface LambdaWsHandler {
  (event: ApiGatewayWsEvent, context: ApiGatewayWsContext): Promise<{ statusCode: number; body?: string }>;
}

// ---------------------------------------------------------------------------
// Default postToConnection (no-op if not provided)
// ---------------------------------------------------------------------------

async function defaultPostToConnection(
  _endpoint: string,
  _connectionId: string,
  _data: Uint8Array,
): Promise<void> {
  console.warn(
    "[nodalite:ws/lambda] postToConnection not implemented. " +
      "Provide a postToConnection function in LambdaWsOptions to send messages to clients.",
  );
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Create a Lambda handler for API Gateway WebSocket API.
 *
 * ```ts
 * import { WsServer } from '@nodalite/ws';
 * import { createLambdaWsHandler } from '@nodalite/ws/lambda';
 * import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
 *
 * const ws = new WsServer();
 *
 * export const handler = createLambdaWsHandler(ws, {
 *   store: new DynamoDBConnectionStore({ client: new DynamoDBClient({}) }),
 *   postToConnection: async (endpoint, connectionId, data) => {
 *     const client = new ApiGatewayManagementApiClient({ endpoint });
 *     await client.send(new PostToConnectionCommand({
 *       ConnectionId: connectionId,
 *       Data: data,
 *     }));
 *   },
 * });
 * ```
 */
export function createLambdaWsHandler(wsServer: WsServer, opts: LambdaWsOptions): LambdaWsHandler {
  const { store, postToConnection = defaultPostToConnection } = opts;

  // Cache connections in memory (within a single Lambda invocation)
  const connCache = new Map<string, WsConnection>();

  function deriveEndpoint(event: ApiGatewayWsEvent): string {
    if (opts.callbackUrl) return opts.callbackUrl;
    const { domainName, stage } = event.requestContext;
    return `https://${domainName}/${stage}`;
  }

  function createConnection(event: ApiGatewayWsEvent): WsConnection {
    const { connectionId } = event.requestContext;
    const url = new URL(
      `https://${event.requestContext.domainName}`,
    );

    // Add query parameters if present
    if (event.queryStringParameters) {
      for (const [key, value] of Object.entries(event.queryStringParameters)) {
        if (value !== undefined) url.searchParams.set(key, value);
      }
    }

    const request = new Request(url.toString(), {
      method: "GET",
      headers: new Headers(event.headers as Record<string, string>),
    });

    const platform: WsPlatform = {
      runtime: "aws-lambda",
      ip: event.requestContext.identity.sourceIp,
      connectionId,
      apiId: event.requestContext.apiId,
    };

    const conn = new WsConnection({
      id: connectionId,
      request,
      remoteAddress: event.requestContext.identity.sourceIp,
      platform,
      roomManager: (wsServer as unknown as { _rooms: RoomManager })._rooms,
    });

    // Wire up via shared bridgeConnection — uses API Gateway Management API for send
    const endpoint = deriveEndpoint(event);
    wsServer._bridgeConnection(conn, {
      send: (data: WsMessage) => {
        const bytes = typeof data === "string"
          ? new TextEncoder().encode(data)
          : new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
        postToConnection(endpoint, connectionId, bytes).catch((err) => {
          console.error(`[nodalite:ws/lambda] Failed to send to ${connectionId}:`, err);
        });
      },
      close: () => {
        // In Lambda, the connection is closed when the WebSocket API
        // connection is cleaned up. We just remove it from the store.
        store.delete(connectionId).catch(() => {});
      },
    });

    connCache.set(connectionId, conn);
    return conn;
  }

  return async function handler(
    event: ApiGatewayWsEvent,
    _context: ApiGatewayWsContext,
  ): Promise<{ statusCode: number; body?: string }> {
    const { eventType, connectionId } = event.requestContext;

    switch (eventType) {
      case "CONNECT": {
        // Register the connection
        const metadata: ConnectionMetadata = {
          connectionId,
          connectedAt: event.requestContext.connectedAt,
        };

        try {
          await store.set(connectionId, metadata);
        } catch (err) {
          console.error("[nodalite:ws/lambda] Failed to store connection:", err);
          return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
        }

        // Create connection and run open handlers
        const conn = createConnection(event);

        // Run open handlers
        wsServer._runOpenHandlers(conn);

        return { statusCode: 200, body: "Connected" };
      }

      case "MESSAGE": {
        // Retrieve or create connection
        let conn = connCache.get(connectionId);
        if (!conn) {
          const metadata = await store.get(connectionId);
          if (!metadata) {
            return { statusCode: 404, body: JSON.stringify({ error: "Connection not found" }) };
          }
          conn = createConnection(event);
          // Restore custom metadata via typed state store
          if (metadata.data) {
            for (const [key, value] of Object.entries(metadata.data)) {
              conn.set(key as never, value as never);
            }
          }
        }

        // Parse body
        let body = event.body ?? "";
        if (event.isBase64Encoded) {
          body = Buffer.from(body, "base64").toString();
        }

        const isBinary = event.isBase64Encoded ?? false;
        const data: WsMessage = isBinary ? Buffer.from(body, "base64") : body;

        // Run message handlers
        wsServer._handleMessage(conn, data, isBinary);

        // Update last active time
        const metadata = await store.get(connectionId);
        if (metadata) {
          metadata.data = { ...metadata.data, lastActiveAt: Date.now() };
          await store.set(connectionId, metadata).catch(() => {});
        }

        return { statusCode: 200, body: "OK" };
      }

      case "DISCONNECT": {
        const conn = connCache.get(connectionId);
        if (conn) {
          wsServer._handleClose(conn, 1000, "Client disconnected");
          connCache.delete(connectionId);
        }

        // Remove from store
        await store.delete(connectionId).catch(() => {});

        return { statusCode: 200, body: "Disconnected" };
      }

      default:
        return { statusCode: 400, body: JSON.stringify({ error: "Unknown event type" }) };
    }
  };
}
