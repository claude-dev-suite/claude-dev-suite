/**
 * What detection actually recommends.
 *
 * These exist because the routing tables had gaps that nothing could see: a
 * technology could be detected, add to `confidence`, and then be dropped
 * because it had no entry — so `security-expert`, `sql-expert` and
 * `python-expert` shipped in the catalogue and detection could never suggest
 * any of them.
 *
 * The first test is the one that matters long-term: every agent id named in the
 * tables must exist on disk. A typo there fails silently, exactly like the
 * missing entries did.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { DetectionService } from '../src/services/detection.service.js';
import { STACK_TO_AGENTS } from '../src/services/detection/detection.constants.js';
import type { DetectionResult } from '../src/types.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Every `name:` declared by a markdown file under `agents/`. */
function catalogueAgentIds(): Set<string> {
  const ids = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.md')) {
        const name = fs.readFileSync(p, 'utf-8').match(/^name:\s*(.+)$/m)?.[1]?.trim();
        if (name) ids.add(name);
      }
    }
  };
  walk(path.join(REPO_ROOT, 'agents'));
  return ids;
}

const base = (over: Partial<DetectionResult> = {}): DetectionResult =>
  ({
    projectType: 'api',
    frontend: {},
    backend: {},
    database: {},
    testing: {},
    additionalTechnologies: [],
    isMonorepo: false,
    confidence: 0,
    ...over,
  }) as DetectionResult;

const recommend = (d: DetectionResult) => new DetectionService().getRecommendations(d).agents;

describe('STACK_TO_AGENTS integrity', () => {
  it('names only agents that exist in the catalogue', () => {
    const real = catalogueAgentIds();
    expect(real.size).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const [key, agents] of Object.entries(STACK_TO_AGENTS)) {
      for (const id of agents) if (!real.has(id)) missing.push(`${key} → ${id}`);
    }
    expect(missing).toEqual([]);
  });
});

describe('gaps that used to drop a detected technology', () => {
  it.each(['nextauth', 'passport', 'jwt', 'clerk', 'supabase'])(
    'routes the %s auth library to security-expert',
    tech => {
      expect(recommend(base({ additionalTechnologies: [tech] }))).toContain('security-expert');
    }
  );

  it.each(['postgresql', 'mysql', 'oracle', 'mssql'])(
    'routes a %s database to sql-expert',
    dbType => {
      expect(recommend(base({ database: { dbType } } as Partial<DetectionResult>))).toContain('sql-expert');
    }
  );

  it('routes a bare Python runtime to python-expert', () => {
    expect(recommend(base({ backend: { runtime: 'python' } } as Partial<DetectionResult>))).toContain(
      'python-expert'
    );
  });
});

describe('framework routing accuracy', () => {
  it('does not send a Django project to the FastAPI specialist', () => {
    const agents = recommend(base({ backend: { framework: 'django' } } as Partial<DetectionResult>));
    expect(agents).toContain('python-expert');
    expect(agents).not.toContain('fastapi-expert');
  });

  it('does not send a Flask project to the FastAPI specialist', () => {
    const agents = recommend(base({ backend: { framework: 'flask' } } as Partial<DetectionResult>));
    expect(agents).toContain('python-expert');
    expect(agents).not.toContain('fastapi-expert');
  });

  it('still sends a FastAPI project to fastapi-expert', () => {
    expect(recommend(base({ backend: { framework: 'fastapi' } } as Partial<DetectionResult>))).toContain(
      'fastapi-expert'
    );
  });
});

describe('unchanged behaviour', () => {
  it('always includes the two core agents', () => {
    expect(recommend(base())).toEqual(expect.arrayContaining(['architect', 'code-reviewer']));
  });

  it('still routes React and Node as before', () => {
    const agents = recommend(
      base({
        frontend: { framework: 'react' },
        backend: { runtime: 'nodejs' },
      } as Partial<DetectionResult>)
    );
    expect(agents).toEqual(expect.arrayContaining(['react-expert', 'nodejs-expert', 'typescript-expert']));
  });
});
