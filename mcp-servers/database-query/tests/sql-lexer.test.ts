// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import { analyzeStatement, splitStatements, quoteIdent } from '../src/sql-lexer.js';

describe('analyzeStatement', () => {
  it('finds the first keyword after leading comments', () => {
    const a = analyzeStatement('-- why\n/* block */ SELECT 1');
    expect(a.keyword).toBe('SELECT');
    expect(a.rowReturning).toBe(true);
  });

  it.each(['WITH x AS (SELECT 1) SELECT * FROM x', 'VALUES (1), (2)', 'TABLE users'])('%s is row-returning', (sql) => {
    expect(analyzeStatement(sql).rowReturning).toBe(true);
  });

  it('WITH … INSERT is not row-returning (data-modifying CTE)', () => {
    expect(analyzeStatement('WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x').rowReturning).toBe(false);
  });

  it('strips the trailing semicolon', () => {
    expect(analyzeStatement('SELECT 1;  ').text).toBe('SELECT 1');
  });

  it('a LIMIT inside a subquery is not a top-level LIMIT', () => {
    expect(analyzeStatement('SELECT * FROM (SELECT * FROM t LIMIT 5) s').hasTopLevelLimit).toBe(false);
    expect(analyzeStatement('SELECT * FROM t WHERE id IN (SELECT id FROM u LIMIT 1)').hasTopLevelLimit).toBe(false);
  });

  it('detects a top-level LIMIT / OFFSET / FETCH', () => {
    expect(analyzeStatement('SELECT * FROM t LIMIT 5').hasTopLevelLimit).toBe(true);
    expect(analyzeStatement('SELECT * FROM t OFFSET 5').hasTopLevelLimit).toBe(true);
    expect(analyzeStatement('SELECT * FROM t FETCH FIRST 5 ROWS ONLY').hasTopLevelLimit).toBe(true);
  });

  it('ignores LIMIT inside strings, identifiers and comments', () => {
    expect(analyzeStatement(`SELECT 'LIMIT 5', "limit" FROM t -- LIMIT 3`).hasTopLevelLimit).toBe(false);
  });

  it('flags multiple statements', () => {
    expect(analyzeStatement('SELECT 1; COMMIT; DROP TABLE users').multiple).toBe(true);
    expect(analyzeStatement('SELECT 1;').multiple).toBe(false);
  });
});

describe('splitStatements', () => {
  it('does not split inside strings, quoted identifiers or comments', () => {
    expect(splitStatements(`SELECT 'a;b', "c;d" -- x;y\n; SELECT 2`)).toEqual([`SELECT 'a;b', "c;d" -- x;y`, 'SELECT 2']);
  });

  it('does not split inside $$ bodies (postgres)', () => {
    const fn = `CREATE FUNCTION f() RETURNS int AS $body$ BEGIN RETURN 1; END; $body$ LANGUAGE plpgsql`;
    expect(splitStatements(`${fn}; SELECT f();`)).toEqual([fn, 'SELECT f()']);
  });

  it('does not split inside BEGIN ATOMIC … END', () => {
    const fn = 'CREATE FUNCTION g() RETURNS int LANGUAGE sql BEGIN ATOMIC SELECT 1; SELECT 2; END';
    expect(splitStatements(`${fn}; SELECT 3`)).toEqual([fn, 'SELECT 3']);
  });

  it('handles MySQL procedure bodies with END IF', () => {
    const p = 'CREATE PROCEDURE p() BEGIN IF 1 THEN SELECT 1; END IF; SELECT 2; END';
    expect(splitStatements(`${p}; SELECT 9`, 'mysql')).toEqual([p, 'SELECT 9']);
  });

  it('handles MySQL backslash escapes and # comments', () => {
    expect(splitStatements(`SELECT 'it\\'s;'; # c;\nSELECT 2`, 'mysql')).toEqual([`SELECT 'it\\'s;'`, '# c;\nSELECT 2']);
  });

  it('handles nested block comments in postgres', () => {
    expect(splitStatements('/* a /* b; */ c; */ SELECT 1; SELECT 2')).toHaveLength(2);
  });

  it('drops empty statements', () => {
    expect(splitStatements(';; SELECT 1 ;; ')).toEqual(['SELECT 1']);
  });
});

describe('quoteIdent', () => {
  it('doubles embedded quotes', () => {
    expect(quoteIdent('a"b', 'postgres')).toBe('"a""b"');
    expect(quoteIdent('a`b', 'mysql')).toBe('`a``b`');
  });
});
