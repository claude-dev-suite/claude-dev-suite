#!/bin/bash

# Add imports to installation.service.ts
FILE="installation.service.ts"
if ! grep -q "timeOperation" "$FILE"; then
  sed -i "/import { fileURLToPath } from 'url';/a\
import { timeOperation, TIMING_THRESHOLDS, formatCount } from '../utils/performance.js';\
import { getLogger } from '../utils/logger.js';\
\
const logger = getLogger('InstallationService');" "$FILE"
  echo "✓ Added imports to $FILE"
fi

# Add imports to agents.service.ts
FILE="agents.service.ts"
if ! grep -q "timeOperation" "$FILE"; then
  sed -i "/import { parseYamlDescription } from '\.\.\/utils\/yaml-utils\.js';/a\
import { timeOperation, TIMING_THRESHOLDS, formatCount } from '../utils/performance.js';\
import { getLogger } from '../utils/logger.js';\
\
const logger = getLogger('AgentsService');" "$FILE"
  echo "✓ Added imports to $FILE"
fi

# Add imports to git.service.ts
FILE="git.service.ts"
if ! grep -q "timeOperation" "$FILE"; then
  sed -i "/import \* as path from 'path';/a\
import { timeOperation, TIMING_THRESHOLDS } from '../utils/performance.js';\
import { getLogger } from '../utils/logger.js';\
\
const logger = getLogger('GitService');" "$FILE"
  echo "✓ Added imports to $FILE"
fi

echo "All imports added successfully!"
