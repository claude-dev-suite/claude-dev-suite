import { describe, it, expect } from 'vitest';
import type {
  TechnologyManifest,
  TopicVersionInfo,
  DeltaContent,
  DeltaDifference,
  VersionedDocRequest,
  VersionedDocResponse,
} from '../src/types/versioning.js';

describe('Versioning Types', () => {
  describe('TechnologyManifest', () => {
    it('should accept valid manifest structure', () => {
      const manifest: TechnologyManifest = {
        technology: 'react',
        latest: '19',
        supported: ['18', '19'],
        eol: ['17', '16'],
        topics: {
          hooks: {
            has_delta: ['18'],
            not_in: [],
          },
          'server-components': {
            has_delta: ['18'],
            not_in: [],
          },
        },
        breaking_changes: {
          '18→19': [
            'use() hook for promises and context',
            'React Compiler (experimental)',
            'Actions for form handling',
          ],
        },
      };

      expect(manifest.technology).toBe('react');
      expect(manifest.latest).toBe('19');
      expect(manifest.supported).toContain('18');
      expect(manifest.eol).toContain('17');
      expect(manifest.topics.hooks.has_delta).toContain('18');
      expect(manifest.breaking_changes?.['18→19']).toHaveLength(3);
    });

    it('should allow optional fields', () => {
      const minimalManifest: TechnologyManifest = {
        technology: 'simple-lib',
        latest: '1',
        supported: ['1'],
        topics: {},
      };

      expect(minimalManifest.eol).toBeUndefined();
      expect(minimalManifest.breaking_changes).toBeUndefined();
    });
  });

  describe('TopicVersionInfo', () => {
    it('should track version deltas', () => {
      const info: TopicVersionInfo = {
        has_delta: ['3', '4'],
        renamed_from: { '2': 'old-name' },
        not_in: ['1'],
      };

      expect(info.has_delta).toContain('3');
      expect(info.renamed_from?.['2']).toBe('old-name');
      expect(info.not_in).toContain('1');
    });
  });

  describe('DeltaContent', () => {
    it('should structure delta information', () => {
      const delta: DeltaContent = {
        version: '18',
        not_available: ['use()', 'useOptimistic()', 'useFormStatus()'],
        differences: [
          {
            feature: 'Promise handling',
            in_this_version: 'Use Suspense + external library',
            in_latest: 'use(promise) hook',
          },
        ],
        deprecated_in_newer: ['class components'],
        migration_notes: 'Upgrade to React 19 for new hooks',
      };

      expect(delta.version).toBe('18');
      expect(delta.not_available).toContain('use()');
      expect(delta.differences?.[0].feature).toBe('Promise handling');
    });
  });

  describe('DeltaDifference', () => {
    it('should compare version implementations', () => {
      const diff: DeltaDifference = {
        feature: 'State Management',
        in_this_version: 'Use useState for local state',
        in_latest: 'Use $state rune for reactivity',
      };

      expect(diff.feature).toBe('State Management');
      expect(diff.in_this_version).toContain('useState');
      expect(diff.in_latest).toContain('$state');
    });
  });

  describe('VersionedDocRequest', () => {
    it('should accept basic request', () => {
      const request: VersionedDocRequest = {
        technology: 'vue',
        topic: 'composition-api',
      };

      expect(request.version).toBeUndefined();
    });

    it('should accept versioned request', () => {
      const request: VersionedDocRequest = {
        technology: 'vue',
        topic: 'composition-api',
        version: '2',
      };

      expect(request.version).toBe('2');
    });
  });

  describe('VersionedDocResponse', () => {
    it('should structure response for latest version', () => {
      const response: VersionedDocResponse = {
        content: '# Vue 3 Composition API\n\n...',
        technology: 'vue',
        topic: 'composition-api',
        version: '3',
        is_latest: true,
        latest_version: '3',
        supported_versions: ['2', '3'],
        delta_applied: false,
      };

      expect(response.is_latest).toBe(true);
      expect(response.upgrade_available).toBeUndefined();
    });

    it('should structure response for older version', () => {
      const response: VersionedDocResponse = {
        content: '# Vue 2 Composition API\n\n> **Note:** This documentation is for version 2...',
        technology: 'vue',
        topic: 'composition-api',
        version: '2',
        is_latest: false,
        latest_version: '3',
        supported_versions: ['2', '3'],
        delta_applied: true,
        upgrade_available: '3',
      };

      expect(response.is_latest).toBe(false);
      expect(response.delta_applied).toBe(true);
      expect(response.upgrade_available).toBe('3');
    });
  });
});

describe('Manifest Examples', () => {
  it('should validate React manifest structure', () => {
    const reactManifest: TechnologyManifest = {
      technology: 'react',
      latest: '19',
      supported: ['18', '19'],
      eol: ['17'],
      topics: {
        hooks: { has_delta: ['18'], not_in: [] },
        'server-components': { has_delta: ['18'], not_in: [] },
        components: { has_delta: [], not_in: [] },
        patterns: { has_delta: [], not_in: [] },
      },
      breaking_changes: {
        '18→19': [
          'use() hook for promises and context',
          'React Compiler (experimental)',
          'Actions for form handling',
          'useOptimistic() hook',
          'useFormStatus() hook',
          'Document metadata support',
          'Asset loading improvements',
        ],
      },
    };

    expect(reactManifest.supported.length).toBe(2);
    expect(Object.keys(reactManifest.topics).length).toBe(4);
    expect(reactManifest.breaking_changes?.['18→19']?.length).toBe(7);
  });

  it('should validate Svelte manifest structure', () => {
    const svelteManifest: TechnologyManifest = {
      technology: 'svelte',
      latest: '5',
      supported: ['4', '5'],
      eol: ['3'],
      topics: {
        runes: { has_delta: ['4'], not_in: [] },
        reactivity: { has_delta: ['4'], not_in: [] },
        components: { has_delta: ['4'], not_in: [] },
        sveltekit: { has_delta: [], not_in: [] },
      },
      breaking_changes: {
        '4→5': [
          'Runes replace reactive declarations ($: syntax)',
          '$state() replaces let declarations for reactive state',
          '$derived() replaces $: for computed values',
          '$effect() replaces $: for side effects',
          '$props() replaces export let for props',
          'Snippets replace slots',
        ],
      },
    };

    expect(svelteManifest.topics.runes.has_delta).toContain('4');
    expect(svelteManifest.breaking_changes?.['4→5']?.length).toBe(6);
  });

  it('should validate Spring Boot manifest structure', () => {
    const springBootManifest: TechnologyManifest = {
      technology: 'spring-boot',
      latest: '3',
      supported: ['2', '3'],
      eol: ['1'],
      topics: {
        basics: { has_delta: ['2'], not_in: [] },
        security: { has_delta: ['2'], not_in: [] },
      },
      breaking_changes: {
        '2→3': [
          'Java 17 minimum requirement',
          'Jakarta EE 10 (javax.* -> jakarta.*)',
          'Native compilation with GraalVM',
          'Observability with Micrometer',
          'Spring Security 6 changes',
          'Hibernate 6',
        ],
      },
    };

    expect(springBootManifest.eol).toContain('1');
    expect(springBootManifest.breaking_changes?.['2→3']).toContain(
      'Jakarta EE 10 (javax.* -> jakarta.*)'
    );
  });
});
