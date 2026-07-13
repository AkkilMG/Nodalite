import {
  DynamoDBClient,
  UpdateItemCommand,
  ConditionalCheckFailedException,
} from "@aws-sdk/client-dynamodb";
import type { RateLimitStore } from "../rate-limit.js";

export interface DynamoDBRateLimitStoreOptions {
  /** AWS DynamoDB client instance. */
  client: DynamoDBClient;
  /** DynamoDB table name. Must have a string partition key named `key`. */
  tableName: string;
  /** Key prefix to avoid collisions. Defaults to `"rl:"`. */
  prefix?: string;
}

/**
 * DynamoDB-backed rate-limit store using conditional `UpdateItem` commands.
 *
 * **Table schema** (create manually or via CloudFormation/CDK):
 *
 * | Attribute | Type | Role |
 * |---|---|---|
 * | `key` | String | Partition key |
 * | `count` | Number | Request count in the current window |
 * | `expiresAt` | Number | Window expiry (epoch ms) — also used as DynamoDB TTL attribute |
 *
 * Enable **DynamoDB Time to Live (TTL)** on the `expiresAt` attribute for
 * automatic cleanup of stale entries. The real-time correctness is handled by
 * conditional expressions, not the TTL feature.
 *
 * Uses a two-phase approach:
 * 1. Try to increment within the active window (1 DynamoDB call).
 * 2. On `ConditionalCheckFailedException` (window expired or new key), reset
 *    the counter and start a new window (2nd call — rare, only at boundary).
 *
 * ```ts
 * import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
 * import { DynamoDBRateLimitStore } from "@nodalite/middleware/rate-limit/dynamodb";
 *
 * const client = new DynamoDBClient({ region: "us-east-1" });
 * app.use(rateLimit({
 *   max: 100,
 *   windowMs: 60_000,
 *   store: new DynamoDBRateLimitStore({ client, tableName: "rate-limits" }),
 * }));
 * ```
 */
export class DynamoDBRateLimitStore implements RateLimitStore {
  private client: DynamoDBClient;
  private tableName: string;
  private prefix: string;

  constructor(opts: DynamoDBRateLimitStoreOptions) {
    if (!opts.client) throw new Error("DynamoDBRateLimitStore: client is required");
    if (!opts.tableName) throw new Error("DynamoDBRateLimitStore: tableName is required");
    this.client = opts.client;
    this.tableName = opts.tableName;
    this.prefix = opts.prefix ?? "rl:";
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetMs: number }> {
    if (windowMs <= 0) throw new Error("DynamoDBRateLimitStore: windowMs must be positive");
    const now = Date.now();
    const windowEnd = now + windowMs;
    const fullKey = this.prefix + key;

    // Phase 1: Try to increment within the active window.
    try {
      const result = await this.client.send(
        new UpdateItemCommand({
          TableName: this.tableName,
          Key: { key: { S: fullKey } },
          UpdateExpression: "SET #count = #count + :inc",
          ConditionExpression: "attribute_exists(#expiresAt) AND #expiresAt > :now",
          ExpressionAttributeNames: {
            "#count": "count",
            "#expiresAt": "expiresAt",
          },
          ExpressionAttributeValues: {
            ":inc": { N: "1" },
            ":now": { N: String(now) },
          },
          ReturnValues: "ALL_NEW",
        }),
      );

      const attrs = result.Attributes!;
      return {
        count: Number(attrs.count!.N),
        resetMs: Number(attrs.expiresAt!.N) - now,
      };
    } catch (err: unknown) {
      if (!(err instanceof ConditionalCheckFailedException)) throw err;
    }

    // Phase 2: Window expired or doesn't exist — reset counter.
    const result = await this.client.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: { key: { S: fullKey } },
        UpdateExpression: "SET #count = :inc, #expiresAt = :windowEnd",
        ConditionExpression: "attribute_not_exists(#expiresAt) OR #expiresAt <= :now",
        ExpressionAttributeNames: {
          "#count": "count",
          "#expiresAt": "expiresAt",
        },
        ExpressionAttributeValues: {
          ":inc": { N: "1" },
          ":windowEnd": { N: String(windowEnd) },
          ":now": { N: String(now) },
        },
        ReturnValues: "ALL_NEW",
      }),
    );

    const attrs = result.Attributes!;
    return {
      count: Number(attrs.count!.N),
      resetMs: windowMs,
    };
  }

  /** No-op — DynamoDB is stateless. Provided for interface conformance. */
  async destroy(): Promise<void> {}
}
