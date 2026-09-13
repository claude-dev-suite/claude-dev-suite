#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Snapshot the repository's traffic statistics into a file that survives.
 *
 * GitHub's traffic API keeps a rolling 14-day window and nothing else. A repo
 * that is never snapshotted has no history: by the time a question like "did
 * the README rewrite change anything?" is worth asking, the data that would
 * answer it has already been discarded. This writes each day's views and clones
 * into a CSV, keyed by date, so a year from now the series exists.
 *
 * The referrer and popular-path lists are not per-day — the API returns one
 * aggregate over the same 14 days — so those are appended as dated snapshots
 * instead, and a row is written only when the fetch actually succeeded.
 *
 * Auth: the traffic endpoints require push access, and the Actions-provided
 * GITHUB_TOKEN has no `administration` permission to grant. So this needs a PAT
 * with `repo` scope in GH_TOKEN. Without one every call 403s, which is why a
 * failure here is loud rather than an empty commit.
 *
 * Usage: GH_TOKEN=<pat> node scripts/collect-traffic.mjs [--repo owner/name]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs', 'metrics');

const repoArgIndex = process.argv.indexOf('--repo');
const REPO =
  (repoArgIndex !== -1 && process.argv[repoArgIndex + 1]) ||
  process.env.GITHUB_REPOSITORY ||
  'claude-dev-suite/claude-dev-suite';

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('collect-traffic: no GH_TOKEN (or GITHUB_TOKEN) in the environment.');
  process.exit(1);
}

const api = async (endpoint) => {
  const res = await fetch(`https://api.github.com/repos/${REPO}/${endpoint}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dev-suite-traffic-collector',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `GET ${endpoint} -> ${res.status} ${res.statusText}. ` +
        (res.status === 403
          ? 'Traffic endpoints need push access: GH_TOKEN must be a PAT with `repo` scope, not the Actions GITHUB_TOKEN. '
          : '') +
        body.slice(0, 200)
    );
  }
  return res.json();
};

/** Merge dated rows into a CSV keyed by the first column, newest last. */
const mergeCsv = (file, header, rows) => {
  const existing = new Map();
  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      existing.set(line.split(',')[0], line);
    }
  }
  // A day inside the API window can still be counting, so a fresh row always
  // replaces the stored one for the same date.
  for (const row of rows) existing.set(row.split(',')[0], row);

  const sorted = [...existing.entries()].sort(([a], [b]) => a.localeCompare(b));
  const out = [header, ...sorted.map(([, line]) => line)].join('\n') + '\n';
  fs.writeFileSync(file, out, 'utf8');
  return sorted.length;
};

const day = (timestamp) => timestamp.slice(0, 10);

const main = async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const [views, clones, referrers, paths] = await Promise.all([
    api('traffic/views'),
    api('traffic/clones'),
    api('traffic/popular/referrers'),
    api('traffic/popular/paths'),
  ]);

  const byDate = new Map();
  for (const v of views.views ?? []) {
    byDate.set(day(v.timestamp), { views: v.count, viewUniques: v.uniques, clones: 0, cloneUniques: 0 });
  }
  for (const c of clones.clones ?? []) {
    const row = byDate.get(day(c.timestamp)) ?? { views: 0, viewUniques: 0 };
    byDate.set(day(c.timestamp), { ...row, clones: c.count, cloneUniques: c.uniques });
  }

  const dailyRows = [...byDate.entries()].map(
    ([date, r]) =>
      `${date},${r.views ?? 0},${r.viewUniques ?? 0},${r.clones ?? 0},${r.cloneUniques ?? 0}`
  );

  const dailyFile = path.join(OUT_DIR, 'traffic-daily.csv');
  const total = mergeCsv(dailyFile, 'date,views,view_uniques,clones,clone_uniques', dailyRows);

  const today = new Date().toISOString().slice(0, 10);

  const referrerRows = (referrers ?? []).map(
    (r) => `${today},${JSON.stringify(r.referrer)},${r.count},${r.uniques}`
  );
  const referrerFile = path.join(OUT_DIR, 'referrers.csv');
  mergeCsvAppendOnly(referrerFile, 'snapshot_date,referrer,count,uniques', referrerRows, today);

  const pathRows = (paths ?? [])
    .slice(0, 10)
    .map((p) => `${today},${JSON.stringify(p.path)},${p.count},${p.uniques}`);
  const pathFile = path.join(OUT_DIR, 'popular-paths.csv');
  mergeCsvAppendOnly(pathFile, 'snapshot_date,path,count,uniques', pathRows, today);

  console.log(
    `traffic: ${total} day(s) in traffic-daily.csv, ` +
      `${referrerRows.length} referrer(s) and ${pathRows.length} path(s) snapshotted for ${today}.`
  );
};

/** Replace today's block, keep every earlier snapshot. */
function mergeCsvAppendOnly(file, header, rows, today) {
  const kept = [];
  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    for (const line of lines.slice(1)) {
      if (line.trim() && !line.startsWith(`${today},`)) kept.push(line);
    }
  }
  fs.writeFileSync(file, [header, ...kept, ...rows].join('\n') + '\n', 'utf8');
}

main().catch((error) => {
  console.error(`collect-traffic: ${error.message}`);
  process.exit(1);
});
