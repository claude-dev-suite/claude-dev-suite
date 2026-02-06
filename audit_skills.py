#!/usr/bin/env python3
"""Comprehensive skill audit against Claude Code specification."""

import os
import re
from pathlib import Path
from collections import defaultdict

VALID_FIELDS = {'name', 'description', 'allowed-tools', 'model'}
MAX_NAME_LENGTH = 64
MAX_DESC_LENGTH = 1024
MAX_LINES = 500

results = {
    'total': 0,
    'errors': defaultdict(list),
    'warnings': defaultdict(list),
    'by_severity': {'critical': [], 'high': [], 'medium': [], 'low': []},
    'field_stats': defaultdict(int),
    'line_counts': [],
}

def parse_yaml_frontmatter(content):
    """Extract YAML frontmatter from markdown."""
    if not content.startswith('---'):
        return None, "YAML must start at line 1"

    parts = content.split('---', 2)
    if len(parts) < 3:
        return None, "Invalid YAML frontmatter structure"

    yaml_content = parts[1].strip()
    fields = {}
    current_field = None
    current_value = []

    for line in yaml_content.split('\n'):
        if re.match(r'^[a-zA-Z_-]+:', line):
            if current_field:
                fields[current_field] = '\n'.join(current_value).strip()
            match = re.match(r'^([a-zA-Z_-]+):\s*(.*)', line)
            current_field = match.group(1)
            value = match.group(2).strip()
            if value == '|':
                current_value = []
            else:
                current_value = [value]
        elif current_field:
            current_value.append(line.strip())

    if current_field:
        fields[current_field] = '\n'.join(current_value).strip()

    return fields, None

def validate_skill(path):
    """Validate a single skill file."""
    errors = []
    warnings = []

    try:
        content = path.read_text(encoding='utf-8')
    except Exception as e:
        return [f"Cannot read file: {e}"], []

    # Parse YAML
    fields, parse_error = parse_yaml_frontmatter(content)
    if parse_error:
        errors.append(parse_error)
        return errors, warnings

    # Track field usage
    for field in fields:
        results['field_stats'][field] += 1

    # Check required fields
    if 'name' not in fields:
        errors.append("Missing required field: name")
    if 'description' not in fields:
        errors.append("Missing required field: description")

    # Check for non-standard fields
    non_standard = [f for f in fields if f not in VALID_FIELDS]
    for field in non_standard:
        errors.append(f"Non-standard field: {field}")

    # Validate name
    if 'name' in fields:
        name = fields['name']
        if len(name) > MAX_NAME_LENGTH:
            errors.append(f"name exceeds {MAX_NAME_LENGTH} chars ({len(name)})")
        if not re.match(r'^[a-z0-9-]+$', name):
            errors.append(f"name must be lowercase-with-hyphens: '{name}'")

        # Check directory match
        dir_name = path.parent.name
        if name != dir_name:
            warnings.append(f"name '{name}' does not match directory '{dir_name}'")

    # Validate description
    if 'description' in fields:
        desc = fields['description']
        if len(desc) > MAX_DESC_LENGTH:
            warnings.append(f"description exceeds {MAX_DESC_LENGTH} chars ({len(desc)})")
        if 'USE WHEN' not in desc.upper():
            warnings.append("description missing 'USE WHEN' trigger keywords")

    # Check line count
    parts = content.split('---', 2)
    body = parts[2] if len(parts) > 2 else ""
    line_count = len(body.strip().split('\n'))
    results['line_counts'].append((str(path), line_count))

    if line_count > MAX_LINES:
        errors.append(f"Body has {line_count} lines (max {MAX_LINES})")
    elif line_count > 300:
        warnings.append(f"Body has {line_count} lines (consider splitting)")

    return errors, warnings

# Main audit
skills_dir = Path('skills')
all_skills = list(skills_dir.rglob('SKILL.md'))
results['total'] = len(all_skills)

for skill_file in sorted(all_skills):
    rel_path = skill_file.relative_to(skills_dir)
    errors, warnings = validate_skill(skill_file)

    if errors:
        results['errors'][str(rel_path)] = errors

    if warnings:
        results['warnings'][str(rel_path)] = warnings

# Output Report
print("=" * 80)
print("SKILL AUDIT REPORT - Dev-Suite")
print("=" * 80)
print(f"\nTotal skills analyzed: {results['total']}")
print(f"Skills with errors: {len(results['errors'])}")
print(f"Skills with warnings: {len(results['warnings'])}")

print("\n" + "=" * 80)
print("FIELD USAGE STATISTICS")
print("=" * 80)
for field, count in sorted(results['field_stats'].items(), key=lambda x: -x[1]):
    status = "VALID" if field in VALID_FIELDS else "NON-STANDARD"
    marker = "[OK]" if field in VALID_FIELDS else "[!!]"
    print(f"  {marker} {field}: {count} files - {status}")

