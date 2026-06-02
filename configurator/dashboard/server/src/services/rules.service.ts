// SPDX-License-Identifier: MIT
/**
 * Rules Service
 *
 * Lists available project rule templates from the rules/ directory in the dev-suite root.
 * Rules are markdown files with YAML frontmatter; selected rules are copied to
 * [projectPath]/.claude/rules/ during installation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDevSuiteDir } from '../utils/dev-suite-dir.js';

export interface RuleMetadata {
  id: string;
  name: string;
  description: string;
  category: 'git' | 'docs';
  recommended: boolean;
}

/** Parse YAML frontmatter from a markdown file (simple key: value, no arrays needed). */
function parseFrontmatter(content: string): Record<string, string | boolean> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result: Record<string, string | boolean> = {};
  for (const line of (match[1] ?? '').split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const raw = line.slice(colon + 1).trim();
    if (raw === 'true') result[key] = true;
    else if (raw === 'false') result[key] = false;
    else result[key] = raw;
  }
  return result;
}

export class RulesService {
  /**
   * Return all available rule templates, ordered: git first, then docs.
   */
  async getRules(): Promise<RuleMetadata[]> {
    const rulesDir = path.join(getDevSuiteDir(), 'rules');
    const rules: RuleMetadata[] = [];

    for (const category of ['git', 'docs'] as const) {
      const catDir = path.join(rulesDir, category);
      let files: string[];
      try {
        files = fs.readdirSync(catDir).filter(f => f.endsWith('.md')).sort();
      } catch {
        continue;
      }

      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(catDir, file), 'utf-8');
          const fm = parseFrontmatter(content);
          rules.push({
            id: (fm.id as string) || file.replace('.md', ''),
            name: (fm.name as string) || (fm.id as string) || file,
            description: (fm.description as string) || '',
            category,
            recommended: fm.recommended === true,
          });
        } catch {
          // skip unreadable files
        }
      }
    }

    return rules;
  }

  /**
   * Resolve the absolute path of a rule file by ID.
   * Returns null if not found.
   */
  findRuleFile(ruleId: string): string | null {
    const rulesDir = path.join(getDevSuiteDir(), 'rules');
    for (const category of ['git', 'docs']) {
      const candidate = path.join(rulesDir, category, `${ruleId}.md`);
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }
}
