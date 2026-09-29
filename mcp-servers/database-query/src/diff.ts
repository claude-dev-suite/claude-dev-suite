// SPDX-License-Identifier: MIT
/**
 * Schema diff between two snapshots of the same engine.
 *
 * "source" is the database being changed (the current one); "target" is the
 * desired state. Objects are matched by name (tables, columns, enums,
 * sequences, views) and by CONTENT for constraints and indexes, so two
 * databases that auto-named the same index differently do not show a
 * spurious drop+create.
 */

import type {
  CheckDef,
  ColumnDef,
  EnumDef,
  ForeignKeyDef,
  IndexDef,
  KeyDef,
  SchemaSnapshot,
  SequenceDef,
  TableDef,
} from "./introspect/types.js";

export interface ColumnChange {
  name: string;
  source: ColumnDef;
  target: ColumnDef;
  changes: Array<"type" | "nullable" | "default" | "identity" | "generated" | "extra">;
}

export interface SetDiff<T> {
  added: T[];
  removed: T[];
}

export interface TableChange {
  table: string;
  source: TableDef;
  target: TableDef;
  columnsAdded: ColumnDef[];
  columnsRemoved: ColumnDef[];
  columnsChanged: ColumnChange[];
  primaryKey: { source: KeyDef | null; target: KeyDef | null } | null;
  foreignKeys: SetDiff<ForeignKeyDef>;
  uniqueConstraints: SetDiff<KeyDef>;
  checkConstraints: SetDiff<CheckDef>;
  indexes: SetDiff<IndexDef>;
}

export interface SchemaDiff {
  sourceSchema: string | null;
  targetSchema: string | null;
  tablesAdded: TableDef[];
  tablesRemoved: TableDef[];
  tablesChanged: TableChange[];
  viewsAdded: TableDef[];
  viewsRemoved: TableDef[];
  viewsChanged: Array<{ source: TableDef; target: TableDef }>;
  enumsAdded: EnumDef[];
  enumsRemoved: EnumDef[];
  enumsChanged: Array<{ name: string; source: EnumDef; target: EnumDef; addedValues: string[]; removedValues: string[] }>;
  sequencesAdded: SequenceDef[];
  sequencesRemoved: SequenceDef[];
}

const ws = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * Remove "own schema" qualification so `nextval('public.s'::regclass)` in one
 * database equals `nextval('app.s'::regclass)` in the other when comparing
 * schema public with schema app.
 */
export function unqualify(text: string | null | undefined, schema: string | null): string {
  if (!text) return "";
  if (!schema) return ws(text);
  const esc = schema.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return ws(text.replace(new RegExp(`(^|[^\\w"])("${esc}"|\`${esc}\`|${esc})\\.`, "g"), "$1"));
}

const isView = (t: TableDef) => t.kind === "view" || t.kind === "materialized_view";

function fkSig(f: ForeignKeyDef, schema: string | null) {
  return `${f.columns.join(",")}->${f.refSchema && f.refSchema !== schema ? f.refSchema + "." : ""}${f.refTable}(${f.refColumns.join(",")}) u=${f.onUpdate} d=${f.onDelete}`;
}
const keySig = (k: KeyDef) => k.columns.join(",");
function checkSig(c: CheckDef, schema: string | null) {
  return unqualify(c.expression, schema).toLowerCase();
}
function indexSig(i: IndexDef, schema: string | null) {
  return `${i.unique ? "U" : ""}|${i.method ?? ""}|${i.columns.join(",")}|${unqualify(i.predicate, schema)}`;
}

function setDiff<T>(src: T[], tgt: T[], sig: (x: T) => string): SetDiff<T> {
  const s = new Set(src.map(sig));
  const t = new Set(tgt.map(sig));
  return { added: tgt.filter((x) => !s.has(sig(x))), removed: src.filter((x) => !t.has(sig(x))) };
}

function columnChanges(a: ColumnDef, b: ColumnDef, sa: string | null, sb: string | null): ColumnChange["changes"] {
  const out: ColumnChange["changes"] = [];
  if (unqualify(a.type, sa).toLowerCase() !== unqualify(b.type, sb).toLowerCase()) out.push("type");
  if (a.nullable !== b.nullable) out.push("nullable");
  if (unqualify(a.default, sa) !== unqualify(b.default, sb)) out.push("default");
  if ((a.identity ?? null) !== (b.identity ?? null) || !!a.autoIncrement !== !!b.autoIncrement) out.push("identity");
  if (unqualify(a.generated, sa) !== unqualify(b.generated, sb)) out.push("generated");
  if ((a.extra ?? "").toLowerCase() !== (b.extra ?? "").toLowerCase() && !out.includes("generated")) out.push("extra");
  return out;
}

