---
name: sql-review
description: |
  Reviewing SQL - what to flag, and what the database and linters actually check for you

  USE WHEN: you are reviewing, critiquing or auditing existing SQL - a "code
  review" of a query, a migration, a stored procedure, a view, or ORM-generated
  SQL in a diff or a PR; deciding what to comment on in SQL; judging whether a
  query is correct under concurrency and at scale

  DO NOT USE FOR: writing or learning SQL - use `databases/sql-fundamentals` or
  `databases/sql-advanced`; vendor-specific tuning - use the PostgreSQL, MySQL,
  Oracle or SQL Server skills; schema migration mechanics - use
  `databases/migrations` and `databases/flyway`
allowed-tools: Read, Grep, Glob
---
# Reviewing SQL

A reviewer's leverage is what the toolchain cannot say — and in SQL that is
almost everything. There is no type checker for query *meaning*: the parser
accepts anything well-formed, and `sqlfluff` checks layout and naming, not
correctness. A query that returns the wrong rows and a query that returns the
right ones are equally valid to every tool in the pipeline.

So this skill is longer on checks and shorter on "already covered" than any
other in the review category. Three themes carry most of it:

1. **NULL is not a value**, and three-valued logic silently changes results.
2. **A query is correct only under the isolation level it actually runs at.**
3. **The plan, not the text, decides the cost** — and small edits change plans.

The snippets are fragments cut down to the defect, not runnable programs.

## Already covered - do not spend review on it

| Defect | Reported by |
|---|---|
| Syntax error, unknown column or table | the database, at parse or prepare time |
| Type mismatch in a comparison | the database — but **many engines coerce silently instead** |
| Layout, capitalisation, alias naming | `sqlfluff` (style rules only) |
| A missing `NOT NULL` or foreign key | nothing — unless the migration adds it |
| A query that is slow | nothing, until production; `EXPLAIN` tells you only if someone runs it |

That table is short on purpose. Assume nothing checked the meaning of this
query, because nothing did.

## NULL and three-valued logic

### `NOT IN` against anything nullable

```sql
SELECT * FROM orders
WHERE customer_id NOT IN (SELECT id FROM banned);   -- one NULL in `banned` returns ZERO rows
```

**When you see it**: `NOT IN (subquery)` where the subquery column is not
declared `NOT NULL`.

**Ask**: can that column be NULL? `x NOT IN (1, NULL)` evaluates to UNKNOWN, not
TRUE, so the row is filtered out — every row. The query returns an empty set and
looks like a data problem. `NOT EXISTS` has the semantics people expect here,
and it is also usually the better plan.

### An aggregate that silently skips NULLs

```sql
SELECT AVG(rating) FROM reviews;      -- ignores NULL ratings entirely
SELECT COUNT(rating) FROM reviews;    -- not the row count
```

**When you see it**: `AVG`, `SUM`, `COUNT(column)` on a nullable column,
especially when the result is presented as "the average" of something.

**Ask**: is skipping the missing values the intended definition? `COUNT(*)` and
`COUNT(col)` differ exactly here, and the difference is invisible until some
rows are NULL.

### `<>` excluding rows that should match

```sql
SELECT * FROM users WHERE status <> 'banned';   -- rows with NULL status are excluded
```

**When you see it**: any inequality on a nullable column.

**Ask**: should NULL rows appear? Comparison with NULL is UNKNOWN, so they are
dropped from both `= 'banned'` and `<> 'banned'`. That is often not what the
sentence in the ticket said.

## Concurrency and transactions

### Read-modify-write with no lock

```sql
SELECT balance FROM accounts WHERE id = 1;          -- app subtracts
UPDATE accounts SET balance = 90 WHERE id = 1;      -- last writer wins
```

**When you see it**: a `SELECT` whose value is computed on and written back,
across two statements.

**Ask**: what happens with two concurrent callers? Both read 100, both write 90,
one debit disappears. Correct in every test that runs single-threaded. The fixes
are `SELECT ... FOR UPDATE`, an atomic `UPDATE ... SET balance = balance - 10`,
or an optimistic version column — and they differ in what they cost.

### An assumption that only holds at a higher isolation level

```sql
BEGIN;
SELECT COUNT(*) FROM seats WHERE event = 1 AND free;   -- 1
-- another transaction books it here
INSERT INTO bookings VALUES (...);                     -- oversold
COMMIT;
```

**When you see it**: a check-then-act inside a transaction; any invariant
enforced by reading before writing.

**Ask**: which isolation level does this connection use? The default is READ
COMMITTED in PostgreSQL, SQL Server and Oracle, and REPEATABLE READ in MySQL —
none of which prevents this. Only SERIALIZABLE does, and then the code must
handle serialisation failures by retrying. A unique constraint is usually the
cheaper answer.

### A migration that locks a large table

```sql
ALTER TABLE orders ADD COLUMN status text NOT NULL DEFAULT 'new';
CREATE INDEX idx_orders_user ON orders(user_id);
```

