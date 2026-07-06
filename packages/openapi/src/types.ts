import type { Middleware, Handler } from "@nodalite/core";

export interface OpenAPIInfo {
  title: string;
  version: string;
  description?: string;
  termsOfService?: string;
}

export interface OpenAPIServer {
  url: string;
  description?: string;
}

export interface OpenAPIOptions {
  info: OpenAPIInfo;
  servers?: OpenAPIServer[];
  docsPath?: string;
  redocPath?: string;
  specPath?: string;
}

export interface OpenAPIRequestMeta {
  body?: unknown;
  query?: unknown;
  params?: unknown;
  headers?: unknown;
}

export interface OpenAPIResponseMeta {
  schema?: unknown;
  description: string;
}

export interface RouteOpenAPIMeta {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  deprecated?: boolean;
  request?: OpenAPIRequestMeta;
  responses?: Partial<Record<number | "default", OpenAPIResponseMeta>>;
}

export interface RouteOptions<Env extends Record<string, unknown> = Record<string, unknown>> {
  middlewares?: Middleware<Env>[];
  openapi?: RouteOpenAPIMeta;
}

interface StoredRouteOpenAPIMeta extends RouteOpenAPIMeta {
  path: string;
  method: string;
}

export interface StoredRoute<Env extends Record<string, unknown> = Record<string, unknown>> {
  method: string;
  path: string;
  handler: Handler<Env>;
  middlewares: Middleware<Env>[];
  openapi?: StoredRouteOpenAPIMeta;
}

export type OpenAPISchema = Record<string, unknown>;

export interface OpenAPIDocument {
  openapi: string;
  info: OpenAPIInfo;
  servers?: OpenAPIServer[];
  paths: Record<string, Record<string, OpenAPIPathItem>>;
  components?: {
    schemas?: Record<string, OpenAPISchema>;
  };
}

export interface OpenAPIPathItem {
  summary?: string;
  description?: string;
  tags?: string[];
  operationId?: string;
  deprecated?: boolean;
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: Record<string, OpenAPIResponse>;
}

export interface OpenAPIParameter {
  name: string;
  in: "query" | "path" | "header" | "cookie";
  required?: boolean;
  description?: string;
  deprecated?: boolean;
  schema: OpenAPISchema;
}

export interface OpenAPIRequestBody {
  required?: boolean;
  description?: string;
  content: Record<string, { schema: OpenAPISchema }>;
}

export interface OpenAPIResponse {
  description: string;
  content?: Record<string, { schema: OpenAPISchema }>;
}