print("\n" + "=" * 80)
print("FILES EXCEEDING 500 LINES")
print("=" * 80)
over_limit = [(p, c) for p, c in results['line_counts'] if c > 500]
print(f"Total files over limit: {len(over_limit)}\n")
for path, count in sorted(over_limit, key=lambda x: -x[1]):
    rel = path.replace('skills\\', '').replace('skills/', '').replace('\\SKILL.md', '').replace('/SKILL.md', '')
    severity = "CRITICAL" if count > 1000 else "HIGH" if count > 750 else "MEDIUM"
    print(f"  [{severity:8}] {count:4d} lines: {rel}")

print("\n" + "=" * 80)
print("FILES 300-500 LINES (Consider Splitting)")
print("=" * 80)
mid_range = [(p, c) for p, c in results['line_counts'] if 300 < c <= 500]
print(f"Total files in range: {len(mid_range)}\n")
for path, count in sorted(mid_range, key=lambda x: -x[1])[:15]:
    rel = path.replace('skills\\', '').replace('skills/', '').replace('\\SKILL.md', '').replace('/SKILL.md', '')
    print(f"  {count:4d} lines: {rel}")
if len(mid_range) > 15:
    print(f"  ... and {len(mid_range) - 15} more files")

print("\n" + "=" * 80)
print("NON-STANDARD FIELDS DETAIL")
print("=" * 80)
non_std_fields = {f: c for f, c in results['field_stats'].items() if f not in VALID_FIELDS}
for field, count in sorted(non_std_fields.items(), key=lambda x: -x[1]):
    print(f"\n  {field}: {count} files")

print("\n" + "=" * 80)
print("SKILLS MISSING 'USE WHEN' IN DESCRIPTION")
print("=" * 80)
missing_use_when = [p for p, w in results['warnings'].items() if any('USE WHEN' in x for x in w)]
print(f"Total: {len(missing_use_when)}")
for path in sorted(missing_use_when)[:20]:
    print(f"  - {path}")
if len(missing_use_when) > 20:
    print(f"  ... and {len(missing_use_when) - 20} more")

print("\n" + "=" * 80)
print("SUMMARY BY CATEGORY")
print("=" * 80)

# Categorize by directory
categories = defaultdict(lambda: {'total': 0, 'errors': 0, 'warnings': 0, 'oversized': 0})
for skill_file in all_skills:
    parts = skill_file.relative_to(skills_dir).parts
    category = parts[0] if len(parts) > 1 else 'root'
    categories[category]['total'] += 1

    rel_path = str(skill_file.relative_to(skills_dir))
    if rel_path in results['errors']:
        categories[category]['errors'] += 1
    if rel_path in results['warnings']:
        categories[category]['warnings'] += 1

for p, c in results['line_counts']:
    if c > 500:
        parts = Path(p).relative_to(skills_dir).parts if 'skills' in p else Path(p).parts
        category = parts[0] if len(parts) > 1 else 'root'
        categories[category]['oversized'] += 1

print(f"\n{'Category':<25} {'Total':>6} {'Errors':>8} {'Warnings':>10} {'Oversized':>10}")
print("-" * 65)
for cat, stats in sorted(categories.items()):
    print(f"{cat:<25} {stats['total']:>6} {stats['errors']:>8} {stats['warnings']:>10} {stats['oversized']:>10}")

totals = {'total': 0, 'errors': 0, 'warnings': 0, 'oversized': 0}
for stats in categories.values():
    for k in totals:
        totals[k] += stats[k]
print("-" * 65)
print(f"{'TOTAL':<25} {totals['total']:>6} {totals['errors']:>8} {totals['warnings']:>10} {totals['oversized']:>10}")

print("\n" + "=" * 80)
print("ACTION ITEMS SUMMARY")
print("=" * 80)
print(f"""
PRIORITY 1 - CRITICAL (Remove non-standard YAML fields):
  - mcp-topic: {results['field_stats'].get('mcp-topic', 0)} files to fix
  - requires-mcp: {results['field_stats'].get('requires-mcp', 0)} files to fix

PRIORITY 2 - HIGH (Split oversized files >500 lines):
  - Files to split: {len(over_limit)}
  - Critical (>1000 lines): {len([x for x in over_limit if x[1] > 1000])}
  - High (750-1000 lines): {len([x for x in over_limit if 750 < x[1] <= 1000])}
  - Medium (500-750 lines): {len([x for x in over_limit if 500 < x[1] <= 750])}

PRIORITY 3 - MEDIUM (Add USE WHEN to descriptions):
  - Files missing keywords: {len(missing_use_when)}

PRIORITY 4 - LOW (Consider splitting 300-500 lines):
  - Files to review: {len(mid_range)}
""")

print("=" * 80)
print("END OF AUDIT REPORT")
print("=" * 80)
