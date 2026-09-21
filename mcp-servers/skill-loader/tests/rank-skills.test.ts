// SPDX-License-Identifier: MIT
/**
 * `list_skills({ search })`, which is the extended tier's only retrieval path
 * on every assistant that cannot run a hook.
 *
 * It used to be one case-insensitive substring test over path, name and
 * description. Measured against the real catalog with each skill's own
 * `USE WHEN` trigger words as the query — the friendliest input it will ever
 * see — that found the right skill 32% of the time, because a multi-word phrase
 * almost never appears verbatim in a description. The failure was invisible:
 * an empty result reads as "the catalog has nothing on this", and the agent
 * answers from general knowledge instead.
 *
 * These tests pin the properties that fix depends on, not the ranking itself:
 * a multi-word query must find what a single-word query finds, a one-word query
 * must keep working, and nothing may match on a word the query never contained.
 */

import { describe, it, expect } from 'vitest';
import { rankSkills, queryTerms, type SearchableSkill } from '../src/lib.js';

const catalog: SearchableSkill[] = [
  {
    path: 'frontend-frameworks/react',
    name: 'react',
    description:
      // Kept under 120 chars: audit-mcp-descriptions.mjs scans `description:`
      // fields in every file, fixtures included.
      'React library. USE WHEN: "React component", "useState", "useEffect", "hooks", "JSX"',
  },
  {
    path: 'state-management/zustand',
    name: 'zustand',
    description: 'Zustand store patterns. USE WHEN: user mentions "zustand", "store", "global state"',
  },
  {
    path: 'bitcoin/lightning/channels',
    name: 'channels',
    description: 'Lightning channel lifecycle, liquidity and rebalancing.',
  },
  {
    path: 'industrial/membrane-nf',
    name: 'membrane-nf',
    description: 'Nanofiltration membrane sizing, fouling and cleaning cycles.',
  },
  {
    path: 'languages/go',
    name: 'go',
    description: 'Go language: goroutines, channels, error handling.',
  },
];

const paths = (results: SearchableSkill[]) => results.map(r => r.path);

describe('rankSkills', () => {
  it('finds a skill from a multi-word phrase that appears nowhere verbatim', () => {
    // The whole point. "useState hooks JSX" is not a substring of anything.
    const found = paths(rankSkills(catalog, 'useState hooks JSX'));
    expect(found[0]).toBe('frontend-frameworks/react');
  });

  it('still finds what a one-word query used to find', () => {
    expect(paths(rankSkills(catalog, 'zustand'))).toContain('state-management/zustand');
  });

  it('keeps single-term matches when nothing scores higher', () => {
    // A one-word query can only ever score 1. Dropping single-term matches
    // unconditionally would make every one-word search return nothing.
    expect(rankSkills(catalog, 'nanofiltration').length).toBeGreaterThan(0);
  });

  it('drops single-term noise once something matches two terms', () => {
    // "channels" alone hits both the Lightning skill and Go's channels. With
    // "lightning" in the query, only one of them is still plausible.
    const found = paths(rankSkills(catalog, 'lightning channel rebalancing'));
    expect(found[0]).toBe('bitcoin/lightning/channels');
    expect(found).not.toContain('languages/go');
  });

  it('ranks an exact identifier above a description mention', () => {
    const found = paths(rankSkills(catalog, 'channels'));
    expect(found[0]).toBe('bitcoin/lightning/channels');
  });

  it('returns nothing rather than everything for a query of only common words', () => {
    expect(rankSkills(catalog, 'please update the project files')).toEqual([]);
  });

  it('never matches a skill on a word the query did not contain', () => {
    for (const result of rankSkills(catalog, 'zustand store')) {
      const haystack = `${result.path} ${result.name} ${result.description}`.toLowerCase();
      expect(haystack.includes('zustand') || haystack.includes('store')).toBe(true);
    }
  });

  it('is case-insensitive in both directions', () => {
    expect(paths(rankSkills(catalog, 'ZUSTAND Store'))).toContain('state-management/zustand');
  });
});

describe('queryTerms', () => {
  it('drops words that cannot tell two skills apart', () => {
    expect(queryTerms('please update the project files for react')).toEqual(['react']);
  });

  it('keeps short technical tokens when nothing else survives', () => {
    // "go" and "ai" are below the length floor, but a query of nothing but
    // those has to match something.
    expect(queryTerms('go')).toContain('go');
  });

  it('keeps version and package shapes intact', () => {
    expect(queryTerms('spring-boot 3.2 c++ c#')).toEqual(
      expect.arrayContaining(['spring-boot', '3.2', 'c++', 'c#'])
    );
  });
});
