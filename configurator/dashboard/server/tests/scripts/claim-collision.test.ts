/**
 * The claim-collision check's two pure halves.
 *
 * Its whole risk is payload shape, like the hook scripts': what a PR body
 * actually says when it closes an issue, and what the GitHub issue payload
 * looks like when someone holds it. A false negative is the expensive
 * direction — it is a contributor's wasted evening — so the cases below lean on
 * the forms that are easy to miss: a bare `#223` that closes nothing, a
 * `claimed` label with no assignee, and labels arriving as objects rather than
 * strings.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

// tests/scripts/ is five levels below the repo root.
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..'
);

const { closesIssues, heldBy } = await import(
  /* @vite-ignore */ path.join(repoRoot, 'scripts', 'check-pr-claim-collision.mjs')
);

describe('closesIssues', () => {
  it('reads a closing keyword from the body', () => {
    expect(closesIssues({ title: 'docs: clarify', body: 'Closes #223' })).toEqual([223]);
  });

  it('reads one from the title', () => {
    expect(closesIssues({ title: 'fix: stale list, fixes #12', body: '' })).toEqual([12]);
  });

  it('accepts every documented keyword, in any case', () => {
    const body = 'close #1 closes #2 closed #3 fix #4 fixes #5 fixed #6 RESOLVE #7 Resolves #8 resolved #9';
    expect(closesIssues({ title: '', body })).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('accepts a colon between the keyword and the number', () => {
    expect(closesIssues({ title: '', body: 'Closes: #77' })).toEqual([77]);
  });

  it('ignores a bare issue reference', () => {
    // "See #223 for context" links the issue; it does not close it, and
    // flagging it would put a collision notice on every PR that cites a thread.
    expect(closesIssues({ title: '', body: 'See #223 for context' })).toEqual([]);
  });

  it('does not match a keyword inside a longer word', () => {
    expect(closesIssues({ title: '', body: 'prefixes #5 and postfixes #6' })).toEqual([]);
  });

  it('deduplicates and collects several', () => {
    expect(closesIssues({ title: 'closes #3', body: 'Closes #3, closes #4' })).toEqual([3, 4]);
  });

  it('survives a missing title or body', () => {
    expect(closesIssues({})).toEqual([]);
    expect(closesIssues({ body: null, title: undefined })).toEqual([]);
  });
});

describe('heldBy', () => {
  it('reports an assignee who is not the PR author', () => {
    const issue = { assignees: [{ login: 'someone' }], labels: [] };
    expect(heldBy(issue, 'other')).toEqual({ via: 'assignee', who: ['someone'] });
  });

  it('is silent when the PR author is the assignee', () => {
    const issue = { assignees: [{ login: 'author' }], labels: [] };
    expect(heldBy(issue, 'author')).toBeNull();
  });

  it('is silent when the author is one of several assignees', () => {
    const issue = { assignees: [{ login: 'someone' }, { login: 'author' }], labels: [] };
    expect(heldBy(issue, 'author')).toBeNull();
  });

  it('falls back to the claimed label when assignment was refused', () => {
    // claim.yml records the claim this way for an account GitHub will not let it
    // assign — a first-time contributor, which is the case that matters most.
    const issue = { assignees: [], labels: [{ name: 'claimed' }] };
    expect(heldBy(issue, 'other')).toEqual({ via: 'label', who: [] });
  });

  it('reads labels given as plain strings', () => {
    expect(heldBy({ assignees: [], labels: ['claimed'] }, 'other')).toEqual({
      via: 'label',
      who: [],
    });
  });

  it('leaves a free issue alone', () => {
    expect(heldBy({ assignees: [], labels: [{ name: 'good first issue' }] }, 'other')).toBeNull();
  });

  it('survives a payload with neither key', () => {
    expect(heldBy({}, 'other')).toBeNull();
  });
});
