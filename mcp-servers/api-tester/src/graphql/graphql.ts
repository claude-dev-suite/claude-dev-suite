// SPDX-License-Identifier: MIT
/**
 * GraphQL over HTTP: queries/mutations with variables, and introspection
 * rendered as a bounded schema summary (root operations with arguments, type
 * list) plus optional SDL.
 */

export const INTROSPECTION_QUERY = `query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types { ...FullType }
    directives { name description locations args { ...InputValue } }
  }
}
fragment FullType on __Type {
  kind name description
  fields(includeDeprecated: true) { name description args { ...InputValue } type { ...TypeRef } isDeprecated deprecationReason }
  inputFields { ...InputValue }
  interfaces { ...TypeRef }
  enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason }
  possibleTypes { ...TypeRef }
}
fragment InputValue on __InputValue { name description type { ...TypeRef } defaultValue }
fragment TypeRef on __Type {
  kind name
  ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } }
}`;

interface TypeRef {
  kind: string;
  name: string | null;
  ofType?: TypeRef | null;
}
interface InputValue {
  name: string;
  description?: string | null;
  type: TypeRef;
  defaultValue?: string | null;
}
interface Field {
  name: string;
  description?: string | null;
  args: InputValue[];
  type: TypeRef;
  isDeprecated?: boolean;
  deprecationReason?: string | null;
}
interface FullType {
  kind: string;
  name: string;
  description?: string | null;
  fields?: Field[] | null;
  inputFields?: InputValue[] | null;
  interfaces?: TypeRef[] | null;
  enumValues?: Array<{ name: string; isDeprecated?: boolean }> | null;
  possibleTypes?: TypeRef[] | null;
}
export interface IntrospectionSchema {
  queryType?: { name: string } | null;
  mutationType?: { name: string } | null;
  subscriptionType?: { name: string } | null;
  types: FullType[];
}

export function typeToString(t: TypeRef | null | undefined): string {
  if (!t) return 'Unknown';
  if (t.kind === 'NON_NULL') return `${typeToString(t.ofType)}!`;
  if (t.kind === 'LIST') return `[${typeToString(t.ofType)}]`;
  return t.name ?? 'Unknown';
}

function fieldSig(f: Field): string {
  const args = f.args?.length ? `(${f.args.map((a) => `${a.name}: ${typeToString(a.type)}${a.defaultValue != null ? ` = ${a.defaultValue}` : ''}`).join(', ')})` : '';
  return `${f.name}${args}: ${typeToString(f.type)}${f.isDeprecated ? ' @deprecated' : ''}`;
}

const isBuiltin = (name: string) => name.startsWith('__') || ['String', 'Int', 'Float', 'Boolean', 'ID'].includes(name);

export function summariseSchema(schema: IntrospectionSchema, opts: { typeName?: string; limit?: number } = {}): Record<string, unknown> {
  const limit = opts.limit ?? 200;
  const byName = new Map(schema.types.map((t) => [t.name, t]));
  const root = (name: string | undefined) => {
    const t = name ? byName.get(name) : undefined;
    const fields = (t?.fields ?? []).map(fieldSig);
    return { type: name ?? null, fields: fields.slice(0, limit), total: fields.length, truncated: fields.length > limit };
  };

  if (opts.typeName) {
    const t = byName.get(opts.typeName);
    if (!t) throw new Error(`Type "${opts.typeName}" not found in the schema`);
    return {
      name: t.name,
      kind: t.kind,
      description: t.description ?? undefined,
      fields: t.fields?.map((f) => ({ signature: fieldSig(f), description: f.description ?? undefined })),
      inputFields: t.inputFields?.map((f) => `${f.name}: ${typeToString(f.type)}${f.defaultValue != null ? ` = ${f.defaultValue}` : ''}`),
      enumValues: t.enumValues?.map((e) => e.name),
      interfaces: t.interfaces?.map((i) => i.name),
      possibleTypes: t.possibleTypes?.map((p) => p.name),
    };
  }

  const userTypes = schema.types.filter((t) => !isBuiltin(t.name));
  const kinds = userTypes.reduce<Record<string, number>>((acc, t) => ((acc[t.kind] = (acc[t.kind] ?? 0) + 1), acc), {});
  const typeList = userTypes
    .filter((t) => ![schema.queryType?.name, schema.mutationType?.name, schema.subscriptionType?.name].includes(t.name))
    .map((t) => `${t.name} (${t.kind.toLowerCase()})`);
  return {
    queries: root(schema.queryType?.name),
    mutations: root(schema.mutationType?.name ?? undefined),
    subscriptions: root(schema.subscriptionType?.name ?? undefined),
    typeCounts: kinds,
    types: typeList.slice(0, limit),
    typesTruncated: typeList.length > limit,
  };
}

export function schemaToSdl(schema: IntrospectionSchema): string {
  const out: string[] = [];
  const roots = { query: schema.queryType?.name, mutation: schema.mutationType?.name, subscription: schema.subscriptionType?.name };
  if (roots.query !== 'Query' || (roots.mutation && roots.mutation !== 'Mutation') || (roots.subscription && roots.subscription !== 'Subscription')) {
    const entries = Object.entries(roots).filter(([, v]) => v).map(([k, v]) => `  ${k}: ${v}`);
    out.push(`schema {\n${entries.join('\n')}\n}`);
  }
  for (const t of schema.types) {
    if (isBuiltin(t.name)) continue;
    // A plain string literal: GraphQL's escapes are JSON's, so this handles
    // backslashes and quotes that a hand-escaped block string got wrong.
    const desc = t.description ? `${JSON.stringify(t.description)}\n` : '';
    switch (t.kind) {
      case 'OBJECT':
      case 'INTERFACE': {
        const impl = t.interfaces?.length ? ` implements ${t.interfaces.map((i) => i.name).join(' & ')}` : '';
        out.push(`${desc}${t.kind === 'OBJECT' ? 'type' : 'interface'} ${t.name}${impl} {\n${(t.fields ?? []).map((f) => `  ${fieldSig(f)}`).join('\n')}\n}`);
        break;
      }
      case 'INPUT_OBJECT':
        out.push(`${desc}input ${t.name} {\n${(t.inputFields ?? []).map((f) => `  ${f.name}: ${typeToString(f.type)}${f.defaultValue != null ? ` = ${f.defaultValue}` : ''}`).join('\n')}\n}`);
        break;
      case 'ENUM':
        out.push(`${desc}enum ${t.name} {\n${(t.enumValues ?? []).map((e) => `  ${e.name}`).join('\n')}\n}`);
        break;
      case 'UNION':
        out.push(`${desc}union ${t.name} = ${(t.possibleTypes ?? []).map((p) => p.name).join(' | ')}`);
        break;
      case 'SCALAR':
        out.push(`${desc}scalar ${t.name}`);
        break;
    }
  }
  return out.join('\n\n') + '\n';
}
