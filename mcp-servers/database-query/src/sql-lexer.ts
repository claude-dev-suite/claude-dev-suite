// SPDX-License-Identifier: MIT
/**
 * A small SQL lexer — just enough structure to make decisions that string
 * matching got wrong:
 *
 *  - where the statement really starts (after leading comments / parentheses),
 *  - whether a LIMIT/OFFSET/FETCH belongs to the OUTER query or a subquery,
 *  - where statement boundaries are (quotes, comments, $$-bodies and
 *    BEGIN … END blocks do not end a statement),
 *  - whether a trailing `;` is present.
 *
 * It is NOT a security boundary. Read-only is enforced by the engine
 * (read-only transactions / query_only), never by this file.
 */

import type { Engine } from "./config.js";

export type TokenType = "word" | "quoted" | "string" | "number" | "punct" | "param" | "comment" | "ws";

export interface Token {
  type: TokenType;
  text: string;
  /** Parenthesis depth at the token (0 = top level). */
  depth: number;
  start: number;
  end: number;
}

export function tokenize(sql: string, engine: Engine = "postgres"): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let depth = 0;
  const n = sql.length;
  const push = (type: TokenType, start: number, end: number, d = depth) =>
    tokens.push({ type, text: sql.slice(start, end), depth: d, start, end });

  while (i < n) {
    const c = sql[i];
    const start = i;

    // whitespace
    if (/\s/.test(c)) {
      while (i < n && /\s/.test(sql[i])) i++;
      push("ws", start, i);
      continue;
    }
    // line comments: -- (all), # (mysql)
    if ((c === "-" && sql[i + 1] === "-") || (c === "#" && engine === "mysql")) {
      while (i < n && sql[i] !== "\n") i++;
      push("comment", start, i);
      continue;
    }
    // block comments (nested in postgres)
    if (c === "/" && sql[i + 1] === "*") {
      let level = 1;
      i += 2;
      while (i < n && level > 0) {
        if (sql[i] === "*" && sql[i + 1] === "/") {
          level--;
          i += 2;
        } else if (engine === "postgres" && sql[i] === "/" && sql[i + 1] === "*") {
          level++;
          i += 2;
        } else i++;
      }
      push("comment", start, i);
      continue;
    }
    // dollar-quoted strings (postgres): $tag$ … $tag$
    if (c === "$" && engine === "postgres") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const close = sql.indexOf(tag, i + tag.length);
        i = close < 0 ? n : close + tag.length;
        push("string", start, i);
        continue;
      }
      const p = /^\$\d+/.exec(sql.slice(i));
      if (p) {
        i += p[0].length;
        push("param", start, i);
        continue;
      }
    }
    // string literals: '…' (E'…' handled by the word branch falling through)
    if (c === "'") {
      const prev = tokens[tokens.length - 1];
      const backslash =
        engine === "mysql" ||
        (engine === "postgres" && !!prev && prev.end === i && prev.type === "word" && /^[eE]$/.test(prev.text));
      i++;
      while (i < n) {
        if (backslash && sql[i] === "\\") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      push("string", start, i);
      continue;
    }
    // quoted identifiers: "…" (and strings in mysql), `…` (mysql, sqlite), […] (sqlite)
    if (c === '"' || c === "`" || (c === "[" && engine === "sqlite")) {
      const close = c === "[" ? "]" : c;
      i++;
      while (i < n) {
        if (engine === "mysql" && c === '"' && sql[i] === "\\") {
          i += 2;
          continue;
        }
        if (sql[i] === close) {
          if (close !== "]" && sql[i + 1] === close) {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      push(engine === "mysql" && c === '"' ? "string" : "quoted", start, i);
      continue;
    }
    if (c === "?") {
      i++;
      push("param", start, i);
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      while (i < n && /[A-Za-z0-9_$]/.test(sql[i])) i++;
      push("word", start, i);
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(sql[i + 1] ?? ""))) {
      while (i < n && /[0-9.eE]/.test(sql[i])) i++;
      push("number", start, i);
      continue;
    }
    if (c === "(") {
      push("punct", start, i + 1);
      depth++;
      i++;
      continue;
    }
    if (c === ")") {
      depth = Math.max(0, depth - 1);
      push("punct", start, i + 1);
      i++;
      continue;
    }
    i++;
    push("punct", start, i);
  }
  return tokens;
}

const significant = (t: Token) => t.type !== "ws" && t.type !== "comment";

/**
 * Split a script into statements. Semicolons inside strings, comments,
 * dollar-quoted bodies, and BEGIN … END blocks of CREATE FUNCTION/PROCEDURE/
 * TRIGGER statements do not split.
 */
export function splitStatements(sql: string, engine: Engine = "postgres"): string[] {
  const tokens = tokenize(sql, engine);
  const out: string[] = [];
  let stmtStart = 0;
  let blockDepth = 0;
  let firstWord: string | null = null;

  const flush = (end: number) => {
    const text = sql.slice(stmtStart, end).trim();
    if (tokenize(text, engine).some(significant)) out.push(text);
  };

  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (!significant(t)) continue;
    if (t.type === "word") {
      const w = t.text.toUpperCase();
      if (firstWord === null) firstWord = w;
      if (firstWord === "CREATE") {
        if (w === "BEGIN" || (w === "CASE" && blockDepth > 0)) blockDepth++;
        else if (w === "END" && blockDepth > 0) {
          const next = tokens.slice(k + 1).find(significant);
          const nw = next?.type === "word" ? next.text.toUpperCase() : "";
          if (!["IF", "LOOP", "WHILE", "REPEAT", "FOR"].includes(nw)) blockDepth--;
        }
      }
    }
    if (t.type === "punct" && t.text === ";" && t.depth === 0 && blockDepth === 0) {
      flush(t.start);
      stmtStart = t.end;
      firstWord = null;
    }
  }
  flush(sql.length);
  return out;
}

