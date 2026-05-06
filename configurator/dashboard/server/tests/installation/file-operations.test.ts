// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import { flattenSkillName } from '../../src/services/installation/file-operations.js';

describe('flattenSkillName', () => {
  it('passes through a simple lowercase name unchanged', () => {
    expect(flattenSkillName('typescript')).toBe('typescript');
  });

  it('flattens a nested path by replacing slashes with hyphens', () => {
    expect(flattenSkillName('frontend-frameworks/react')).toBe('frontend-frameworks-react');
  });

  it('handles deeply nested paths', () => {
    expect(flattenSkillName('best-practices/testing/integration')).toBe(
      'best-practices-testing-integration',
    );
  });

  it('lowercases uppercase characters', () => {
    expect(flattenSkillName('Frontend/React')).toBe('frontend-react');
  });

  it('replaces invalid characters with hyphens', () => {
    expect(flattenSkillName('foo_bar/baz.qux')).toBe('foo-bar-baz-qux');
  });

  it('collapses runs of hyphens', () => {
    expect(flattenSkillName('a//b///c')).toBe('a-b-c');
  });

  it('strips leading and trailing hyphens', () => {
    expect(flattenSkillName('/foo/')).toBe('foo');
  });

  it('truncates names longer than 64 characters and appends a hash suffix', () => {
    const longInput = 'a'.repeat(40) + '/' + 'b'.repeat(40); // 81 chars after replacement
    const result = flattenSkillName(longInput);
    expect(result.length).toBeLessThanOrEqual(64);
    // Suffix is 8 hex chars after a hyphen — guarantees uniqueness across long inputs
    expect(result).toMatch(/-[0-9a-f]{8}$/);
  });

  it('produces distinct flat names for distinct long inputs sharing a prefix', () => {
    const longA = 'a'.repeat(70) + '/x';
    const longB = 'a'.repeat(70) + '/y';
    expect(flattenSkillName(longA)).not.toBe(flattenSkillName(longB));
  });

  it('only emits characters allowed by Claude Code skill naming rules', () => {
    const result = flattenSkillName('Frontend/React_Hooks.v2');
    expect(result).toMatch(/^[a-z0-9-]+$/);
  });
});
