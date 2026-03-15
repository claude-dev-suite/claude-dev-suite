#!/bin/bash

echo "Adding example timing implementations..."

# Example 1: detection.service.ts - detectEnvironments method
FILE="detection.service.ts"
if grep -q "async detectEnvironments" "$FILE"; then
  # Find the line number
  LINE=$(grep -n "async detectEnvironments" "$FILE" | head -1 | cut -d: -f1)
  # Insert timing after the method signature's opening brace
  sed -i "${LINE}a\    const endTimer = timeOperation(logger, 'detectEnvironments', TIMING_THRESHOLDS.DETECTION_ENV, { data: { projectPath } });" "$FILE"
  
  # Find return statement and add endTimer before it
  sed -i '/async detectEnvironments/,/^  }$/{
    /return Object.values(environments);/{
      i\    endTimer();
    }
  }' "$FILE"
  echo "✓ Added timing to detectEnvironments in $FILE"
fi

# Example 2: agents.service.ts - getAgents method (after cache check)
FILE="agents.service.ts"
if grep -q "async getAgents" "$FILE"; then
  # Add timing after cache check
  sed -i '/if (!forceRefresh && this.isCacheValid(this.agentsCache))/a\    const endTimer = timeOperation(logger, '"'"'getAgents'"'"', TIMING_THRESHOLDS.LOAD_AGENTS, { data: { forceRefresh, fromCache: true } });\n    endTimer();\n    return this.agentsCache.data!;\n  }\n\n  const endTimer = timeOperation(logger, '"'"'getAgents'"'"', TIMING_THRESHOLDS.LOAD_AGENTS, { data: { forceRefresh, fromCache: false } });' "$FILE"
  
  # Remove the old return after cache check
  sed -i '/if (!forceRefresh && this.isCacheValid(this.agentsCache))/,/return this.agentsCache.data!;/{
    /return this.agentsCache.data!;/d
  }' "$FILE"
  
  # Add endTimer before final return
  sed -i '/this.agentsCache.data = agents;/a\    endTimer();' "$FILE"
  echo "✓ Added timing to getAgents in $FILE (with cache handling)"
fi

echo "Example timing implementations added!"
echo "Review the changes and apply similar patterns to other methods."
