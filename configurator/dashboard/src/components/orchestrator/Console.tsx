// SPDX-License-Identifier: MIT
import { useEffect, useRef, useMemo } from 'react';
import clsx from 'clsx';

export type ConsoleSize = 'sm' | 'md' | 'lg' | 'full';

export interface ConsoleProps {
  output: string[];
  size?: ConsoleSize;
  onSizeChange?: (size: ConsoleSize) => void;
  className?: string;
  /** If true, render only the output area without header */
  minimal?: boolean;
}

const sizeStyles: Record<ConsoleSize, string> = {
  sm: 'h-[200px]',
  md: 'h-[300px]',
  lg: 'h-[450px]',
  full: '', // No fixed height for full - will use flex-1 from parent
};

// Note: No manual sanitization needed - React automatically escapes text
// content in JSX expressions, preventing XSS attacks

// Parse ANSI codes to styled spans
function parseAnsi(text: string): React.ReactNode[] {
  const ansiRegex = /\x1b\[([0-9;]*)m/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let currentStyle: React.CSSProperties = {};
  let key = 0;

  const colorMap: Record<number, string> = {
    30: '#2e2e2e', // black
    31: '#ff5f5f', // red
    32: '#5fff5f', // green
    33: '#ffff5f', // yellow
    34: '#5f5fff', // blue
    35: '#ff5fff', // magenta
    36: '#5fffff', // cyan
    37: '#ffffff', // white
    90: '#7f7f7f', // bright black
    91: '#ff8787', // bright red
    92: '#87ff87', // bright green
    93: '#ffff87', // bright yellow
    94: '#8787ff', // bright blue
    95: '#ff87ff', // bright magenta
    96: '#87ffff', // bright cyan
    97: '#ffffff', // bright white
  };

  while ((match = ansiRegex.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      const textPart = text.slice(lastIndex, match.index);
      parts.push(
        <span key={key++} style={currentStyle}>
          {textPart}
        </span>
      );
    }

    // Parse ANSI code
    const codes = (match[1] ?? '').split(';').map(Number);
    for (const code of codes) {
      if (code === 0) {
        currentStyle = {};
      } else if (code === 1) {
        currentStyle = { ...currentStyle, fontWeight: 'bold' };
      } else if (code === 3) {
        currentStyle = { ...currentStyle, fontStyle: 'italic' };
      } else if (code === 4) {
        currentStyle = { ...currentStyle, textDecoration: 'underline' };
      } else if (colorMap[code]) {
        currentStyle = { ...currentStyle, color: colorMap[code] };
      } else if (code >= 40 && code <= 47) {
        const bgColor = colorMap[code - 10];
        currentStyle = { ...currentStyle, backgroundColor: bgColor };
      }
    }

    lastIndex = ansiRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(
      <span key={key++} style={currentStyle}>
        {text.slice(lastIndex)}
      </span>
    );
  }

  return parts;
}

export function Console({ output, size = 'md', onSizeChange, className, minimal = false }: ConsoleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (containerRef.current && autoScrollRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [output]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
    }
  };

  // Parse output lines
  const parsedOutput = useMemo(() => {
    return output.map((line, index) => (
      <div key={`line-${index}-${line.substring(0, 20)}`} className="whitespace-pre-wrap break-all">
        {parseAnsi(line)}
      </div>
    ));
  }, [output]);

  const sizes: ConsoleSize[] = ['sm', 'md', 'lg', 'full'];

  // Minimal mode: just the output area (for use with external header)
  if (minimal) {
    return (
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={clsx(
          'font-mono text-sm text-[#e0e0e0] p-4 overflow-auto',
          'leading-relaxed',
          sizeStyles[size],
          className
        )}
        style={{ fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace", fontSize: '0.8rem', lineHeight: 1.5 }}
      >
        {output.length === 0 ? (
          <div className="text-[#666] italic">
            Console output will appear here...
          </div>
        ) : (
          parsedOutput
        )}
      </div>
    );
  }

  // Full mode: with header and controls
  return (
    <div className={clsx('flex flex-col', className)}>
      {/* Controls */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface-800 border border-surface-700 rounded-t-lg">
        <span className="text-xs text-surface-400 font-medium">Console Output</span>
        <div className="flex items-center gap-1">
          {sizes.map((s) => (
            <button
              key={s}
              onClick={() => onSizeChange?.(s)}
              className={clsx(
                'px-2 py-1 text-xs rounded transition-colors',
                size === s
                  ? 'bg-primary-500 text-white'
                  : 'text-surface-400 hover:text-white hover:bg-surface-700'
              )}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Console Content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={clsx(
          'bg-surface-900 border-x border-b border-surface-700 rounded-b-lg',
          'font-mono text-sm text-surface-200 p-4 overflow-auto',
          sizeStyles[size]
        )}
      >
        {output.length === 0 ? (
          <div className="text-surface-400 italic">
            Console output will appear here...
          </div>
        ) : (
          parsedOutput
        )}
      </div>
    </div>
  );
}
