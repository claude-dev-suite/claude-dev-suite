// SPDX-License-Identifier: MIT
/**
 * Tools Index
 * Re-exports all tool functions
 */

export { analyzeComplexity, formatComplexityReport } from './complexity.js';
export { findDuplicates, formatDuplicationReport } from './duplicates.js';
export { checkStyle, formatStyleReport, formatCompactStyleReport } from './style.js';
export { detectAntiPatterns, formatAntiPatternReport } from './antipatterns.js';
export { findDeadCode, formatDeadCodeReport } from './deadcode.js';
export { analyzeDependencies, formatDependencyReport } from './dependencies.js';
export { calculateMetrics, formatMetricsReport, formatCompactMetrics } from './metrics.js';
