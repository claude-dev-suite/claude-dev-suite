// SPDX-License-Identifier: MIT
/**
 * Handler for find_slow_queries tool
 */

import { FindSlowQueriesSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { getPool } from "./db.js";

export const handleFindSlowQueries: Handler = async (args): Promise<HandlerResult> => {
  const { table } = FindSlowQueriesSchema.parse(args);

  const db = getPool();

  // Get table statistics
  let statsQuery = `
    SELECT
      schemaname,
      relname as table_name,
      seq_scan,
      seq_tup_read,
      idx_scan,
      idx_tup_fetch,
      n_tup_ins,
      n_tup_upd,
      n_tup_del,
      n_live_tup,
      n_dead_tup,
      last_vacuum,
      last_analyze
    FROM pg_stat_user_tables
  `;

  const params: string[] = [];
  if (table) {
    statsQuery += " WHERE relname = $1";
    params.push(table);
  }
  statsQuery += " ORDER BY seq_scan DESC";

  const stats = await db.query(statsQuery, params);

  // Get missing indexes info
  const missingIndexes = await db.query(`
    SELECT
      schemaname,
      relname as table_name,
      seq_scan,
      seq_tup_read,
      idx_scan,
      CASE WHEN seq_scan > 0
        THEN round(seq_tup_read::numeric / seq_scan, 2)
        ELSE 0
      END as avg_seq_tup_per_scan
    FROM pg_stat_user_tables
    WHERE seq_scan > idx_scan
      AND seq_tup_read > 10000
    ORDER BY seq_tup_read DESC
    LIMIT 10
  `);

  // Get unused indexes
  const unusedIndexes = await db.query(`
    SELECT
      schemaname,
      relname as table_name,
      indexrelname as index_name,
      idx_scan,
      pg_size_pretty(pg_relation_size(indexrelid)) as index_size
    FROM pg_stat_user_indexes
    WHERE idx_scan = 0
      AND indexrelname NOT LIKE '%_pkey'
    ORDER BY pg_relation_size(indexrelid) DESC
    LIMIT 10
  `);

  // Generate recommendations
  const recommendations: string[] = [];

  for (const row of missingIndexes.rows) {
    recommendations.push(
      `Table "${row.table_name}" has ${row.seq_scan} sequential scans vs ${row.idx_scan} index scans - consider adding indexes`
    );
  }

  for (const row of unusedIndexes.rows) {
    recommendations.push(
      `Index "${row.index_name}" on "${row.table_name}" is unused (${row.index_size}) - consider dropping`
    );
  }

  return jsonResponse({
    tableStats: stats.rows,
    potentialMissingIndexes: missingIndexes.rows,
    unusedIndexes: unusedIndexes.rows,
    recommendations,
  });
};
