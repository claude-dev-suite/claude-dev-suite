#!/usr/bin/env python3
"""
Remove non-standard YAML fields from skills.

This script removes non-standard fields (mcp-topic, requires-mcp, version)
and keeps only valid Claude Code fields: name, description, allowed-tools, model
"""

import re
from pathlib import Path
from collections import defaultdict

# Valid Claude Code skill fields
VALID_FIELDS = {'name', 'description', 'allowed-tools', 'model'}

# Stats tracking
stats = {
    'processed': 0,
    'modified': 0,
    'fields_removed': defaultdict(int),
    'errors': []
}

def clean_skill(file_path):
    """Clean a single skill file by removing non-standard fields."""
    try:
        content = file_path.read_text(encoding='utf-8')
    except Exception as e:
        stats['errors'].append(f"{file_path}: Cannot read - {e}")
        return False

    if not content.startswith('---'):
        return False

    # Find end of frontmatter
    end_match = re.search(r'\n---[ \t]*\n', content[3:])
    if not end_match:
        return False

    end_idx = end_match.end() + 3
    yaml_section = content[4:end_match.start() + 3]  # Skip initial ---\n
    body = content[end_idx:]

    # Parse YAML line by line, keeping only valid fields
    lines = yaml_section.split('\n')
    new_lines = []
    current_field = None
    skip_field = False
    modified = False

    for line in lines:
        # Check if this is a new field (starts with word followed by :)
        field_match = re.match(r'^([a-zA-Z_-]+):', line)

        if field_match:
            field_name = field_match.group(1)
            current_field = field_name

            if field_name in VALID_FIELDS:
                skip_field = False
                new_lines.append(line)
            else:
                skip_field = True
                modified = True
                stats['fields_removed'][field_name] += 1
        elif skip_field:
            # Skip continuation lines of non-standard field
            if line.startswith('  ') or line.startswith('\t') or line.strip() == '':
                continue
            else:
                # This line doesn't look like a continuation, might be a new field
                skip_field = False
                new_lines.append(line)
        else:
            new_lines.append(line)

    if not modified:
        return False

    # Remove trailing empty lines from YAML
    while new_lines and new_lines[-1].strip() == '':
        new_lines.pop()

    # Rebuild content
    new_yaml = '\n'.join(new_lines)
    new_content = f'---\n{new_yaml}\n---\n{body.lstrip()}'

    try:
        file_path.write_text(new_content, encoding='utf-8')
        stats['modified'] += 1
        return True
    except Exception as e:
        stats['errors'].append(f"{file_path}: Cannot write - {e}")
        return False

def main():
    skills_dir = Path('skills')

    if not skills_dir.exists():
        print("Error: skills/ directory not found")
        return

    skill_files = list(skills_dir.rglob('SKILL.md'))
    print(f"Found {len(skill_files)} skill files\n")
    print("Processing...\n")

    modified_files = []

    for skill_file in sorted(skill_files):
        stats['processed'] += 1
        rel_path = skill_file.relative_to(skills_dir)

        if clean_skill(skill_file):
            modified_files.append(str(rel_path))

    # Print modified files
    if modified_files:
        print("Modified files:")
        for f in modified_files[:30]:
            print(f"  - {f}")
        if len(modified_files) > 30:
            print(f"  ... and {len(modified_files) - 30} more")

    # Print summary
    print("\n" + "=" * 60)
    print("CLEANUP SUMMARY")
    print("=" * 60)
    print(f"\nFiles processed: {stats['processed']}")
    print(f"Files modified: {stats['modified']}")

    if stats['fields_removed']:
        print("\nFields removed:")
        for field, count in sorted(stats['fields_removed'].items(), key=lambda x: -x[1]):
            print(f"  - {field}: {count} occurrences")

    if stats['errors']:
        print(f"\nErrors ({len(stats['errors'])}):")
        for error in stats['errors'][:10]:
            print(f"  - {error}")

    print("\n" + "=" * 60)
    print("CLEANUP COMPLETE")
    print("=" * 60)

if __name__ == '__main__':
    main()
