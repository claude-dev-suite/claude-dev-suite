// SPDX-License-Identifier: MIT
/**
 * Keep an installed SKILL.md's `name:` in step with its directory.
 *
 * Installation flattens `frontend-frameworks/react` to a single directory named
 * `frontend-frameworks-react`, because Claude Code resolves skills by a
 * single-segment name. The file was copied byte-for-byte, so `name: react` ended
 * up inside `frontend-frameworks-react/` — and the Agent Skills spec makes the
 * name matching the parent directory a MUST (reference doc section 1.2). Every
 * installed skill was in violation, in `.claude/skills` and in the
 * `.agents/skills` mirror that Codex, Gemini and Kimi read.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('SkillFrontmatter');

/**
 * Rewrite the `name:` value in `<skillDir>/SKILL.md` to `flatName`.
 *
 * Only the scalar on the `name:` line changes; everything else, including a
 * multi-line description and the body, is untouched. A file with no frontmatter
 * or no `name:` key is left alone — inventing one could contradict the body.
 */
export function renameSkillFrontmatter(skillDir: string, flatName: string): boolean {
  const file = path.join(skillDir, 'SKILL.md');
  let content: string;
  try {
    content = fs.readFileSync(file, 'utf-8');
  } catch {
    return false;
  }

  const match = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!match) {
    logger.warn('Installed skill has no YAML frontmatter — name not aligned', {
      context: { file, flatName },
    });
    return false;
  }

  const body = match[2] ?? '';
  if (!/^name\s*:/m.test(body)) {
    logger.warn('Installed skill frontmatter has no name: key — not aligned', {
      context: { file, flatName },
    });
    return false;
  }

  const rewritten = body.replace(/^name\s*:.*$/m, `name: ${flatName}`);
  if (rewritten === body) return false;

  try {
    fs.writeFileSync(file, match[1] + rewritten + match[3] + content.slice(match[0].length), 'utf-8');
    return true;
  } catch (error: unknown) {
    logger.warn('Could not rewrite installed skill name', { error, context: { file } });
    return false;
  }
}