**When you see it**: DDL in a migration against a table that is large in
production.

**Ask**: how long does this hold its lock, and on what? Adding a `NOT NULL`
column with a default rewrites the whole table on older PostgreSQL (fixed in 11)
and on MySQL depending on the algorithm. `CREATE INDEX` blocks writes unless it
is `CONCURRENTLY` — which in turn cannot run inside a transaction, so the
migration tool has to be told.

## Plans, indexes and cost

### A predicate that disables the index

```sql
WHERE DATE(created_at) = '2026-01-01'      -- function on the column: no index use
WHERE user_id = '42'                       -- text compared to an integer column
WHERE name LIKE '%smith'                   -- leading wildcard
```

**When you see it**: a function, a cast, or an implicit type coercion applied to
the **column** side of a predicate; a `LIKE` starting with `%`.

**Ask**: can the index still be used? Wrapping the column forces a scan of every
row. The range rewrite (`created_at >= '2026-01-01' AND < '2026-01-02'`) is
index-friendly and means the same thing. Implicit coercion is the sneakiest: it
works, returns the right answer, and quietly does a full scan.

### `SELECT *` in anything durable

```sql
CREATE VIEW active_users AS SELECT * FROM users WHERE active;
```

**When you see it**: `SELECT *` in a view, a stored procedure, an `INSERT ...
SELECT`, or application code that maps columns positionally.

**Ask**: what happens when a column is added? Views can bind their column list
at creation and not see it; `INSERT ... SELECT` breaks or, worse, shifts values
into the wrong columns. It also fetches large columns nobody reads.

### Pagination with a non-deterministic order

```sql
SELECT * FROM posts ORDER BY created_at DESC LIMIT 20 OFFSET 40;
```

**When you see it**: `LIMIT`/`OFFSET` with an `ORDER BY` that is not unique.

**Ask**: are ties possible? Rows sharing `created_at` may come back in any
order, and a different order per page — so a row can appear on two pages or on
none. Adding a unique tiebreaker (`, id DESC`) fixes correctness; keyset
pagination also fixes the cost, since `OFFSET` still reads and discards the
skipped rows.

### A join that multiplies rows before aggregating

```sql
SELECT o.id, SUM(p.amount)
FROM orders o
JOIN payments p ON p.order_id = o.id
JOIN tags t ON t.order_id = o.id      -- second one-to-many: SUM is now inflated
GROUP BY o.id;
```

**When you see it**: two or more joins to one-to-many relations in the same
query, with an aggregate over one of them.

**Ask**: does either join fan out? Each payment row is duplicated once per tag,
so the total is multiplied. The result is plausible, never zero, and wrong.
Aggregate in a subquery or use `FILTER`/`DISTINCT` deliberately.

### An ORM query issuing one statement per row

```sql
-- the diff shows one query; the log shows 501
SELECT * FROM orders;                          -- then, per order:
SELECT * FROM customers WHERE id = ?;
```

**When you see it**: a loop in application code touching a lazy relation, or a
serialiser walking associations.

**Ask**: how many statements does this make for N rows? The SQL in the diff is
fine; the defect is at the boundary, which is why it survives every SQL-level
check. Eager loading or a join fixes it.

### String-built SQL

```sql
-- app side: "SELECT * FROM t WHERE name = '" + input + "'"
```

**When you see it**: concatenation or interpolation building a statement from
anything not a literal — including an "internal" value, an ORDER BY column name,
or a table name.

**Ask**: is every interpolated part a bound parameter? Parameters cover values
and **cannot** cover identifiers, so a dynamic column or table name needs an
allowlist rather than escaping. This is the one SQL finding some tools do catch
— on the application side, not here.

## Engine-dependent - establish which database before commenting

Almost nothing in SQL is portable at the level that matters for review.

| Question | Why it changes the review |
|---|---|
| Which engine and version? | `NOT NULL DEFAULT` rewrites the table before PostgreSQL 11; MySQL's default isolation is REPEATABLE READ while everyone else uses READ COMMITTED |
| Default isolation level, and does the app override it? | Decides whether the check-then-act findings above are real |
| Is `CREATE INDEX CONCURRENTLY` (or `ALGORITHM=INPLACE`) used in migrations? | Decides whether a migration takes the site down |
| Collation and case sensitivity | MySQL's default collation is case-insensitive; PostgreSQL's is not. A uniqueness assumption can hold in one and not the other |
| Is this ORM-generated? | Then the fix belongs in the mapping, not in the SQL text |

## What to say

Anchor the comment to the statement, name the condition that triggers the
defect, and say what breaks: "`banned.id` is nullable, so a single NULL there
makes this `NOT IN` return no rows at all" beats "prefer NOT EXISTS". If you
cannot state the data that produces the wrong answer, it is a preference, not a
defect.

Separate correctness from cost, and say which you are raising. A wrong result
and a slow query deserve different urgency, and mixing them in one comment
makes both easier to dismiss.