export function diffSnapshots(source: SchemaSnapshot, target: SchemaSnapshot): SchemaDiff {
  const sa = source.schema;
  const sb = target.schema;
  const srcTables = new Map(source.tables.filter((t) => !isView(t)).map((t) => [t.name, t]));
  const tgtTables = new Map(target.tables.filter((t) => !isView(t)).map((t) => [t.name, t]));
  const srcViews = new Map(source.tables.filter(isView).map((t) => [t.name, t]));
  const tgtViews = new Map(target.tables.filter(isView).map((t) => [t.name, t]));

  const diff: SchemaDiff = {
    sourceSchema: sa,
    targetSchema: sb,
    tablesAdded: [...tgtTables.values()].filter((t) => !srcTables.has(t.name)),
    tablesRemoved: [...srcTables.values()].filter((t) => !tgtTables.has(t.name)),
    tablesChanged: [],
    viewsAdded: [...tgtViews.values()].filter((v) => !srcViews.has(v.name)),
    viewsRemoved: [...srcViews.values()].filter((v) => !tgtViews.has(v.name)),
    viewsChanged: [],
    enumsAdded: [],
    enumsRemoved: [],
    enumsChanged: [],
    sequencesAdded: [],
    sequencesRemoved: [],
  };

  for (const [name, t] of tgtTables) {
    const s = srcTables.get(name);
    if (!s) continue;
    const sCols = new Map(s.columns.map((c) => [c.name, c]));
    const tCols = new Map(t.columns.map((c) => [c.name, c]));
    const change: TableChange = {
      table: name,
      source: s,
      target: t,
      columnsAdded: t.columns.filter((c) => !sCols.has(c.name)),
      columnsRemoved: s.columns.filter((c) => !tCols.has(c.name)),
      columnsChanged: [],
      primaryKey: null,
      foreignKeys: { added: [], removed: [] },
      uniqueConstraints: setDiff(s.uniqueConstraints, t.uniqueConstraints, keySig),
      checkConstraints: { added: [], removed: [] },
      indexes: { added: [], removed: [] },
    };
    // FK signatures must be computed with each side's own schema
    {
      const sSig = new Set(s.foreignKeys.map((f) => fkSig(f, sa)));
      const tSig = new Set(t.foreignKeys.map((f) => fkSig(f, sb)));
      change.foreignKeys = {
        added: t.foreignKeys.filter((f) => !sSig.has(fkSig(f, sb))),
        removed: s.foreignKeys.filter((f) => !tSig.has(fkSig(f, sa))),
      };
      const sc = new Set(s.checkConstraints.map((c) => checkSig(c, sa)));
      const tc = new Set(t.checkConstraints.map((c) => checkSig(c, sb)));
      change.checkConstraints = {
        added: t.checkConstraints.filter((c) => !sc.has(checkSig(c, sb))),
        removed: s.checkConstraints.filter((c) => !tc.has(checkSig(c, sa))),
      };
      // indexes that back PK/UNIQUE constraints are handled with the constraint
      const plain = (i: IndexDef) => !i.constraintBacked && !i.primary;
      const si = new Set(s.indexes.filter(plain).map((i) => indexSig(i, sa)));
      const ti = new Set(t.indexes.filter(plain).map((i) => indexSig(i, sb)));
      change.indexes = {
        added: t.indexes.filter(plain).filter((i) => !si.has(indexSig(i, sb))),
        removed: s.indexes.filter(plain).filter((i) => !ti.has(indexSig(i, sa))),
      };
    }
    for (const [cn, tc] of tCols) {
      const sc = sCols.get(cn);
      if (!sc) continue;
      const changes = columnChanges(sc, tc, sa, sb);
      if (changes.length) change.columnsChanged.push({ name: cn, source: sc, target: tc, changes });
    }
    const spk = s.primaryKey ? keySig(s.primaryKey) : "";
    const tpk = t.primaryKey ? keySig(t.primaryKey) : "";
    if (spk !== tpk) change.primaryKey = { source: s.primaryKey, target: t.primaryKey };

    const changed =
      change.columnsAdded.length ||
      change.columnsRemoved.length ||
      change.columnsChanged.length ||
      change.primaryKey ||
      change.foreignKeys.added.length ||
      change.foreignKeys.removed.length ||
      change.uniqueConstraints.added.length ||
      change.uniqueConstraints.removed.length ||
      change.checkConstraints.added.length ||
      change.checkConstraints.removed.length ||
      change.indexes.added.length ||
      change.indexes.removed.length;
    if (changed) diff.tablesChanged.push(change);
  }

  for (const [name, v] of tgtViews) {
    const s = srcViews.get(name);
    if (s && (unqualify(s.viewDefinition, sa) !== unqualify(v.viewDefinition, sb) || s.kind !== v.kind)) {
      diff.viewsChanged.push({ source: s, target: v });
    }
  }

  const se = new Map(source.enums.map((e) => [e.name, e]));
  const te = new Map(target.enums.map((e) => [e.name, e]));
  diff.enumsAdded = target.enums.filter((e) => !se.has(e.name));
  diff.enumsRemoved = source.enums.filter((e) => !te.has(e.name));
  for (const [name, t] of te) {
    const s = se.get(name);
    if (!s) continue;
    const added = t.values.filter((v) => !s.values.includes(v));
    const removed = s.values.filter((v) => !t.values.includes(v));
    const reordered = !added.length && !removed.length && s.values.join("\u0000") !== t.values.join("\u0000");
    if (added.length || removed.length || reordered) diff.enumsChanged.push({ name, source: s, target: t, addedValues: added, removedValues: removed });
  }
  const ss = new Set(source.sequences.map((q) => q.name));
  const ts = new Set(target.sequences.map((q) => q.name));
  diff.sequencesAdded = target.sequences.filter((q) => !ss.has(q.name));
  diff.sequencesRemoved = source.sequences.filter((q) => !ts.has(q.name));
  return diff;
}