export interface StatementInfo {
  /** First keyword, upper-cased (e.g. SELECT, WITH, INSERT). "" when none. */
  keyword: string;
  /** Statement text with trailing semicolons and trailing comments removed. */
  text: string;
  /** Top-level LIMIT / OFFSET / FETCH present (not inside a subquery). */
  hasTopLevelLimit: boolean;
  /** Returns rows by construction (SELECT / WITH … SELECT / VALUES / TABLE). */
  rowReturning: boolean;
  /** Contains more than one statement. */
  multiple: boolean;
}

const ROW_KEYWORDS = new Set(["SELECT", "WITH", "VALUES", "TABLE"]);

export function analyzeStatement(sql: string, engine: Engine = "postgres"): StatementInfo {
  const parts = splitStatements(sql, engine);
  const multiple = parts.length > 1;
  const text = parts[0] ?? "";
  const tokens = tokenize(text, engine).filter(significant);
  const firstWord = tokens.find((t) => t.type === "word");
  const keyword = firstWord ? firstWord.text.toUpperCase() : "";
  // Over-detection is harmless (the caller then wraps in a subquery instead of
  // appending), under-detection would produce "LIMIT … LIMIT" — so any
  // depth-0 LIMIT/OFFSET/FETCH counts.
  const hasTopLevelLimit = tokens.some(
    (t) => t.type === "word" && t.depth === 0 && /^(LIMIT|OFFSET|FETCH)$/i.test(t.text)
  );

  let rowReturning = ROW_KEYWORDS.has(keyword);
  if (keyword === "WITH") {
    // WITH … INSERT/UPDATE/DELETE/MERGE is a write whose main statement is
    // after the CTE list — the first top-level DML keyword decides.
    const main = tokens.find(
      (t) => t.type === "word" && t.depth === 0 && /^(SELECT|INSERT|UPDATE|DELETE|MERGE|VALUES|TABLE)$/i.test(t.text)
    );
    rowReturning = !main || /^(SELECT|VALUES|TABLE)$/i.test(main.text);
  }
  return { keyword, text, hasTopLevelLimit, rowReturning, multiple };
}

const TXN_CONTROL = new Set(["BEGIN", "START", "COMMIT", "ROLLBACK", "END", "ABORT", "SAVEPOINT", "RELEASE"]);

/**
 * Transaction control inside a statement the tool wraps in its own
 * transaction would end that transaction early — a COMMIT in a "dry run"
 * would make it permanent. The tools own transaction boundaries.
 */
export function isTransactionControl(sql: string, engine: Engine): boolean {
  const first = tokenize(sql, engine).find((t) => t.type === "word");
  if (!first) return false;
  const w = first.text.toUpperCase();
  if (w === "BEGIN") {
    // BEGIN … END blocks only start CREATE statements, which begin with CREATE.
    return true;
  }
  return TXN_CONTROL.has(w) || (w === "PREPARE" && /^\s*PREPARE\s+TRANSACTION\b/i.test(sql));
}

/** Quote an identifier for the engine. */
export function quoteIdent(name: string, engine: Engine): string {
  if (engine === "mysql") return "`" + name.replace(/`/g, "``") + "`";
  return '"' + name.replace(/"/g, '""') + '"';
}

export function qualified(schema: string | null | undefined, name: string, engine: Engine): string {
  return schema ? `${quoteIdent(schema, engine)}.${quoteIdent(name, engine)}` : quoteIdent(name, engine);
}

export function quoteLiteral(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}
