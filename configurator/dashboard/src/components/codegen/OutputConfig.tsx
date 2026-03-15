// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useCodeGenStore } from '../../stores/codegen.store';
import type { CodeGenTargetLanguage } from '../../stores/codegen.store';
import { API_BASE } from '../../utils/api';

interface TargetInfo {
  id: CodeGenTargetLanguage;
  label: string;
  technologies: string[];
  components: Array<{ id: string; label: string; enabled: boolean }>;
}

export function OutputConfig({ projectPath }: { projectPath: string }) {
  const technology = useCodeGenStore((s) => s.technology);
  const targetLanguage = useCodeGenStore((s) => s.targetLanguage);
  const outputDir = useCodeGenStore((s) => s.outputDir);
  const components = useCodeGenStore((s) => s.components);
  const setTargetLanguage = useCodeGenStore((s) => s.setTargetLanguage);
  const setOutputDir = useCodeGenStore((s) => s.setOutputDir);
  const setComponents = useCodeGenStore((s) => s.setComponents);
  const toggleComponent = useCodeGenStore((s) => s.toggleComponent);
  const setStep = useCodeGenStore((s) => s.setStep);

  const [targets, setTargets] = useState<TargetInfo[]>([]);

  useEffect(() => {
    const fetchTargets = async () => {
      try {
        const url = technology
          ? `${API_BASE}/api/codegen/targets?technology=${technology}`
          : `${API_BASE}/api/codegen/targets`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setTargets(data.data || []);
        }
      } catch {
        // Ignore
      }
    };
    void fetchTargets();
  }, [technology]);

  const handleTargetSelect = (target: TargetInfo) => {
    setTargetLanguage(target.id);
    setComponents(target.components);
  };

  const handleContinue = () => {
    if (targetLanguage) {
      setStep(4);
    }
  };

  return (
    <div className="space-y-6">
      {/* Target Language */}
      <div>
        <h3 className="text-sm font-medium text-surface-300 mb-3">Target Framework</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {targets.map((target) => (
            <button
              key={target.id}
              onClick={() => handleTargetSelect(target)}
              className={clsx(
                'p-3 rounded-lg border text-left transition-all',
                targetLanguage === target.id
                  ? 'border-primary-500 bg-primary-500/10'
                  : 'border-surface-600 bg-surface-800 hover:border-surface-500'
              )}
            >
              <span className="text-sm font-medium text-white">{target.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Output Directory */}
      <div>
        <label className="block text-sm font-medium text-surface-300 mb-2">Output Directory</label>
        <input
          type="text"
          value={outputDir}
          onChange={(e) => setOutputDir(e.target.value)}
          placeholder="src/generated"
          className="w-full px-3 py-2 bg-surface-800 border border-surface-600 rounded-lg text-sm text-white placeholder-surface-500 focus:border-primary-500 focus:outline-none"
        />
        <p className="text-xs text-surface-500 mt-1">Relative to project root: {projectPath}</p>
      </div>

      {/* Components */}
      {components.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-surface-300 mb-3">Components to Generate</h3>
          <div className="space-y-2">
            {components.map((comp) => (
              <label
                key={comp.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-surface-800 border border-surface-700 hover:border-surface-600 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={comp.enabled}
                  onChange={() => toggleComponent(comp.id)}
                  className="w-4 h-4 rounded border-surface-500 text-primary-500 focus:ring-primary-500 bg-surface-700"
                />
                <span className="text-sm text-white">{comp.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Continue button */}
      <div className="flex justify-end">
        <button
          onClick={handleContinue}
          disabled={!targetLanguage}
          className={clsx(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            targetLanguage
              ? 'bg-primary-500 text-white hover:bg-primary-600'
              : 'bg-surface-700 text-surface-500 cursor-not-allowed'
          )}
        >
          Continue to Preview
        </button>
      </div>
    </div>
  );
}