export function isEmptyDiff(d: SchemaDiff): boolean {
  return (
    !d.tablesAdded.length &&
    !d.tablesRemoved.length &&
    !d.tablesChanged.length &&
    !d.viewsAdded.length &&
    !d.viewsRemoved.length &&
    !d.viewsChanged.length &&
    !d.enumsAdded.length &&
    !d.enumsRemoved.length &&
    !d.enumsChanged.length &&
    !d.sequencesAdded.length &&
    !d.sequencesRemoved.length
  );
}

/** Compact, model-friendly rendering of a diff. */
export function describeDiff(d: SchemaDiff) {
  const idx = (i: IndexDef) => `${i.name} (${i.columns.join(", ")})${i.unique ? " UNIQUE" : ""}${i.predicate ? ` WHERE ${i.predicate}` : ""}`;
  const fk = (f: ForeignKeyDef) => `${f.name}: (${f.columns.join(", ")}) -> ${f.refTable}(${f.refColumns.join(", ")})`;
  return {
    tablesOnlyInTarget: d.tablesAdded.map((t) => t.name),
    tablesOnlyInSource: d.tablesRemoved.map((t) => t.name),
    tablesChanged: d.tablesChanged.map((c) => ({
      table: c.table,
      ...(c.columnsAdded.length ? { columnsOnlyInTarget: c.columnsAdded.map((x) => `${x.name} ${x.type}`) } : {}),
      ...(c.columnsRemoved.length ? { columnsOnlyInSource: c.columnsRemoved.map((x) => `${x.name} ${x.type}`) } : {}),
      ...(c.columnsChanged.length
        ? {
            columnsChanged: c.columnsChanged.map((x) => ({
              column: x.name,
              changes: x.changes,
              source: { type: x.source.type, nullable: x.source.nullable, default: x.source.default },
              target: { type: x.target.type, nullable: x.target.nullable, default: x.target.default },
            })),
          }
        : {}),
      ...(c.primaryKey ? { primaryKey: { source: c.primaryKey.source?.columns ?? null, target: c.primaryKey.target?.columns ?? null } } : {}),
      ...(c.foreignKeys.added.length || c.foreignKeys.removed.length
        ? { foreignKeys: { onlyInTarget: c.foreignKeys.added.map(fk), onlyInSource: c.foreignKeys.removed.map(fk) } }
        : {}),
      ...(c.uniqueConstraints.added.length || c.uniqueConstraints.removed.length
        ? {
            uniqueConstraints: {
              onlyInTarget: c.uniqueConstraints.added.map((u) => `${u.name} (${u.columns.join(", ")})`),
              onlyInSource: c.uniqueConstraints.removed.map((u) => `${u.name} (${u.columns.join(", ")})`),
            },
          }
        : {}),
      ...(c.checkConstraints.added.length || c.checkConstraints.removed.length
        ? {
            checkConstraints: {
              onlyInTarget: c.checkConstraints.added.map((u) => `${u.name}: ${u.expression}`),
              onlyInSource: c.checkConstraints.removed.map((u) => `${u.name}: ${u.expression}`),
            },
          }
        : {}),
      ...(c.indexes.added.length || c.indexes.removed.length
        ? { indexes: { onlyInTarget: c.indexes.added.map(idx), onlyInSource: c.indexes.removed.map(idx) } }
        : {}),
    })),
    views: {
      onlyInTarget: d.viewsAdded.map((v) => v.name),
      onlyInSource: d.viewsRemoved.map((v) => v.name),
      definitionChanged: d.viewsChanged.map((v) => v.target.name),
    },
    enums: {
      onlyInTarget: d.enumsAdded.map((e) => `${e.name} (${e.values.join(", ")})`),
      onlyInSource: d.enumsRemoved.map((e) => e.name),
      changed: d.enumsChanged.map((e) => ({ name: e.name, valuesOnlyInTarget: e.addedValues, valuesOnlyInSource: e.removedValues })),
    },
    sequences: { onlyInTarget: d.sequencesAdded.map((q) => q.name), onlyInSource: d.sequencesRemoved.map((q) => q.name) },
  };
}
