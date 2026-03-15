// SPDX-License-Identifier: MIT
import { type InputHTMLAttributes, forwardRef, memo } from 'react';
import clsx from 'clsx';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

export const Checkbox = memo(forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className, id, ...props }, ref) => {
    const checkboxId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className={clsx('flex items-start gap-3', className)}>
        <div className="flex items-center h-5">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            className={clsx(
              'w-4 h-4 rounded border-surface-600 bg-surface-800',
              'text-primary-500 focus:ring-primary-500 focus:ring-2',
              'transition-colors cursor-pointer',
              props.disabled && 'opacity-50 cursor-not-allowed'
            )}
            {...props}
          />
        </div>
        {(label || description) && (
          <div className="flex flex-col">
            {label && (
              <label
                htmlFor={checkboxId}
                className={clsx(
                  'text-sm font-medium text-surface-200 cursor-pointer',
                  props.disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                {label}
              </label>
            )}
            {description && (
              <span className="text-xs text-surface-400">{description}</span>
            )}
          </div>
        )}
      </div>
    );
  }
));

Checkbox.displayName = 'Checkbox';
