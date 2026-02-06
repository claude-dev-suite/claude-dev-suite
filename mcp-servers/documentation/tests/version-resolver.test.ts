import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VersionResolver } from '../src/version-resolver.js';
import type { TechnologyManifest } from '../src/types/versioning.js';

// Mock KBFetcher
const mockFetcher = {
  getFile: vi.fn(),
  fetchTechnology: vi.fn(),
  listFiles: vi.fn(),
};

// Mock KBCache
const mockCache = {
  getCachePath: vi.fn((tech: string, file: string) => `/mock/cache/${tech}/${file}`),
  isCached: vi.fn(),
  getFromCache: vi.fn(),
  saveToCache: vi.fn(),
  clearCache: vi.fn(),
  getCacheStats: vi.fn(),
  listCachedTechnologies: vi.fn(),
  searchInCache: vi.fn(),
};

// Mock fs
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    rm: vi.fn(),
  },
}));

import fs from 'fs/promises';

describe('VersionResolver', () => {
  let resolver: VersionResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = new VersionResolver(mockFetcher as any, mockCache as any);
  });

  describe('getManifest', () => {
    it('should return null when manifest does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const manifest = await resolver.getManifest('unknown-tech');

      expect(manifest).toBeNull();
    });

    it('should parse and return manifest when it exists', async () => {
      const mockManifest: TechnologyManifest = {
        technology: 'react',
        latest: '19',
        supported: ['18', '19'],
        eol: ['17'],
        topics: {
          hooks: { has_delta: ['18'], not_in: [] },
        },
        breaking_changes: {
          '18→19': ['use() hook', 'useOptimistic()'],
        },
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockManifest));

      const manifest = await resolver.getManifest('react');

      expect(manifest).toEqual(mockManifest);
      expect(manifest?.latest).toBe('19');
      expect(manifest?.supported).toContain('18');
    });

    it('should cache manifest after first load', async () => {
      const mockManifest: TechnologyManifest = {
        technology: 'vue',
        latest: '3',
        supported: ['2', '3'],
        topics: {},
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockManifest));

      // First call
      await resolver.getManifest('vue');
      // Second call
      await resolver.getManifest('vue');

      // Should only read file once
      expect(fs.readFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('listVersions', () => {
    it('should return default values when no manifest exists', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const versions = await resolver.listVersions('unknown-tech');

      expect(versions).toEqual({
        latest: 'latest',
        supported: ['latest'],
        eol: [],
      });
    });

    it('should return versions from manifest', async () => {
      const mockManifest: TechnologyManifest = {
        technology: 'spring-boot',
        latest: '3',
        supported: ['2', '3'],
        eol: ['1'],
        topics: {},
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockManifest));

      const versions = await resolver.listVersions('spring-boot');

      expect(versions.latest).toBe('3');
      expect(versions.supported).toEqual(['2', '3']);
      expect(versions.eol).toEqual(['1']);
    });
  });

  describe('fetchVersioned', () => {
    it('should return base content for latest version', async () => {
      const mockManifest: TechnologyManifest = {
        technology: 'react',
        latest: '19',
        supported: ['18', '19'],
        topics: {
          hooks: { has_delta: ['18'], not_in: [] },
        },
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockManifest));
      mockFetcher.getFile.mockResolvedValue('# React Hooks\n\nLatest content...');

      const result = await resolver.fetchVersioned({
        technology: 'react',
        topic: 'hooks',
      });

      expect(result.is_latest).toBe(true);
      expect(result.version).toBe('19');
      expect(result.delta_applied).toBe(false);
      expect(result.content).toContain('React Hooks');
    });

    it('should apply delta for older version', async () => {
      const mockManifest: TechnologyManifest = {
        technology: 'react',
        latest: '19',
        supported: ['18', '19'],
        topics: {
          hooks: { has_delta: ['18'], not_in: [] },
        },
      };

      const baseContent = '# React 19 Hooks\n\n## use() Hook\n\nThe use() hook...';
      const deltaContent = `# React 18 → Hooks Delta

## Not Available in React 18

- \`use()\` - Promise/context reading (React 19+)
- \`useOptimistic()\` - Optimistic updates (React 19+)

## Syntax Differences

### Reading Promises

In React 18, use Suspense + external library...

## Still Current in React 18

- useState
- useEffect
`;

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockManifest));
      mockFetcher.getFile
        .mockResolvedValueOnce(baseContent) // Base content
        .mockResolvedValueOnce(deltaContent); // Delta content

      const result = await resolver.fetchVersioned({
        technology: 'react',
        topic: 'hooks',
        version: '18',
      });

      expect(result.is_latest).toBe(false);
      expect(result.version).toBe('18');
      expect(result.delta_applied).toBe(true);
      expect(result.upgrade_available).toBe('19');
      expect(result.content).toContain('version 18');
    });

    it('should return not available message for topics not in version', async () => {
      const mockManifest: TechnologyManifest = {
        technology: 'svelte',
        latest: '5',
        supported: ['4', '5'],
        topics: {
          runes: { has_delta: [], not_in: ['4'] },
        },
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockManifest));

      const result = await resolver.fetchVersioned({
        technology: 'svelte',
        topic: 'runes',
        version: '4',
      });

      expect(result.is_latest).toBe(false);
      expect(result.content).toContain('Not Available');
      expect(result.content).toContain('not available in svelte 4');
    });
  });

  describe('parseDeltaSections', () => {
    it('should parse not available features', () => {
      const deltaContent = `# React 18 → Hooks Delta

## Not Available in React 18

- \`use()\` - Promise reading
- \`useOptimistic()\` - Optimistic updates
- \`useFormStatus()\` - Form status

## Other Section
`;
      // Access private method via type assertion
      const sections = (resolver as any).parseDeltaSections(deltaContent);

      // Parser extracts features including description
      expect(sections.notAvailable.length).toBe(3);
      expect(sections.notAvailable.some((f: string) => f.includes('use()'))).toBe(true);
      expect(sections.notAvailable.some((f: string) => f.includes('useOptimistic()'))).toBe(true);
    });

    it('should parse still current features', () => {
      const deltaContent = `# Vue 2 → Composition API Delta

## Still Current in Vue 2

- Options API (data, computed, methods)
- Template syntax
- Vuex for state management
`;

      const sections = (resolver as any).parseDeltaSections(deltaContent);

      expect(sections.deprecatedInNewer.length).toBe(3);
      expect(sections.deprecatedInNewer).toContain('Options API (data, computed, methods)');
    });

    it('should parse syntax differences', () => {
      const deltaContent = `# TypeScript 4 → Types Delta

## Not Available in TypeScript 4

- satisfies operator

## Syntax Differences

### satisfies Operator

TypeScript 5 introduced the satisfies operator...

\`\`\`typescript
const palette = {} satisfies Record<string, string>;
\`\`\`

## Still Current
`;

      const sections = (resolver as any).parseDeltaSections(deltaContent);

      expect(sections.differences).toContain('satisfies Operator');
      expect(sections.differences).toContain('TypeScript 5 introduced');
    });
  });

  describe('clearCache', () => {
    it('should clear manifest cache', async () => {
      const mockManifest: TechnologyManifest = {
        technology: 'test',
        latest: '1',
        supported: ['1'],
        topics: {},
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockManifest));

      // Load manifest
      await resolver.getManifest('test');

      // Clear cache
      resolver.clearCache();

      // Should read file again after clear
      await resolver.getManifest('test');

      expect(fs.readFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('escapeRegex', () => {
    it('should escape special regex characters', () => {
      const input = 'use() - Promise/context (React 19+)';
      const escaped = (resolver as any).escapeRegex(input);

      expect(escaped).toBe('use\\(\\) - Promise/context \\(React 19\\+\\)');
    });
  });
});

describe('TechnologyManifest', () => {
  it('should have correct structure', () => {
    const manifest: TechnologyManifest = {
      technology: 'nextjs',
      latest: '15',
      supported: ['13', '14', '15'],
      eol: ['12'],
      topics: {
        'app-router': {
          has_delta: ['13'],
          not_in: [],
        },
        caching: {
          has_delta: ['13', '14'],
          not_in: [],
        },
      },
      breaking_changes: {
        '14→15': [
          'Async Request APIs',
          'Caching no longer default',
        ],
      },
    };

    expect(manifest.technology).toBe('nextjs');
    expect(manifest.supported).toHaveLength(3);
    expect(manifest.topics['app-router'].has_delta).toContain('13');
    expect(manifest.breaking_changes?.['14→15']).toContain('Async Request APIs');
  });
});
