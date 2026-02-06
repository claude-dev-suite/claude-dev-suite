// SPDX-License-Identifier: MIT
import { type InputHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

export type InputVariant = 'default' | 'error' | 'success';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  variant?: InputVariant;
  label?: React.ReactNode;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<InputVariant, string> = {
  default: 'border-surface-600 focus:border-primary-500 focus:ring-primary-500',
  error: 'border-red-500 focus:border-red-500 focus:ring-red-500',
  success: 'border-green-500 focus:border-green-500 focus:ring-green-500',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      variant = 'default',
      label,
      helperText,
      error,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || (typeof label === 'string' ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const actualVariant = error ? 'error' : variant;

    return (
      <div className={clsx('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-surface-300"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-label={!label ? props['aria-label'] || props.placeholder : undefined}
            className={clsx(
              'w-full rounded-lg bg-surface-800 px-4 py-2.5 text-sm text-white',
              'border transition-colors',
              'placeholder:text-surface-500',
              'focus:outline-none focus:ring-2 focus:ring-offset-0',
              variantStyles[actualVariant],
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              props.disabled && 'opacity-50 cursor-not-allowed',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400">
              {rightIcon}
            </div>
          )}
        </div>
        {(error || helperText) && (
          <p
            className={clsx(
              'text-xs',
              error ? 'text-red-400' : 'text-surface-400'
            )}
          >
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
