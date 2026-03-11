// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { useCodeGenStore } from '../../stores/codegen.store';
import { API_BASE } from '../../utils/api';

interface PreviewFile {
  path: string;
  language: string;
  estimatedSize: number;
}

interface PreviewData {
  files: PreviewFile[];
  totalFiles: number;
  components: string[];
}

export function GenerationPreview({ projectPath }: { projectPath: string }) {
  const technology = useCodeGenStore((s) => s.technology);
  const uploadedFile = useCodeGenStore((s) => s.uploadedFile);
  const targetLanguage = useCodeGenStore((s) => s.targetLanguage);
  const components = useCodeGenStore((s) => s.components);
  const setStep = useCodeGenStore((s) => s.setStep);

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);

  // Refinement options
  const [refineNaming, setRefineNaming] = useState(true);
  const [refineStyle, setRefineStyle] = useState(true);
  const [refineErrors, setRefineErrors] = useState(true);
  const [refineTests, setRefineTests] = useState(false);

  useEffect(() => {
    const fetchPreview = async () => {
      if (!technology || !uploadedFile || !targetLanguage) return;
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/codegen/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectPath,
            content: uploadedFile.content,
            fileName: uploadedFile.name,
            technology,
            targetLanguage,
            components,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setPreview(data.data);
        }
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    };
    void fetchPreview();
  }, [technology, uploadedFile, targetLanguage, components, projectPath]);

  if (loading) {
    return <div className="text-surface-400 text-sm">Loading preview...</div>;
  }

  return (
    <div className="space-y-6">
      {/* File tree */}
      {preview && (
        <div>
          <h3 className="text-sm font-medium text-surface-300 mb-3">
            Files to generate ({preview.totalFiles})
          </h3>
          <div className="bg-surface-800 rounded-lg border border-surface-700 p-4 max-h-64 overflow-y-auto">
            <div className="space-y-1 font-mono text-xs">
              {preview.files.map((file, i) => (
                <div key={i} className="flex items-center justify-between text-surface-300">
                  <span>{file.path}</span>
                  <span className="text-surface-500">
                    ~{(file.estimatedSize / 1024).toFixed(1)}KB
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Refinement options */}
      <div>
        <h3 className="text-sm font-medium text-surface-300 mb-3">AI Refinement Options</h3>
        <p className="text-xs text-surface-400 mb-3">
          After deterministic generation, Claude will refine the output to match your project conventions.
        </p>
        <div className="space-y-2">
          {[
            { label: 'Naming conventions', checked: refineNaming, onChange: setRefineNaming },
            { label: 'Code style (formatting, imports)', checked: refineStyle, onChange: setRefineStyle },
            { label: 'Error handling patterns', checked: refineErrors, onChange: setRefineErrors },
            { label: 'Add test stub comments', checked: refineTests, onChange: setRefineTests },
          ].map((opt) => (
            <label
              key={opt.label}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-800 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={opt.checked}
                onChange={(e) => opt.onChange(e.target.checked)}
                className="w-4 h-4 rounded border-surface-500 text-primary-500 focus:ring-primary-500 bg-surface-700"
              />
              <span className="text-sm text-surface-300">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <button
          onClick={() => setStep(5)}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-surface-700 text-surface-300 hover:bg-surface-600 transition-colors"
        >
          Generate Only
        </button>
        <button
          onClick={() => setStep(5)}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors"
        >
          Generate + Refine
        </button>
      </div>
    </div>
  );
}
