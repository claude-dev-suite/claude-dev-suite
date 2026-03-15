// SPDX-License-Identifier: MIT
/**
 * YAML parsing utilities for agent frontmatter
 */

export interface AgentFrontmatter {
  name: string;
  description: string;
  skills?: string[];
  mcpServers?: string[];
  allowedTools?: string[];
}

/**
 * Parse YAML frontmatter from markdown content
 */
export function parseFrontmatter(content: string): Record<string, unknown> | null {
  if (!content || !content.startsWith('---')) return null;

  const endIdx = content.indexOf('---', 3);
  if (endIdx < 0) return null;

  const frontmatter = content.substring(3, endIdx);
  return parseSimpleYaml(frontmatter);
}

/**
 * Parse simple YAML (key: value pairs and lists)
 */
export function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');

  let currentKey: string | null = null;
  let inMultiline = false;
  let multilineValue = '';
  let inList = false;
  let listItems: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const trimmed = line.trim();

    // Skip empty lines in non-multiline context
    if (trimmed === '' && !inMultiline) {
      if (inList && currentKey) {
        result[currentKey] = listItems;
        listItems = [];
        inList = false;
        currentKey = null;
      }
      continue;
    }

    // Handle multiline string continuation
    if (inMultiline) {
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch?.[1]?.length ?? 0;
      if (indent > 0 || trimmed === '') {
        multilineValue += (multilineValue ? ' ' : '') + trimmed;
        continue;
      } else {
        if (currentKey) result[currentKey] = multilineValue.trim();
        inMultiline = false;
        multilineValue = '';
        currentKey = null;
      }
    }

    // Handle list item
    if (inList) {
      const listMatch = line.match(/^\s+-\s+(.+)$/);
      if (listMatch?.[1]) {
        listItems.push(listMatch[1].trim());
        continue;
      } else if (!line.match(/^\s/) && trimmed !== '') {
        // New key - end list
        if (currentKey) result[currentKey] = listItems;
        listItems = [];
        inList = false;
        currentKey = null;
      }
    }

    // Parse key: value pair
    const keyMatch = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (keyMatch?.[1] && keyMatch[2] !== undefined) {
      const key = keyMatch[1];
      const value = keyMatch[2].trim();

      // Check for multiline string
      if (value === '|' || value === '>') {
        currentKey = key;
        inMultiline = true;
        multilineValue = '';
        continue;
      }

      // Check for array start
      if (value === '') {
        currentKey = key;
        inList = true;
        listItems = [];
        continue;
      }

      // Regular string value (remove quotes if present)
      result[key] = value.replace(/^["']|["']$/g, '');
      currentKey = null;
    }
  }

  // Handle any remaining multiline/list
  if (inMultiline && currentKey) {
    result[currentKey] = multilineValue.trim();
  }
  if (inList && currentKey) {
    result[currentKey] = listItems;
  }

  return result;
}

/**
 * Parse description from YAML frontmatter (handles multiline)
 */
export function parseYamlDescription(frontmatter: string): string {
  const lines = frontmatter.split('\n');
  let description = '';
  let inDescription = false;
  let descIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    if (line.match(/^description:\s*\|/) || line.match(/^description:\s*>/)) {
      inDescription = true;
      continue;
    } else if (line.match(/^description:\s*["']?[^|>]/)) {
      return line.replace(/^description:\s*["']?/, '').replace(/["']?\s*$/, '').trim();
    }

    if (inDescription) {
      const indentMatch = line.match(/^(\s*)/);
      const currentIndent = indentMatch?.[1]?.length ?? 0;
      if (line.trim() === '') {
        description += ' ';
      } else if (currentIndent > 0 || descIndent === 0) {
        if (descIndent === 0 && currentIndent > 0) descIndent = currentIndent;
        if (currentIndent >= descIndent || descIndent === 0) {
          description += line.trim() + ' ';
        } else {
          break;
        }
      } else {
        break;
      }
    }
  }

  return description.trim();
}
