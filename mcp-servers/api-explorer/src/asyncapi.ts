// SPDX-License-Identifier: MIT
/**
 * AsyncAPI 2.x and 3.x: channels, operations and messages.
 *
 * 2.x nests operations inside channels (`publish` / `subscribe`); 3.x has
 * top-level `operations` (`send` / `receive`) that point at channels. Both
 * are presented in the same shape.
 */

import type { LoadedDocument } from "./loader.js";
import { contextFor, Dereferencer, refName } from "./refs.js";
import type { Json } from "./openapi.js";

export interface AsyncView {
  loaded: LoadedDocument;
  doc: Json;
  version: string;
  major: 2 | 3;
}

export function asyncView(loaded: LoadedDocument, alias?: string): AsyncView {
  if (loaded.kind !== "asyncapi") {
    throw new Error(`${alias ? `Source "${alias}"` : "This document"} is ${loaded.kind}, not AsyncAPI`);
  }
  const doc = loaded.doc as Json;
  const version = String(doc.asyncapi);
  const major = version.startsWith("3") ? 3 : 2;
  if (!version.startsWith("2") && !version.startsWith("3")) throw new Error(`Unsupported AsyncAPI version ${version}`);
  return { loaded, doc, version, major };
}

function deref(view: AsyncView, annotate = true): Dereferencer {
  return new Dereferencer(contextFor(view.loaded), { annotate });
}

interface AsyncOperation {
  id?: string;
  action: string;
  channel: string;
  summary?: string;
  messages: string[];
}

function messageNames(d: Dereferencer, msg: Json): string[] {
  if (!msg) return [];
  const list: Json[] = Array.isArray(msg) ? msg : msg.oneOf ? msg.oneOf : [msg];
  return list.map((m) => {
    if (typeof m?.$ref === "string") {
      const r = d.shallow(m);
      const v = r.value as Json;
      return v?.name ?? v?.messageId ?? refName(m.$ref);
    }
    return m?.name ?? m?.messageId ?? m?.title ?? "(inline)";
  });
}

export function asyncOperations(view: AsyncView): AsyncOperation[] {
  const d = deref(view, false);
  const ops: AsyncOperation[] = [];
  if (view.major === 2) {
    for (const [name, raw] of Object.entries((view.doc.channels ?? {}) as Record<string, Json>)) {
      const ch = d.shallow(raw).value as Json;
      for (const action of ["publish", "subscribe"] as const) {
        const op = ch?.[action];
        if (!op) continue;
        ops.push({ id: op.operationId, action, channel: name, ...(op.summary && { summary: op.summary }), messages: messageNames(d, op.message) });
      }
    }
  } else {
    for (const [id, raw] of Object.entries((view.doc.operations ?? {}) as Record<string, Json>)) {
      const op = d.shallow(raw).value as Json;
      const chRef = op?.channel?.$ref as string | undefined;
      const channel = chRef ? refName(chRef) : "(unknown)";
      let msgs: string[] = [];
      if (Array.isArray(op?.messages) && op.messages.length > 0) msgs = op.messages.map((m: Json) => (m?.$ref ? refName(m.$ref) : m?.name ?? "(inline)"));
      else if (chRef) {
        const ch = d.shallow({ $ref: chRef }).value as Json;
        msgs = Object.keys(ch?.messages ?? {});
      }
      ops.push({ id, action: op?.action ?? "unknown", channel, ...(op?.summary && { summary: op.summary }), messages: msgs });
    }
  }
  return ops;
}

export function asyncChannels(view: AsyncView): Array<Record<string, unknown>> {
  const d = deref(view, false);
  const ops = asyncOperations(view);
  return Object.entries((view.doc.channels ?? {}) as Record<string, Json>).map(([key, raw]) => {
    const ch = d.shallow(raw).value as Json;
    return {
      [view.major === 2 ? "name" : "id"]: key,
      ...(view.major === 3 && { address: ch?.address ?? null }),
      ...(ch?.description && { description: String(ch.description).slice(0, 300) }),
      ...(ch?.parameters && { parameters: Object.keys(ch.parameters) }),
      ...(view.major === 3 && ch?.messages && { messages: Object.keys(ch.messages) }),
      ...(ch?.bindings && { bindings: Object.keys(ch.bindings) }),
      operations: ops.filter((o) => o.channel === key).map((o) => ({ ...(o.id && { id: o.id }), action: o.action, messages: o.messages, ...(o.summary && { summary: o.summary }) })),
    };
  });
}

/** All named messages: components.messages plus messages declared in channels/operations. */
export function asyncMessages(view: AsyncView): Map<string, { raw: Json; where: string }> {
  const out = new Map<string, { raw: Json; where: string }>();
  for (const [name, m] of Object.entries((view.doc.components?.messages ?? {}) as Record<string, Json>)) out.set(name, { raw: m, where: `components.messages.${name}` });
  const d = deref(view, false);
  const addInline = (m: Json, where: string) => {
    if (!m || m.$ref) return;
    const name = m.name ?? m.messageId;
    if (name && !out.has(name)) out.set(name, { raw: m, where });
  };
  for (const [chName, raw] of Object.entries((view.doc.channels ?? {}) as Record<string, Json>)) {
    const ch = d.shallow(raw).value as Json;
    if (view.major === 2) {
      for (const action of ["publish", "subscribe"]) {
        const msg = ch?.[action]?.message;
        for (const m of msg?.oneOf ?? (msg ? [msg] : [])) addInline(m, `channels.${chName}.${action}.message`);
      }
    } else {
      for (const [id, m] of Object.entries((ch?.messages ?? {}) as Record<string, Json>)) {
        if (!m?.$ref && !out.has(id)) out.set(id, { raw: m, where: `channels.${chName}.messages.${id}` });
      }
    }
  }
  return out;
}

export function messageDetails(view: AsyncView, name: string): Record<string, unknown> {
  const all = asyncMessages(view);
  const hit = all.get(name);
  if (!hit) throw new Error(`Message "${name}" not found. Available: ${[...all.keys()].slice(0, 30).join(", ") || "(none)"}`);
  const d = deref(view, true);
  const msg = d.deref(hit.raw) as Json;
  return { name, location: hit.where, ...msg, ...(d.summary() && { refIssues: d.summary() }) };
}

export function asyncOverview(view: AsyncView): Record<string, unknown> {
  const servers = Object.entries((view.doc.servers ?? {}) as Record<string, Json>).map(([name, s]) => ({
    name,
    ...(s?.url && { url: s.url }),
    ...(s?.host && { host: s.host }),
    ...(s?.pathname && { pathname: s.pathname }),
    protocol: s?.protocol,
  }));
  return {
    kind: "asyncapi",
    specVersion: view.version,
    info: view.doc.info ? { title: view.doc.info.title, version: view.doc.info.version } : undefined,
    servers,
    channelCount: Object.keys(view.doc.channels ?? {}).length,
    operationCount: asyncOperations(view).length,
    messageCount: asyncMessages(view).size,
    ...(view.loaded.warnings.length && { warnings: view.loaded.warnings }),
  };
}
