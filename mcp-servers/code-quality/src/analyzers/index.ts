// SPDX-License-Identifier: MIT
/**
 * Analyzer Registry
 * Maps file extensions to the appropriate language analyzer
 */

import type { Language, LanguageAnalyzer } from '../types.js';
import { LANGUAGE_EXTENSIONS, detectLanguage } from '../types.js';
import { JavaScriptAnalyzer } from './javascript.js';
import { PythonAnalyzer } from './python.js';
import { JavaAnalyzer } from './java.js';
import { GoAnalyzer } from './go.js';
import { RustAnalyzer } from './rust.js';

// Singleton instances
const analyzers: Map<Language, LanguageAnalyzer> = new Map();

/**
 * Get the analyzer for a specific language
 */
export function getAnalyzer(language: Language): LanguageAnalyzer | null {
  if (analyzers.has(language)) {
    return analyzers.get(language)!;
  }

  let analyzer: LanguageAnalyzer | null = null;

  switch (language) {
    case 'javascript':
    case 'typescript':
      analyzer = new JavaScriptAnalyzer();
      break;
    case 'python':
      analyzer = new PythonAnalyzer();
      break;
    case 'java':
      analyzer = new JavaAnalyzer();
      break;
    case 'go':
      analyzer = new GoAnalyzer();
      break;
    case 'rust':
      analyzer = new RustAnalyzer();
      break;
  }

  if (analyzer) {
    analyzers.set(language, analyzer);
  }

  return analyzer;
}

/**
 * Get the analyzer for a file based on its extension
 */
export function getAnalyzerForFile(filePath: string): LanguageAnalyzer | null {
  const language = detectLanguage(filePath);
  if (!language) return null;
  return getAnalyzer(language);
}

/**
 * Get all supported file extensions
 */
export function getSupportedExtensions(): string[] {
  return Object.values(LANGUAGE_EXTENSIONS).flat();
}

/**
 * Check if a file is supported
 */
export function isFileSupported(filePath: string): boolean {
  return detectLanguage(filePath) !== null;
}

export { JavaScriptAnalyzer, PythonAnalyzer, JavaAnalyzer, GoAnalyzer, RustAnalyzer };
