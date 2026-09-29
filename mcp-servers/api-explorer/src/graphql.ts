// SPDX-License-Identifier: MIT
/**
 * GraphQL schemas from SDL files or live introspection, via graphql-js.
 */

import {
  buildClientSchema,
  buildSchema,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isObjectType,
  isScalarType,
  isUnionType,
  printType,
  type GraphQLArgument,
  type GraphQLField,
  type GraphQLNamedType,
  type GraphQLSchema,
  type IntrospectionQuery,
} from "graphql";
import type { LoadedDocument } from "./loader.js";

const cache = new WeakMap<LoadedDocument, GraphQLSchema>();

export function graphqlSchema(loaded: LoadedDocument, alias?: string): GraphQLSchema {
  if (loaded.kind !== "graphql") {
    throw new Error(`${alias ? `Source "${alias}"` : "This document"} is ${loaded.kind}, not GraphQL`);
  }
  const hit = cache.get(loaded);
  if (hit) return hit;
  let schema: GraphQLSchema;
  if (loaded.format === "graphql-introspection") {
    const raw = loaded.doc as { data?: IntrospectionQuery } & IntrospectionQuery;
    const data = (raw.data ?? raw) as IntrospectionQuery;
    try {
      schema = buildClientSchema(data);
    } catch (error) {
      throw new Error(`Invalid GraphQL introspection result: ${(error as Error).message}`);
    }
  } else {
    const sdl = String(loaded.doc);
    try {
      schema = buildSchema(sdl);
    } catch (first) {
      try {
        // Tolerate SDL that relies on server-provided directives (federation etc.).
        schema = buildSchema(sdl, { assumeValidSDL: true });
      } catch {
        throw new Error(`Invalid GraphQL SDL: ${(first as Error).message}`);
      }
    }
  }
  cache.set(loaded, schema);
  return schema;
}

const BUILTIN = new Set(["String", "Int", "Float", "Boolean", "ID"]);

export function typeKind(t: GraphQLNamedType): string {
  if (isObjectType(t)) return "object";
  if (isInterfaceType(t)) return "interface";
  if (isUnionType(t)) return "union";
  if (isEnumType(t)) return "enum";
  if (isInputObjectType(t)) return "input";
  if (isScalarType(t)) return "scalar";
  return "unknown";
}

function describeArg(a: GraphQLArgument): Record<string, unknown> {
  return {
    name: a.name,
    type: String(a.type),
    ...(a.defaultValue !== undefined && { defaultValue: a.defaultValue }),
    ...(a.description && { description: a.description }),
    ...(a.deprecationReason && { deprecated: a.deprecationReason }),
  };
}

function describeField(f: GraphQLField<unknown, unknown>): Record<string, unknown> {
  return {
    name: f.name,
    type: String(f.type),
    ...(f.args.length && { args: f.args.map(describeArg) }),
    ...(f.description && { description: f.description }),
    ...(f.deprecationReason && { deprecated: f.deprecationReason }),
  };
}

export type RootKind = "query" | "mutation" | "subscription";

export function rootOperations(schema: GraphQLSchema, which?: RootKind): Array<Record<string, unknown>> {
  const roots: Array<[RootKind, ReturnType<GraphQLSchema["getQueryType"]>]> = [
    ["query", schema.getQueryType()],
    ["mutation", schema.getMutationType()],
    ["subscription", schema.getSubscriptionType()],
  ];
  const out: Array<Record<string, unknown>> = [];
  for (const [kind, type] of roots) {
    if (!type || (which && which !== kind)) continue;
    for (const f of Object.values(type.getFields())) out.push({ operationType: kind, ...describeField(f) });
  }
  return out;
}

export function listTypes(schema: GraphQLSchema, kind?: string, includeBuiltins = false): Array<Record<string, unknown>> {
  return Object.values(schema.getTypeMap())
    .filter((t) => !t.name.startsWith("__") && (includeBuiltins || !BUILTIN.has(t.name)))
    .filter((t) => !kind || typeKind(t) === kind)
    .map((t) => ({
      name: t.name,
      kind: typeKind(t),
      ...(t.description && { description: t.description.slice(0, 200) }),
    }));
}

export function typeDetails(schema: GraphQLSchema, name: string): Record<string, unknown> {
  const t = schema.getType(name);
  if (!t) {
    const names = Object.keys(schema.getTypeMap()).filter((n) => n.toLowerCase().includes(name.toLowerCase())).slice(0, 10);
    throw new Error(`GraphQL type "${name}" not found${names.length ? `. Similar: ${names.join(", ")}` : ""}`);
  }
  const base: Record<string, unknown> = { name: t.name, kind: typeKind(t), ...(t.description && { description: t.description }) };
  if (isObjectType(t) || isInterfaceType(t)) {
    base.fields = Object.values(t.getFields()).map(describeField);
    base.interfaces = t.getInterfaces().map((i) => i.name);
    if (isInterfaceType(t)) base.implementations = schema.getPossibleTypes(t).map((p) => p.name);
  } else if (isUnionType(t)) {
    base.possibleTypes = t.getTypes().map((p) => p.name);
  } else if (isEnumType(t)) {
    base.values = t.getValues().map((v) => ({ name: v.name, ...(v.description && { description: v.description }), ...(v.deprecationReason && { deprecated: v.deprecationReason }) }));
  } else if (isInputObjectType(t)) {
    base.inputFields = Object.values(t.getFields()).map((f) => ({
      name: f.name,
      type: String(f.type),
      ...(f.defaultValue !== undefined && { defaultValue: f.defaultValue }),
      ...(f.description && { description: f.description }),
    }));
  }
  base.sdl = printType(t);
  return base;
}

export function graphqlOverview(schema: GraphQLSchema): Record<string, unknown> {
  const types = listTypes(schema);
  const byKind: Record<string, number> = {};
  for (const t of types) byKind[t.kind as string] = (byKind[t.kind as string] ?? 0) + 1;
  return {
    kind: "graphql",
    queries: Object.keys(schema.getQueryType()?.getFields() ?? {}).length,
    mutations: Object.keys(schema.getMutationType()?.getFields() ?? {}).length,
    subscriptions: Object.keys(schema.getSubscriptionType()?.getFields() ?? {}).length,
    typesByKind: byKind,
  };
}
