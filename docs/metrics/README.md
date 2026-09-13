# Metrics

Traffic snapshots, written weekly by `.github/workflows/metrics.yml`.

GitHub's traffic API keeps a rolling **14-day window** and nothing else. Anything older than
that is gone — there is no archive to ask for it later. These files exist so that questions
like "did the README rewrite change the clone-to-star ratio?" have an answer a year from now.

| File | Contents |
|------|----------|
| `traffic-daily.csv` | One row per day: `date,views,view_uniques,clones,clone_uniques`. Rows are keyed by date, and a re-run replaces a day that was still counting when it was first captured |
| `referrers.csv` | Top referrers per snapshot date. The API aggregates these over its own 14-day window rather than per day, so treat a row as "the fortnight ending on `snapshot_date`" |
| `popular-paths.csv` | Same shape, for the ten most-visited paths |

## Reading them honestly

- **Clones are not users.** CI systems, mirrors and scrapers clone. The unique-cloner count is
  the more meaningful of the two, and it is still an upper bound.
- **A referrer only appears when the browser sent one.** Traffic from a terminal, a chat client
  or a link in a PDF arrives as no referrer at all, so the referrer table under-counts exactly
  the audience this project has.
- **The windows overlap.** Two snapshots a week apart share seven days of data; don't sum them.

## Running it by hand

```bash
GH_TOKEN=<a PAT with repo scope> node scripts/collect-traffic.mjs
```

The Actions `GITHUB_TOKEN` cannot do this — the traffic endpoints require push access, which
that token has no permission to grant. The workflow uses the `GH_TOKEN` repository secret.
