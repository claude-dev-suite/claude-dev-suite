// SPDX-License-Identifier: MIT
/**
 * gRPC / protobuf: services, RPCs, messages and enums from a .proto file,
 * using protobufjs's parser only (pure JS, no code generation, no reflection
 * over the wire). Imports are listed, not followed: a type defined in an
 * imported file is reported by name.
 */

import protobuf from "protobufjs";
import type { LoadedDocument } from "./loader.js";

export interface ProtoModel {
  package?: string;
  syntax?: string;
  imports: string[];
  services: Array<{ name: string; fullName: string; rpcs: Array<Record<string, unknown>>; comment?: string }>;
  messages: Map<string, Record<string, unknown>>;
  enums: Map<string, Record<string, unknown>>;
}

const cache = new WeakMap<LoadedDocument, ProtoModel>();

function strip(name: string): string {
  return name.replace(/^\./, "");
}

export function protoModel(loaded: LoadedDocument, alias?: string): ProtoModel {
  if (loaded.kind !== "proto") throw new Error(`${alias ? `Source "${alias}"` : "This document"} is ${loaded.kind}, not a .proto file`);
  const hit = cache.get(loaded);
  if (hit) return hit;
  let parsed: protobuf.IParserResult;
  try {
    parsed = protobuf.parse(String(loaded.doc), { keepCase: true, alternateCommentMode: true });
  } catch (error) {
    throw new Error(`Invalid .proto file: ${(error as Error).message}`);
  }
  const model: ProtoModel = {
    package: parsed.package ?? undefined,
    syntax: (parsed as { syntax?: string }).syntax,
    imports: [...(parsed.imports ?? []), ...(parsed.weakImports ?? [])],
    services: [],
    messages: new Map(),
    enums: new Map(),
  };

  const visit = (ns: protobuf.NamespaceBase) => {
    for (const obj of ns.nestedArray) {
      if (obj instanceof protobuf.Service) {
        model.services.push({
          name: obj.name,
          fullName: strip(obj.fullName),
          ...(obj.comment && { comment: obj.comment }),
          rpcs: obj.methodsArray.map((m) => ({
            name: m.name,
            requestType: m.requestType,
            responseType: m.responseType,
            ...(m.requestStream && { requestStream: true }),
            ...(m.responseStream && { responseStream: true }),
            streaming: m.requestStream && m.responseStream ? "bidi" : m.requestStream ? "client" : m.responseStream ? "server" : "unary",
            ...(m.comment && { comment: m.comment }),
            ...(m.options && Object.keys(m.options).length && { options: m.options }),
          })),
        });
      } else if (obj instanceof protobuf.Type) {
        const oneofs: Record<string, string[]> = {};
        for (const o of obj.oneofsArray) oneofs[o.name] = o.oneof;
        model.messages.set(strip(obj.fullName), {
          name: obj.name,
          fullName: strip(obj.fullName),
          ...(obj.comment && { comment: obj.comment }),
          fields: obj.fieldsArray.map((f) => ({
            name: f.name,
            number: f.id,
            type: f instanceof protobuf.MapField ? `map<${f.keyType}, ${f.type}>` : f.type,
            ...(f.repeated && { repeated: true }),
            ...(f.required && { required: true }),
            ...(f.options?.proto3_optional && { optional: true }),
            ...(f.partOf && { oneof: f.partOf.name }),
            ...(f.comment && { comment: f.comment }),
          })),
          ...(Object.keys(oneofs).length && { oneofs }),
          ...(obj.reserved?.length && { reserved: obj.reserved }),
        });
        visit(obj);
      } else if (obj instanceof protobuf.Enum) {
        model.enums.set(strip(obj.fullName), {
          name: obj.name,
          fullName: strip(obj.fullName),
          values: obj.values,
          ...(obj.comment && { comment: obj.comment }),
        });
      } else if (obj instanceof protobuf.Namespace) {
        visit(obj);
      }
    }
  };
  visit(parsed.root);
  cache.set(loaded, model);
  return model;
}

export function protoTypeDetails(model: ProtoModel, name: string): Record<string, unknown> {
  const candidates = [name, model.package ? `${model.package}.${name}` : name];
  for (const c of candidates) {
    const m = model.messages.get(c);
    if (m) return { kind: "message", ...m };
    const e = model.enums.get(c);
    if (e) return { kind: "enum", ...e };
  }
  // Short-name match (unique)
  const short = [...model.messages.values(), ...model.enums.values()].filter((t) => t.name === name);
  if (short.length === 1) return { kind: model.messages.has(String(short[0].fullName)) ? "message" : "enum", ...short[0] };
  if (short.length > 1) throw new Error(`"${name}" is ambiguous: ${short.map((s) => s.fullName).join(", ")}`);
  throw new Error(
    `Message or enum "${name}" not found${model.imports.length ? ` (it may live in an import: ${model.imports.join(", ")})` : ""}`
  );
}

export function protoOverview(model: ProtoModel): Record<string, unknown> {
  return {
    kind: "proto",
    ...(model.syntax && { syntax: model.syntax }),
    ...(model.package && { package: model.package }),
    imports: model.imports,
    services: model.services.map((s) => ({ name: s.fullName, rpcCount: s.rpcs.length })),
    messageCount: model.messages.size,
    enumCount: model.enums.size,
  };
}
