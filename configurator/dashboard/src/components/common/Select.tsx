// SPDX-License-Identifier: MIT
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import clsx from 'clsx';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  multiple?: boolean;
  searchable?: boolean;
  fullWidth?: boolean;
  className?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  error,
  disabled = false,
  multiple = false,
  searchable = false,
  fullWidth = false,
  className,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedValues = useMemo(
    () => (Array.isArray(value) ? value : value ? [value] : []),
    [value]
  );

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(search.toLowerCase())
  );

  const selectedLabels = selectedValues
    .map((v) => options.find((o) => o.value === v)?.label)
    .filter(Boolean);

  const handleSelect = useCallback(
    (optionValue: string) => {
      if (multiple) {
        const newValues = selectedValues.includes(optionValue)
          ? selectedValues.filter((v) => v !== optionValue)
          : [...selectedValues, optionValue];
        onChange(newValues);
      } else {
        onChange(optionValue);
        setIsOpen(false);
        setSearch('');
      }
    },
    [multiple, selectedValues, onChange]
  );

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && searchable && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, searchable]);

  return (
    <div
      ref={containerRef}
      className={clsx('relative', fullWidth && 'w-full', className)}
    >
      {label && (
        <label className="block text-sm font-medium text-surface-300 mb-1.5">
          {label}
        </label>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={clsx(
          'w-full flex items-center justify-between gap-2 rounded-lg px-4 py-2.5',
          'bg-surface-800 border text-left text-sm transition-colors',
          isOpen ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-surface-600',
          error && 'border-red-500',
          disabled && 'opacity-50 cursor-not-allowed',
          !disabled && 'hover:border-surface-500'
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={!label ? placeholder : undefined}
      >
        <span className={clsx(
          selectedLabels.length === 0 ? 'text-surface-500' : 'text-white'
        )}>
          {selectedLabels.length > 0
            ? multiple
              ? `${selectedLabels.length} selected`
              : selectedLabels[0]
            : placeholder}
        </span>
        <svg
          className={clsx('w-4 h-4 text-surface-400 transition-transform', isOpen && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 rounded-lg border border-surface-600 bg-surface-800 shadow-xl">
          {/* Search input */}
          {searchable && (
            <div className="p-2 border-b border-surface-700">
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                aria-label="Search options"
                className="w-full px-3 py-2 text-sm bg-surface-700 border border-surface-600 rounded-md text-white placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          )}

          {/* Options */}
          <ul
            className="max-h-60 overflow-auto py-1"
            role="listbox"
            aria-multiselectable={multiple}
          >
            {filteredOptions.length === 0 ? (
              <li className="px-4 py-2 text-sm text-surface-400">No options found</li>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = selectedValues.includes(option.value);
                return (
                  <li
                    key={option.value}
                    onClick={() => !option.disabled && handleSelect(option.value)}
                    className={clsx(
                      'px-4 py-2 cursor-pointer transition-colors',
                      isSelected && 'bg-primary-500/10',
                      !option.disabled && 'hover:bg-surface-700',
                      option.disabled && 'opacity-50 cursor-not-allowed'
                    )}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="flex items-center gap-3">
                      {multiple && (
                        <div
                          className={clsx(
                            'w-4 h-4 rounded border flex items-center justify-center',
                            isSelected
                              ? 'bg-primary-500 border-primary-500'
                              : 'border-surface-500'
                          )}
                        >
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                      )}
                      <div>
                        <div className="text-sm text-white">{option.label}</div>
                        {option.description && (
                          <div className="text-xs text-surface-400">{option.description}</div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
