/**
 * Fix remaining noUncheckedIndexedAccess errors
 * Handles multiple patterns intelligently
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get list of files with errors from tsc
function getFilesWithErrors() {
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe' });
    return [];
  } catch (error) {
    const output = error.stdout.toString();
    const files = new Set();
    const lines = output.split('\n');
    for (const line of lines) {
      const match = line.match(/^([^(]+)\(\d+,\d+\):/);
      if (match && match[1]) {
        files.add(match[1]);
      }
    }
    return Array.from(files);
  }
}

function fixFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`Skip ${filePath} - not found`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  const originalContent = content;

  // Pattern 1: Regex match results - match[n] -> match?.[n]
  // Match names ending with Match, match, or m
  content = content.replace(/(\w+[Mm]atch)\[(\d+)\](?!\?)/g, (match, name, index) => {
    // Skip if already has optional chaining
    return `${name}?.[${index}]`;
  });

  // Pattern 2: Split results - arr.split(...)[0] -> arr.split(...)[0] ?? ''
  // This is tricky - we need context

  // Pattern 3: Array access in object assignments
  // Change things like: { key: arr[0] } to { key: arr[0] ?? defaultValue }
  // Too complex for regex - skip for now

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✓ Fixed ${filePath}`);
    return true;
  } else {
    console.log(`  ${filePath} - no regex patterns`);
    return false;
  }
}

// Get files with errors and fix them
const files = getFilesWithErrors();
console.log(`Found ${files.length} files with errors\n`);

let fixedCount = 0;
for (const file of files) {
  if (fixFile(file)) {
    fixedCount++;
  }
}

console.log(`\n✓ Fixed ${fixedCount} files`);
console.log('\nRerun: npx tsc --noEmit');
