#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Flag outside contributors' pull requests that are waiting on the maintainer.
 *
 * An unanswered first PR is how a project loses the contributor it just gained,
 * and a one-person repo has no one to notice. This labels any PR from a
 * non-maintainer whose last activity was the contributor's, older than a
 * threshold — and removes the label as soon as the maintainer replies, so the
 * label means "your turn" rather than "old".
 *
 * Bots are skipped: a stale dependabot PR is housekeeping, not a person waiting.
 *
 * Usage:
 *   GITHUB_TOKEN=<token> node scripts/triage-contributor-prs.mjs [--dry-run] [--hours 48]
 */

const REPO = process.env.GITHUB_REPOSITORY || 'claude-dev-suite/claude-dev-suite';
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');
const hoursArg = process.argv.indexOf('--hours');
const THRESHOLD_HOURS = hoursArg === -1 ? 48 : Number(process.argv[hoursArg + 1]);
const LABEL = 'needs-maintainer-response';

/** Association values that mean the account can merge here. */
const MAINTAINER_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

const api = async (endpoint, init = {}) => {
  const res = await fetch(
    endpoint.startsWith('https://') ? endpoint : `https://api.github.com/repos/${REPO}/${endpoint}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'dev-suite-pr-triage',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    }
  );
  if (res.status === 404 && init.method === 'DELETE') return null; // label wasn't there
  if (!res.ok) {
    throw new Error(`${init.method ?? 'GET'} ${endpoint} -> ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
};

const hoursSince = (iso) => (Date.now() - new Date(iso).getTime()) / 3_600_000;

const main = async () => {
  if (!TOKEN) throw new Error('no GH_TOKEN or GITHUB_TOKEN in the environment');

  const pulls = await api('pulls?state=open&per_page=100');
  let flagged = 0;
  let cleared = 0;

  for (const pr of pulls) {
    if (pr.draft) continue;
    if (pr.user?.type === 'Bot' || pr.user?.login?.endsWith('[bot]')) continue;
    if (MAINTAINER_ASSOCIATIONS.has(pr.author_association)) continue;

    const [comments, reviews] = await Promise.all([
      api(`issues/${pr.number}/comments?per_page=100`),
      api(`pulls/${pr.number}/reviews?per_page=100`),
    ]);

    const events = [
      { at: pr.created_at, byMaintainer: false },
      ...comments.map((c) => ({
        at: c.created_at,
        byMaintainer: MAINTAINER_ASSOCIATIONS.has(c.author_association),
      })),
      ...reviews.map((r) => ({
        at: r.submitted_at ?? pr.created_at,
        byMaintainer: MAINTAINER_ASSOCIATIONS.has(r.author_association),
      })),
    ].sort((a, b) => new Date(a.at) - new Date(b.at));

    const last = events[events.length - 1];
    const hasLabel = pr.labels.some((l) => l.name === LABEL);
    const waiting = !last.byMaintainer && hoursSince(last.at) >= THRESHOLD_HOURS;

    if (waiting && !hasLabel) {
      console.log(
        `triage: #${pr.number} by @${pr.user.login} waiting ${Math.floor(hoursSince(last.at))}h — labelling`
      );
      if (!DRY_RUN) {
        await api(`issues/${pr.number}/labels`, {
          method: 'POST',
          body: JSON.stringify({ labels: [LABEL] }),
        });
      }
      flagged++;
    } else if (!waiting && hasLabel) {
      console.log(`triage: #${pr.number} answered — clearing label`);
      if (!DRY_RUN) {
        await api(`issues/${pr.number}/labels/${encodeURIComponent(LABEL)}`, { method: 'DELETE' });
      }
      cleared++;
    }
  }

  console.log(
    `triage: ${pulls.length} open PR(s) checked, ${flagged} flagged, ${cleared} cleared` +
      (DRY_RUN ? ' (dry run, nothing written)' : '')
  );
};

main().catch((error) => {
  console.error(`triage: ${error.message}`);
  process.exit(1);
});
