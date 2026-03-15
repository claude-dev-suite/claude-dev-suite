// SPDX-License-Identifier: MIT
import { Button } from '../common';
import type { RecapData } from './hooks/useOrchestratorState';

export interface RecapPanelProps {
  recapData: RecapData;
  jobTitle: string;
  onCopySummary: () => void;
  onNewJob: () => void;
}

export function RecapPanel({ recapData, onCopySummary, onNewJob }: RecapPanelProps) {
  return (
    <div
      className={`mt-4 p-4 rounded-lg border ${
        recapData.success ? 'border-green-500' : 'border-red-500'
      }`}
      style={{
        background: recapData.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">{recapData.success ? '✓' : '✗'}</span>
        <h3
          className={`text-lg font-semibold ${
            recapData.success ? 'text-green-400' : 'text-red-400'
          }`}
        >
          Job {recapData.success ? 'Completed' : 'Failed'}
        </h3>
      </div>

      {recapData.summary && (
        <p className="text-sm text-surface-300 mb-4">{recapData.summary}</p>
      )}

      {/* Agent Results */}
      {recapData.recap?.agentResults && recapData.recap.agentResults.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-white mb-2">Agent Execution</h4>
          <div className="space-y-1">
            {recapData.recap.agentResults.map((ar, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-surface-800 rounded text-sm">
                <span
                  className={
                    ar.status === 'completed'
                      ? 'text-green-400'
                      : ar.status === 'skipped'
                      ? 'text-surface-400'
                      : 'text-red-400'
                  }
                >
                  {ar.status === 'completed' ? '✓' : ar.status === 'skipped' ? '○' : '✗'}
                </span>
                <strong className="text-white">{ar.agentId}</strong>
                <span className="flex-1 text-surface-400 text-xs truncate">{ar.summary}</span>
                <span className="text-surface-400 text-xs">{ar.duration}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Files Changed */}
      {recapData.recap?.files &&
        (recapData.recap.files.created?.length ||
          recapData.recap.files.modified?.length ||
          recapData.recap.files.deleted?.length) && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-white mb-2">
              Files Changed (
              {(recapData.recap.files.created?.length || 0) +
                (recapData.recap.files.modified?.length || 0) +
                (recapData.recap.files.deleted?.length || 0)}
              )
            </h4>
            <div className="max-h-32 overflow-y-auto p-2 bg-surface-800 rounded font-mono text-xs">
              {recapData.recap.files.created?.map((f, i) => (
                <div key={`c-${i}`} className="text-green-400">
                  + {f}
                </div>
              ))}
              {recapData.recap.files.modified?.map((f, i) => (
                <div key={`m-${i}`} className="text-yellow-400">
                  ~ {f}
                </div>
              ))}
              {recapData.recap.files.deleted?.map((f, i) => (
                <div key={`d-${i}`} className="text-red-400">
                  - {f}
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Tests */}
      {recapData.recap?.tests?.ran && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-white mb-2">Tests</h4>
          <div className="flex gap-4 text-sm mb-2">
            <span className="text-green-400">
              ✓ {recapData.recap.tests.summary?.passed || 0} passed
            </span>
            <span className="text-red-400">
              ✗ {recapData.recap.tests.summary?.failed || 0} failed
            </span>
            <span className="text-surface-400">
              ○ {recapData.recap.tests.summary?.skipped || 0} skipped
            </span>
            {recapData.recap.tests.summary?.coverage && (
              <span className="text-surface-300">
                Coverage: {recapData.recap.tests.summary.coverage}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      {recapData.recap?.notes && recapData.recap.notes.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-white mb-2">Notes</h4>
          <ul className="list-disc list-inside text-sm text-surface-300">
            {recapData.recap.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" onClick={onCopySummary}>
          Copy Summary
        </Button>
        <Button onClick={onNewJob}>New Job</Button>
      </div>
    </div>
  );
}
