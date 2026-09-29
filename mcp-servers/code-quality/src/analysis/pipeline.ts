// SPDX-License-Identifier: MIT
/**
 * Scope → load → parse, shared by every structural tool.
 */

import { loadFiles, reportableFiles, resolveScope, scopeNotes, type FileScope, type LoadedFile, type ScopeOptions } from '../core/files.js';
import { parse } from '../parsing/parser.js';
import { analyzeTree, type AnalyzeOptions, type FileAnalysis } from '../parsing/analyze.js';
import { extractModule, type ModuleInfo } from '../parsing/modules.js';

export interface ParsedFile {
  file: LoadedFile;
  analysis: FileAnalysis;
  module?: ModuleInfo;
}

export interface ParseRun {
  scope: FileScope;
  parsed: ParsedFile[];
  failed: Array<{ file: string; error: string }>;
  notes: string[];
}

export interface ParseOptions extends AnalyzeOptions {
  modules?: boolean;
}

export async function parseLoaded(files: LoadedFile[], opts: ParseOptions): Promise<{ parsed: ParsedFile[]; failed: ParseRun['failed'] }> {
  const parsed: ParsedFile[] = [];
  const failed: ParseRun['failed'] = [];
  for (const file of files) {
    let tree;
    try {
      tree = await parse(file.lang, file.content);
      const analysis = analyzeTree(tree, file.lang, file.content, opts);
      const module = opts.modules ? extractModule(tree, file.lang) : undefined;
      parsed.push({ file, analysis, module });
    } catch (err) {
      const msg = err instanceof RangeError ? 'syntax tree too deep to walk' : err instanceof Error ? err.message : String(err);
      failed.push({ file: file.rel, error: msg });
    } finally {
      tree?.delete();
    }
  }
  return { parsed, failed };
}

/** Resolve the scope, read and parse. `onlyChanged` drops unchanged files before parsing. */
export async function runParse(scopeOpts: ScopeOptions, opts: ParseOptions & { onlyChanged?: boolean }): Promise<ParseRun> {
  const scope = await resolveScope(scopeOpts);
  const wanted = opts.onlyChanged ? reportableFiles(scope) : scope.files;
  const { loaded, unreadable, generated } = await loadFiles(wanted);
  const { parsed, failed } = await parseLoaded(loaded, opts);
  const notes = scopeNotes(scope, { unreadable, generated });
  if (failed.length) notes.push(`${failed.length} file(s) could not be analysed: ${failed.slice(0, 3).map((f) => `${f.file} (${f.error})`).join('; ')}`);
  const withErrors = parsed.filter((p) => p.analysis.parseErrors > 0);
  if (withErrors.length) {
    notes.push(
      `${withErrors.length} file(s) contain syntax the grammar could not parse; their results may be partial: ` +
        withErrors.slice(0, 3).map((p) => `${p.file.rel}:${p.analysis.firstErrorLine}`).join(', ')
    );
  }
  return { scope, parsed, failed, notes };
}
