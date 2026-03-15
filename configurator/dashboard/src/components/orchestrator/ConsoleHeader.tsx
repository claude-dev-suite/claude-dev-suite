// SPDX-License-Identifier: MIT
/**
 * Console Header Component
 *
 * Header for the console with size controls, agent status, and fullscreen toggle.
 */

interface ConsoleHeaderProps {
  consoleSize: 'sm' | 'md' | 'lg';
  setConsoleSize: (size: 'sm' | 'md' | 'lg') => void;
  currentAgent: string;
  isFullscreen: boolean;
  setIsFullscreen: (fullscreen: boolean) => void;
}

export function ConsoleHeader({
  consoleSize,
  setConsoleSize,
  currentAgent,
  isFullscreen,
  setIsFullscreen,
}: ConsoleHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[#2d2d44]">
      <button
        onClick={() => setConsoleSize('sm')}
        className={`w-3 h-3 rounded-full bg-[#ff5f56] hover:opacity-80 transition-opacity ${
          consoleSize === 'sm' ? 'ring-2 ring-white/30' : ''
        }`}
        title="Small (200px)"
      />
      <button
        onClick={() => setConsoleSize('md')}
        className={`w-3 h-3 rounded-full bg-[#ffbd2e] hover:opacity-80 transition-opacity ${
          consoleSize === 'md' ? 'ring-2 ring-white/30' : ''
        }`}
        title="Medium (300px)"
      />
      <button
        onClick={() => setConsoleSize('lg')}
        className={`w-3 h-3 rounded-full bg-[#27ca40] hover:opacity-80 transition-opacity ${
          consoleSize === 'lg' ? 'ring-2 ring-white/30' : ''
        }`}
        title="Large (450px)"
      />
      <span className="ml-2 text-xs text-[#888]">Claude Output</span>
      {currentAgent && <span className="ml-auto text-xs text-primary-400">{currentAgent}</span>}
      <button
        onClick={() => setIsFullscreen(!isFullscreen)}
        className="ml-2 px-2 py-1 text-xs text-[#888] border border-[#555] rounded hover:bg-[#3d3d54] transition-colors"
        title="Toggle Fullscreen"
      >
        {isFullscreen ? '✕' : '⛶'}
      </button>
    </div>
  );
}
