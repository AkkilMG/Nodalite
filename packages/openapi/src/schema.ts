import type { OpenAPISchema } from "./types.js";

interface ZodSchema {
  _def?: Record<string, unknown>;
  _type?: string;
  type?: string;
  toJSONSchema?: () => Record<string, unknown>;
  options?: readonly unknown[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isZodSchema(value: unknown): value is ZodSchema {
  if (!isObject(value)) return false;
  if ("_def" in value) return true;
  if ("type" in value && typeof value.type === "string" && value.type.startsWith("Zod")) return true;
  return false;
}

function hasToJSONSchema(schema: ZodSchema): schema is ZodSchema & { toJSONSchema: () => Record<string, unknown> } {
  return typeof schema.toJSONSchema === "function";
}

export function toOpenAPISchema(schema: unknown): OpenAPISchema {
  if (schema === null || schema === undefined) {
    return {};
  }

  if (isZodSchema(schema)) {
    if (hasToJSONSchema(schema)) {
      return stripDollarSchema(schema.toJSONSchema());
    }

    if (isZodV3(schema)) {
      return convertZodV3(schema);
    }

    if (isZodV4(schema)) {
      return convertZodV4(schema);
    }

    return convertZodGeneric(schema);
  }

  if (isJSONSchema(schema)) {
    return schema as OpenAPISchema;
  }

  return {};
}

function stripDollarSchema(schema: Record<string, unknown>): OpenAPISchema {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema: _schema, ...rest } = schema;
  return rest as OpenAPISchema;
}

function isJSONSchema(value: unknown): boolean {
  return isObject(value) && ("type" in value || "properties" in value || "items" in value || "oneOf" in value || "allOf" in value);
}

function isZodV3(schema: ZodSchema): boolean {
  return schema._def !== undefined && "typeName" in schema._def;
}

function isZodV4(schema: ZodSchema): boolean {
  return schema._def !== undefined && !("typeName" in schema._def) && "type" in schema._def;
}

function convertZodV3(schema: ZodSchema): OpenAPISchema {
  const def = schema._def;
  if (!def) return {};

  const typeName = def.typeName as string;

  switch (typeName) {
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodNull":
      return { type: "null" };
    case "ZodDate":
      return { type: "string", format: "date-time" };
    case "ZodLiteral":
      return { type: typeof def.value === "string" ? "string" : "number", const: def.value as string | number };
    case "ZodEnum":
      return { type: "string", enum: (def.values as readonly string[]) ?? (schema.options as readonly string[]) ?? [] };
    case "ZodObject":
      return convertZodV3Object(def);
    case "ZodArray":
      return { type: "array", items: toOpenAPISchema(def.type) };
    case "ZodOptional":
      return toOpenAPISchema((def.innerType as ZodSchema) ?? (def.inner as ZodSchema));
    case "ZodNullable":
      return { anyOf: [toOpenAPISchema((def.innerType as ZodSchema) ?? (def.inner as ZodSchema)), { type: "null" }] } as OpenAPISchema;
    case "ZodUnion":
    case "ZodDiscriminatedUnion":
      return { oneOf: ((def.options as ZodSchema[]) ?? []).map((o: ZodSchema) => toOpenAPISchema(o)) } as unknown as OpenAPISchema;
    case "ZodRecord":
      return { type: "object", additionalProperties: toOpenAPISchema((def.valueType as ZodSchema) ?? (def.type as ZodSchema)) };
    case "ZodDefault":
      return toOpenAPISchema((def.innerType as ZodSchema) ?? (def.inner as ZodSchema));
    default:
      return {};
  }
}

function convertZodV3Object(def: Record<string, unknown>): OpenAPISchema {
  const shape = (def.shape as Record<string, ZodSchema>) ?? {};
  const properties: Record<string, OpenAPISchema> = {};
  const required: string[] = [];

  for (const [key, valueSchema] of Object.entries(shape)) {
    properties[key] = toOpenAPISchema(valueSchema);
    if (!isOptional(valueSchema)) {
      required.push(key);
    }
  }

  return { type: "object", properties, ...(required.length > 0 ? { required } : {}), additionalProperties: false };
}

function isOptional(schema: ZodSchema): boolean {
  const def = schema._def;
  if (!def) return false;
  if ("typeName" in def) {
    return def.typeName === "ZodOptional" || def.typeName === "ZodDefault";
  }
  return def.type === "optional" || def.type === "default" || def.type === "nullable";
}

function convertZodV4(schema: ZodSchema): OpenAPISchema {
  const def = schema._def;
  if (!def) return {};

  const type = def.type as string;

  switch (type) {
    case "string":
      return buildStringSchema(def);
    case "number":
    case "integer":
      return buildNumberSchema(def);
    case "boolean":
      return { type: "boolean" };
    case "null":
      return { type: "null" };
    case "date":
      return { type: "string", format: "date-time" };
    case "object": {
      const shape = (def.shape as Record<string, ZodSchema>) ?? {};
      const properties: Record<string, OpenAPISchema> = {};
      const required: string[] = [];
      for (const [key, valueSchema] of Object.entries(shape)) {
        properties[key] = toOpenAPISchema(valueSchema);
        if (!isOptional(valueSchema)) {
          required.push(key);
        }
      }
      return { type: "object", properties, ...(required.length > 0 ? { required } : {}), additionalProperties: false };
    }
    case "array":
      return { type: "array", items: def.shape ? toOpenAPISchema(def.shape as ZodSchema) : {} };
    case "enum":
      return { type: "string", enum: (def.values as readonly string[]) ?? [] };
    case "union":
      return { oneOf: ((def.options as ZodSchema[]) ?? []).map((o) => toOpenAPISchema(o)) } as unknown as OpenAPISchema;
    case "intersection":
      return { allOf: ((def.options as ZodSchema[]) ?? []).map((o) => toOpenAPISchema(o)) } as unknown as OpenAPISchema;
    case "optional":
      return toOpenAPISchema(def.inner as ZodSchema);
    case "nullable":
      return { anyOf: [toOpenAPISchema(def.inner as ZodSchema), { type: "null" }] } as OpenAPISchema;
    case "default":
      return toOpenAPISchema(def.inner as ZodSchema);
    case "record":
      return { type: "object", additionalProperties: toOpenAPISchema((def.value as ZodSchema) ?? (def.type as ZodSchema)) };
    case "tuple":
      return { type: "array" };
    case "literal":
      return { type: typeof (def as Record<string, unknown>).value === "number" ? "number" : "string", enum: [(def as Record<string, unknown>).value as string | number] };
    default:
      return {};
  }
}

function buildStringSchema(def: Record<string, unknown>): OpenAPISchema {
  const result: OpenAPISchema = { type: "string" };
  if (typeof def.minLength === "number") result.minLength = def.minLength;
  if (typeof def.maxLength === "number") result.maxLength = def.maxLength;
  if (typeof def.pattern === "string") result.pattern = def.pattern;
  return result;
}

function buildNumberSchema(def: Record<string, unknown>): OpenAPISchema {
  const result: OpenAPISchema = { type: "number" };
  if (typeof def.minValue === "number") result.minimum = def.minValue;
  if (typeof def.maxValue === "number") result.maximum = def.maxValue;
  return result;
}

function convertZodGeneric(schema: ZodSchema): OpenAPISchema {
  if (schema.type) {
    const simpleType = (schema.type as string).replace("Zod", "").toLowerCase();
    const typeMap: Record<string, string> = {
      string: "string",
      number: "number",
      boolean: "boolean",
      object: "object",
      array: "array",
      null: "null",
      date: "string",
    };
    const mapped = typeMap[simpleType];
    if (mapped) return { type: mapped };
  }
  return {};
}
