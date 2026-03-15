// SPDX-License-Identifier: MIT
import { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import { useCodeGenStore } from '../../stores/codegen.store';
import { API_BASE } from '../../utils/api';

export function FileUploader() {
  const technology = useCodeGenStore((s) => s.technology);
  const uploadedFile = useCodeGenStore((s) => s.uploadedFile);
  const validation = useCodeGenStore((s) => s.validation);
  const setUploadedFile = useCodeGenStore((s) => s.setUploadedFile);
  const setValidation = useCodeGenStore((s) => s.setValidation);
  const setTechnology = useCodeGenStore((s) => s.setTechnology);
  const setStep = useCodeGenStore((s) => s.setStep);
  const setError = useCodeGenStore((s) => s.setError);

  const [isDragging, setIsDragging] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setIsValidating(true);
      setError(null);

      try {
        const content = await file.text();
        setUploadedFile({ name: file.name, content, size: file.size });

        // Validate via API
        const res = await fetch(`${API_BASE}/api/codegen/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            fileName: file.name,
            technology: technology || undefined,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const val = data.data;
          setValidation(val);

          // Auto-detect technology if not set
          if (val.technology && !technology) {
            setTechnology(val.technology);
          }

          if (val.valid) {
            setStep(3);
          }
        } else {
          const err = await res.json();
          setError(err.error || 'Validation failed');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setIsValidating(false);
      }
    },
    [technology, setUploadedFile, setValidation, setTechnology, setStep, setError]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={clsx(
          'flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all',
          isDragging
            ? 'border-primary-500 bg-primary-500/10'
            : 'border-surface-600 bg-surface-800/50 hover:border-surface-500'
        )}
      >
        <svg className="w-10 h-10 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <div className="text-center">
          <p className="text-sm font-medium text-surface-300">
            {isValidating ? 'Validating...' : 'Drop file here or click to browse'}
          </p>
          <p className="text-xs text-surface-500 mt-1">
            Supported: .yaml, .yml, .json, .tsp, .proto, .bpmn
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml,.json,.tsp,.proto,.bpmn,.xml"
          onChange={handleInputChange}
          className="hidden"
        />
      </div>

      {/* Validation result */}
      {validation && (
        <div
          className={clsx(
            'p-4 rounded-lg border',
            validation.valid
              ? 'border-green-500/30 bg-green-500/10'
              : 'border-red-500/30 bg-red-500/10'
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            {validation.valid ? (
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className={clsx('text-sm font-medium', validation.valid ? 'text-green-400' : 'text-red-400')}>
              {validation.valid ? 'Valid' : 'Invalid'} {validation.technology?.toUpperCase()} {validation.version || ''}
            </span>
          </div>

          {uploadedFile && (
            <p className="text-xs text-surface-400 mb-2">
              {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)
            </p>
          )}

          {validation.summary.title && (
            <p className="text-sm text-surface-300">{validation.summary.title}</p>
          )}

          {(validation.summary.endpoints || validation.summary.models || validation.summary.channels) && (
            <div className="flex gap-4 mt-2">
              {validation.summary.endpoints !== undefined && validation.summary.endpoints > 0 && (
                <span className="text-xs text-surface-400">
                  {validation.summary.endpoints} endpoint{validation.summary.endpoints !== 1 ? 's' : ''}
                </span>
              )}
              {validation.summary.models !== undefined && validation.summary.models > 0 && (
                <span className="text-xs text-surface-400">
                  {validation.summary.models} model{validation.summary.models !== 1 ? 's' : ''}
                </span>
              )}
              {validation.summary.channels !== undefined && validation.summary.channels > 0 && (
                <span className="text-xs text-surface-400">
                  {validation.summary.channels} channel{validation.summary.channels !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}

          {validation.errors.length > 0 && (
            <ul className="mt-2 space-y-1">
              {validation.errors.map((err, i) => (
                <li key={i} className="text-xs text-red-400">
                  {err}
                </li>
              ))}
            </ul>
          )}

          {validation.warnings.length > 0 && (
            <ul className="mt-2 space-y-1">
              {validation.warnings.map((w, i) => (
                <li key={i} className="text-xs text-yellow-400">
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
