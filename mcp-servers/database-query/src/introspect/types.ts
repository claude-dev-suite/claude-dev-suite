// SPDX-License-Identifier: MIT
/**
 * Engine-neutral schema model used by describe/get_schema/compare/migrate.
 */

import type { Engine } from "../config.js";
import type { Session } from "../drivers/types.js";

export type RelationKind = "table" | "partitioned_table" | "view" | "materialized_view" | "foreign_table";

export interface ColumnDef {
  name: string;
  position: number;
  /** Full, engine-native type as it would appear in DDL (e.g. `numeric(10,0)`, `integer[]`, `varchar(255)`). */
  type: string;
  nullable: boolean;
  /** Default as a SQL expression (already quoted where it is a literal), or null. */
  default: string | null;
  identity: "ALWAYS" | "BY DEFAULT" | null;
  /** Generation expression for generated columns. */
  generated: string | null;
  /** MySQL `auto_increment`, SQLite INTEGER PRIMARY KEY AUTOINCREMENT. */
  autoIncrement?: boolean;
  /** MySQL EXTRA (e.g. `on update CURRENT_TIMESTAMP`). */
  extra?: string | null;
  comment: string | null;
}

export interface KeyDef {
  name: string;
  columns: string[];
}

export interface ForeignKeyDef extends KeyDef {
  refSchema: string | null;
  refTable: string;
  refColumns: string[];
  onUpdate: string;
  onDelete: string;
  definition?: string | null;
}

export interface CheckDef {
  name: string;
  expression: string;
}

export interface IndexDef {
  name: string;
  /** Key columns or expressions, in order. */
  columns: string[];
  unique: boolean;
  primary: boolean;
  method: string | null;
  predicate: string | null;
  /** Engine DDL for the index when available (pg_get_indexdef, sqlite_master.sql). */
  definition: string | null;
  /** Index exists to back a PRIMARY KEY / UNIQUE / EXCLUDE constraint. */
  constraintBacked: boolean;
}

export interface TriggerDef {
  name: string;
  table: string;
  definition: string | null;
  timing?: string | null;
  event?: string | null;
}

export interface TableDef {
  schema: string | null;
  name: string;
  kind: RelationKind;
  comment: string | null;
  columns: ColumnDef[];
  primaryKey: KeyDef | null;
  foreignKeys: ForeignKeyDef[];
  uniqueConstraints: KeyDef[];
  checkConstraints: CheckDef[];
  indexes: IndexDef[];
  triggers: TriggerDef[];
  /** View / materialized view body. */
  viewDefinition?: string | null;
  /** Engine's own CREATE statement when cheap to get (SQLite). */
  createSql?: string | null;
}

export interface EnumDef {
  schema: string | null;
  name: string;
  values: string[];
}

export interface SequenceDef {
  schema: string | null;
  name: string;
  dataType: string | null;
  start: string | null;
  increment: string | null;
}

export interface SchemaSnapshot {
  engine: Engine;
  schema: string | null;
  tables: TableDef[];
  enums: EnumDef[];
  sequences: SequenceDef[];
  /** Things the engine/privileges did not let us read — never silently empty. */
  unavailable: string[];
}

export interface RelationSummary {
  schema: string | null;
  name: string;
  kind: RelationKind;
  rowEstimate: number | null;
  totalBytes: number | null;
  columnCount: number | null;
  comment: string | null;
}

export type ObjectKind =
  | "enum"
  | "type"
  | "function"
  | "procedure"
  | "trigger"
  | "sequence"
  | "view"
  | "materialized_view"
  | "index"
  | "extension";

export interface SearchHit {
  kind: string;
  schema: string | null;
  name: string;
  table?: string;
  detail?: string | null;
}

export interface Introspector {
  defaultSchema(s: Session): Promise<string | null>;
  listSchemas(s: Session): Promise<Array<Record<string, unknown>>>;
  listRelations(s: Session, schema: string, kinds: RelationKind[]): Promise<RelationSummary[]>;
  /** Full definitions for the given tables (all relations in schema when omitted). */
  tables(s: Session, schema: string, names?: string[]): Promise<{ tables: TableDef[]; unavailable: string[] }>;
  snapshot(s: Session, schema: string, names?: string[]): Promise<SchemaSnapshot>;
  listObjects(s: Session, schema: string, kind: ObjectKind): Promise<Array<Record<string, unknown>>>;
  supportedObjectKinds: ObjectKind[];
  search(s: Session, pattern: string, schema: string | null, limit: number): Promise<SearchHit[]>;
}

export const FK_ACTION: Record<string, string> = {
  a: "NO ACTION",
  r: "RESTRICT",
  c: "CASCADE",
  n: "SET NULL",
  d: "SET DEFAULT",
};

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

export function bool(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "t" || v === "true" || v === "YES";
}

/** Postgres text[] may arrive parsed (array) or as a literal "{a,b}". */
export function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.startsWith("{") && v.endsWith("}")) {
    const inner = v.slice(1, -1);
    if (!inner) return [];
    return inner.split(",").map((x) => x.replace(/^"|"$/g, ""));
  }
  return [];
}
