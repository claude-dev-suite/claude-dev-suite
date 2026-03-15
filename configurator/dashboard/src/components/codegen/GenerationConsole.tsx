// SPDX-License-Identifier: MIT
import { useEffect, useCallback, useState } from 'react';
import clsx from 'clsx';
import { useCodeGenStore } from '../../stores/codegen.store';
import { API_BASE } from '../../utils/api';

export function GenerationConsole({
  projectPath,
  onStartRefinement,
}: {
  projectPath: string;
  onStartRefinement?: (job: unknown) => void;
}) {
  const technology = useCodeGenStore((s) => s.technology);
  const uploadedFile = useCodeGenStore((s) => s.uploadedFile);
  const targetLanguage = useCodeGenStore((s) => s.targetLanguage);
  const outputDir = useCodeGenStore((s) => s.outputDir);
  const components = useCodeGenStore((s) => s.components);
  const generatedFiles = useCodeGenStore((s) => s.generatedFiles);
  const jobStatus = useCodeGenStore((s) => s.jobStatus);
  const consoleOutput = useCodeGenStore((s) => s.consoleOutput);

  const setGeneratedFiles = useCodeGenStore((s) => s.setGeneratedFiles);
  const setJobStatus = useCodeGenStore((s) => s.setJobStatus);
  const addConsoleOutput = useCodeGenStore((s) => s.addConsoleOutput);
  const clearConsoleOutput = useCodeGenStore((s) => s.clearConsoleOutput);
  const setError = useCodeGenStore((s) => s.setError);

  const [showFiles, setShowFiles] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const runGeneration = useCallback(async () => {
    if (!technology || !uploadedFile || !targetLanguage) return;

    setJobStatus('generating');
    clearConsoleOutput();
    addConsoleOutput(`[codegen] Starting ${technology} code generation...`);
    addConsoleOutput(`[codegen] Target: ${targetLanguage}`);
    addConsoleOutput(`[codegen] Output: ${outputDir}`);

    try {
      const res = await fetch(`${API_BASE}/api/codegen/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath,
          content: uploadedFile.content,
          fileName: uploadedFile.name,
          technology,
          targetLanguage,
          outputDir,
          components,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const files = data.data.files || [];
        setGeneratedFiles(files);
        addConsoleOutput(`[codegen] Generated ${files.length} files (${(data.data.totalSize / 1024).toFixed(1)} KB)`);
        files.forEach((f: { path: string }) => addConsoleOutput(`  + ${f.path}`));
        setJobStatus('completed');
        addConsoleOutput('[codegen] Done.');
      } else {
        const err = await res.json();
        setError(err.error || 'Generation failed');
        addConsoleOutput(`[error] ${err.error || 'Generation failed'}`);
        setJobStatus('failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setError(msg);
      addConsoleOutput(`[error] ${msg}`);
      setJobStatus('failed');
    }
  }, [
    technology, uploadedFile, targetLanguage, outputDir, components, projectPath,
    setGeneratedFiles, setJobStatus, addConsoleOutput, clearConsoleOutput, setError,
  ]);

  // Auto-start generation on mount
  useEffect(() => {
    if (jobStatus === 'idle') {
      void runGeneration();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAcceptAll = useCallback(async () => {
    addConsoleOutput('[codegen] Writing files to disk...');
    try {
      const res = await fetch(`${API_BASE}/api/codegen/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath,
          outputDir,
          files: generatedFiles.map((f) => ({ path: f.path, content: f.content, accepted: true })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        addConsoleOutput(`[codegen] Written ${data.data.written.length} files.`);
      }
    } catch (err) {
      addConsoleOutput(`[error] ${err instanceof Error ? err.message : 'Write failed'}`);
    }
  }, [projectPath, outputDir, generatedFiles, addConsoleOutput]);

  const handleRefine = useCallback(async () => {
    if (!technology || !targetLanguage) return;
    addConsoleOutput('[codegen] Building refinement job...');

    try {
      const res = await fetch(`${API_BASE}/api/codegen/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath,
          generatedFiles,
          technology,
          targetLanguage,
          refinementOptions: {
            enabled: true,
            naming: true,
            codeStyle: true,
            errorHandling: true,
            testStubs: false,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        addConsoleOutput(`[codegen] Refinement job created with ${data.data.subTasks.length} subtasks.`);
        addConsoleOutput('[codegen] Sending to orchestrator...');
        if (onStartRefinement) {
          onStartRefinement(data.data);
        }
      }
    } catch (err) {
      addConsoleOutput(`[error] ${err instanceof Error ? err.message : 'Refinement failed'}`);
    }
  }, [technology, targetLanguage, projectPath, generatedFiles, addConsoleOutput, onStartRefinement]);

  const selectedFileContent = generatedFiles.find((f) => f.path === selectedFile);

  return (
    <div className="space-y-4">
      {/* Console output */}
      <div className="bg-surface-900 rounded-lg border border-surface-700 p-4 h-48 overflow-y-auto font-mono text-xs">
        {consoleOutput.map((line, i) => (
          <div
            key={i}
            className={clsx(
              line.startsWith('[error]') ? 'text-red-400' : 'text-surface-300'
            )}
          >
            {line}
          </div>
        ))}
        {jobStatus === 'generating' && (
          <div className="text-primary-400 animate-pulse">Processing...</div>
        )}
      </div>

      {/* Actions */}
      {jobStatus === 'completed' && generatedFiles.length > 0 && (
        <>
          <div className="flex gap-3">
            <button
              onClick={handleAcceptAll}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              Accept All ({generatedFiles.length} files)
            </button>
            <button
              onClick={handleRefine}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors"
            >
              Refine with Claude
            </button>
            <button
              onClick={() => setShowFiles(!showFiles)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-surface-700 text-surface-300 hover:bg-surface-600 transition-colors"
            >
              {showFiles ? 'Hide' : 'Show'} Files
            </button>
          </div>

          {/* File browser */}
          {showFiles && (
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-1 bg-surface-800 rounded-lg border border-surface-700 p-3 max-h-80 overflow-y-auto">
                {generatedFiles.map((f) => (
                  <button
                    key={f.path}
                    onClick={() => setSelectedFile(f.path)}
                    className={clsx(
                      'block w-full text-left px-2 py-1 rounded text-xs font-mono truncate transition-colors',
                      selectedFile === f.path
                        ? 'bg-primary-500/20 text-primary-400'
                        : 'text-surface-400 hover:text-white hover:bg-surface-700'
                    )}
                  >
                    {f.path.split('/').pop()}
                  </button>
                ))}
              </div>
              <div className="col-span-3 bg-surface-900 rounded-lg border border-surface-700 p-4 max-h-80 overflow-auto">
                {selectedFileContent ? (
                  <pre className="text-xs text-surface-300 font-mono whitespace-pre-wrap">
                    {selectedFileContent.content}
                  </pre>
                ) : (
                  <p className="text-xs text-surface-500">Select a file to preview</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
