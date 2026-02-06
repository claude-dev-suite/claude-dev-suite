/**
 * Automated fixer for noUncheckedIndexedAccess errors
 * This script fixes common patterns like:
 * - match[1] -> match?.[1]
 * - array[0] where array might not have elements
 */

const fs = require('fs');
const path = require('path');

const filesToFix = [
  'src/routes/hooks.routes.ts',
  'src/routes/logging.routes.ts',
  'src/services/code-review.service.ts',
  'src/services/detection.service.ts',
  'src/services/git.service.ts',
  'src/services/hooks.service.ts',
  'src/services/installation.service.ts',
  'src/services/management.service.ts',
  'src/services/workflows.service.ts',
  'src/services/orchestrator/chat-session.service.ts',
  'src/services/orchestrator/job-queue.service.ts',
  'src/services/orchestrator/types.ts',
  'src/websocket.ts',
];

function fixFile(filePath) {
  const fullPath = path.join(__dirname, filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`Skipping ${filePath} - not found`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf-8');
  let modified = false;

  // Pattern 1: match[1] -> match?.[1] (for regex results)
  // But be careful not to change array literals or already fixed code
  const regexPatterns = [
    // match[1] but not match?.[1]
    { from: /(\w+Match)\[(\d+)\]/g, to: (match, name, index) => `${name}?.[${index}]` },
    // xy[0] and xy[1] for git status parsing
    { from: /(\bxy)\[([01])\](?!\?)/g, to: (match, name, index) => `${name}?.[${index}]` },
  ];

  for (const { from, to } of regexPatterns) {
    const newContent = content.replace(from, to);
    if (newContent !== content) {
      modified = true;
      content = newContent;
    }
  }

  if (modified) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`Fixed ${filePath}`);
  } else {
    console.log(`No changes needed for ${filePath}`);
  }
}

// Fix all files
for (const file of filesToFix) {
  fixFile(file);
}

console.log('\nDone! Recompile with: npx tsc --noEmit');
