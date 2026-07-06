import type { StoredRoute, OpenAPIOptions, OpenAPIDocument, OpenAPIPathItem, OpenAPIParameter, OpenAPISchema, OpenAPIRequestBody, OpenAPIResponse } from "./types.js";
import { toOpenAPISchema } from "./schema.js";

export function generateSpec<Env extends Record<string, unknown> = Record<string, unknown>>(routes: StoredRoute<Env>[], options: OpenAPIOptions): OpenAPIDocument {
  const paths: Record<string, Record<string, OpenAPIPathItem>> = {};
  const schemas: Record<string, OpenAPISchema> = {};
  const schemaRefs = new Map<string, string>();

  for (const route of routes) {
    if (!route.openapi) continue;

    const openapiPath = convertPath(route.path);
    const method = route.method.toLowerCase();
    const meta = route.openapi;

    const pathItem: OpenAPIPathItem = {
      responses: {},
      ...(meta.summary && { summary: meta.summary }),
      ...(meta.description && { description: meta.description }),
      ...(meta.operationId && { operationId: meta.operationId }),
      ...(meta.tags && { tags: meta.tags }),
      ...(meta.deprecated && { deprecated: true }),
    };

    const parameters: OpenAPIParameter[] = [];

    if (meta.request) {
      if (meta.request.params) {
        const paramSchema = toOpenAPISchema(meta.request.params);
        const shape = getSchemaShape(paramSchema);
        if (shape) {
          for (const [name, prop] of Object.entries(shape)) {
            parameters.push({
              name,
              in: "path",
              required: true,
              schema: prop as OpenAPISchema,
            });
          }
        }
      }

      if (meta.request.query) {
        const querySchema = toOpenAPISchema(meta.request.query);
        const shape = getSchemaShape(querySchema);
        if (shape) {
          for (const [name, prop] of Object.entries(shape)) {
            parameters.push({
              name,
              in: "query",
              required: isRequired(querySchema, name),
              schema: prop as OpenAPISchema,
            });
          }
        }
      }

      if (meta.request.headers) {
        const headerSchema = toOpenAPISchema(meta.request.headers);
        const shape = getSchemaShape(headerSchema);
        if (shape) {
          for (const [name, prop] of Object.entries(shape)) {
            parameters.push({
              name,
              in: "header",
              required: isRequired(headerSchema, name),
              schema: prop as OpenAPISchema,
            });
          }
        }
      }

      if (meta.request.body) {
        const bodySchema = toOpenAPISchema(meta.request.body);
        const schemaRef = registerSchema(bodySchema, schemas, schemaRefs);
        pathItem.requestBody = {
          required: true,
          content: {
            "application/json": {
              schema: schemaRef,
            },
          },
        };
      }
    }

    if (parameters.length > 0) {
      pathItem.parameters = parameters;
    }

    if (meta.responses) {
      for (const [status, response] of Object.entries(meta.responses)) {
        if (!response) continue;
        const resp: OpenAPIResponse = {
          description: response.description,
        };
        if (response.schema) {
          const responseSchema = toOpenAPISchema(response.schema);
          const schemaRef = registerSchema(responseSchema, schemas, schemaRefs);
          resp.content = {
            "application/json": {
              schema: schemaRef,
            },
          };
        }
        pathItem.responses[status] = resp;
      }
    }

    paths[openapiPath] ??= {};
    paths[openapiPath][method] = pathItem;
  }

  const doc: OpenAPIDocument = {
    openapi: "3.1.0",
    info: options.info,
    paths,
  };

  if (options.servers && options.servers.length > 0) {
    doc.servers = options.servers;
  }

  if (Object.keys(schemas).length > 0) {
    doc.components = { schemas };
  }

  return doc;
}

function convertPath(path: string): string {
  return path.replace(/:([^/]+)/g, "{$1}").replace(/\*/g, "{*}");
}

function getSchemaShape(schema: OpenAPISchema): Record<string, OpenAPISchema> | null {
  if (schema.properties && typeof schema.properties === "object") {
    return schema.properties as Record<string, OpenAPISchema>;
  }
  return null;
}

function isRequired(schema: OpenAPISchema, name: string): boolean {
  const required = schema.required;
  if (Array.isArray(required)) {
    return required.includes(name);
  }
  return false;
}

function registerSchema(
  schema: OpenAPISchema,
  schemas: Record<string, OpenAPISchema>,
  refs: Map<string, string>
): OpenAPISchema | { $ref: string } {
  if (schema.type === "object" && schema.properties) {
    const key = JSON.stringify(schema);
    const existing = refs.get(key);
    if (existing) {
      return { $ref: `#/components/schemas/${existing}` };
    }

    const name = generateSchemaName(schema, schemas);
    schemas[name] = schema;
    refs.set(key, name);
    return { $ref: `#/components/schemas/${name}` };
  }

  return schema;
}

function generateSchemaName(schema: OpenAPISchema, existing: Record<string, OpenAPISchema>): string {
  const props = schema.properties ? Object.keys(schema.properties as Record<string, unknown>).slice(0, 3).join("And") : "Anonymous";
  const pascal = props.charAt(0).toUpperCase() + props.slice(1).replace(/And(\w)/g, (_, c) => c.toUpperCase());
  let name = pascal || "Schema";
  let counter = 1;
  const base = name;
  while (name in existing) {
    counter++;
    name = `${base}${counter}`;
  }
  return name;
}
