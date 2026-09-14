#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Flag a pull request that closes an issue already taken by someone else.
 *
 * `claim.yml` records who owns an issue. Nothing checked the other direction,
 * so a second contributor could open a PR against a claimed issue and only find
 * out after the work was done — which is exactly what happened on #223/#224:
 * the issue was claimed and assigned, and a different contributor opened a PR
 * closing it the same day. The cost lands on the contributor, not the
 * maintainer, and a day-late comment does not give the time back.
 *
 * Both halves of "taken" are checked, because they are not the same thing. An
 * assignee is the normal case; the `claimed` label is what `claim.yml` falls
 * back to when GitHub refuses the assignment, which it does for an account that
 * has never interacted with the repository. Checking assignees alone would miss
 * precisely the first-time contributor the fallback exists for.
 *
 * The comment is posted once per PR: a re-run, or an edit to the PR body, must
 * not stack another copy onto someone who already read it.
 *
 * Usage:
 *   GITHUB_TOKEN=<token> node scripts/check-pr-claim-collision.mjs [--dry-run]
 */

import { pathToFileURL } from 'node:url';

const REPO = process.env.GITHUB_REPOSITORY || 'claude-dev-suite/claude-dev-suite';
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');
const LABEL = 'claim-collision';
const CLAIMED_LABEL = 'claimed';

/** Hidden marker, so a re-run recognises its own comment without matching prose. */
const MARKER = '<!-- dev-suite:claim-collision -->';

/** Association values that mean the account can merge here. */
const MAINTAINER_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

/**
 * GitHub's closing keywords, as documented for linked issues. The number may be
 * separated by a colon and whitespace, and the keyword is case-insensitive.
 */
const CLOSING_KEYWORD = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b\s*:?\s*#(\d+)/gi;

const api = async (endpoint, init = {}) => {
  const res = await fetch(
    endpoint.startsWith('https://') ? endpoint : `https://api.github.com/repos/${REPO}/${endpoint}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'dev-suite-claim-collision',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    }
  );
  if (res.status === 404) return null; // a referenced number need not exist
  if (!res.ok) {
    throw new Error(`${init.method ?? 'GET'} ${endpoint} -> ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
};

/** Issue numbers this PR declares it closes, from the title and the body. */
export const closesIssues = (pr) => {
  const text = `${pr.title ?? ''}\n${pr.body ?? ''}`;
  return [...new Set([...text.matchAll(CLOSING_KEYWORD)].map((m) => Number(m[1])))];
};

/**
 * Who holds this issue, if anyone — or null when it is free. `via` distinguishes
 * a real assignment from the label fallback, because the wording differs: with
 * the label alone there is no reliable way to name the claimer.
 */
export const heldBy = (issue, prAuthor) => {
  const assignees = (issue.assignees ?? []).map((a) => a.login);
  if (assignees.length > 0) {
    if (assignees.includes(prAuthor)) return null;
    return { via: 'assignee', who: assignees };
  }
  const labels = (issue.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name));
  if (labels.includes(CLAIMED_LABEL)) return { via: 'label', who: [] };
  return null;
};

const commentFor = (pr, collisions) => {
  const lines = collisions.map(({ issue, hold }) =>
    hold.via === 'assignee'
      ? `- #${issue} is assigned to ${hold.who.map((w) => `@${w}`).join(', ')}`
      : `- #${issue} is marked \`${CLAIMED_LABEL}\` — someone claimed it, and GitHub refused the assignment because the account had not interacted with this repository yet`
  );

  return [
    MARKER,
    `Heads up, @${pr.user.login} — this PR closes an issue someone else has already taken:`,
    '',
    ...lines,
    '',
    'That is not a rejection of this PR, and it is not a rule you were expected to',
    'have memorised. `CONTRIBUTING.md` asks contributors to comment on an issue',
    'before starting, and treats a claimed issue as taken until it has been idle for',
    'a week — so the usual outcome here is that two people wrote the same thing and',
    'one of them wasted an evening.',
    '',
    'Best move is to say so on the issue and agree who carries it. If the claim has',
    'gone quiet past a week, say that on the issue and it is yours. A maintainer will',
    'weigh in either way.',
  ].join('\n');
};

const main = async () => {
  if (!TOKEN) throw new Error('no GH_TOKEN or GITHUB_TOKEN in the environment');

  const pulls = await api('pulls?state=open&per_page=100');
  let flagged = 0;

  for (const pr of pulls) {
    if (pr.draft) continue;
    if (pr.user?.type === 'Bot' || pr.user?.login?.endsWith('[bot]')) continue;
    // A maintainer taking over a claimed issue is a decision, not a collision.
    if (MAINTAINER_ASSOCIATIONS.has(pr.author_association)) continue;

    const referenced = closesIssues(pr);
    if (referenced.length === 0) continue;

    const collisions = [];
    for (const number of referenced) {
      const issue = await api(`issues/${number}`);
      if (!issue || issue.pull_request) continue; // a PR referencing a PR is not a claim
      const hold = heldBy(issue, pr.user.login);
      if (hold) collisions.push({ issue: number, hold });
    }
    if (collisions.length === 0) continue;

    const comments = await api(`issues/${pr.number}/comments?per_page=100`);
    if ((comments ?? []).some((c) => (c.body ?? '').includes(MARKER))) {
      console.log(`#${pr.number}: already flagged, leaving it alone`);
      continue;
    }

    const targets = collisions.map((c) => `#${c.issue}`).join(', ');
    if (DRY_RUN) {
      console.log(`#${pr.number} by ${pr.user.login} collides with ${targets} (dry run)`);
      flagged += 1;
      continue;
    }

    await api(`issues/${pr.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: commentFor(pr, collisions) }),
    });
    await api(`issues/${pr.number}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels: [LABEL] }),
    });
    console.log(`#${pr.number} by ${pr.user.login} collides with ${targets} — flagged`);
    flagged += 1;
  }

  console.log(flagged === 0 ? 'No claim collisions.' : `${flagged} PR(s) flagged.`);
};

// Only when run as a command. The two pure helpers above are imported by the
// tests, and importing must not fire a pass over the live repository.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`claim-collision: ${err.message}`);
    process.exit(1);
  });
}
