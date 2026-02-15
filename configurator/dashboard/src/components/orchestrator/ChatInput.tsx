// SPDX-License-Identifier: MIT
import { useState, useCallback, useRef, useEffect, useMemo, useTransition } from 'react';
import { Button } from '../common';
import clsx from 'clsx';
import { debounce } from '@/utils/debounce';

export interface AutocompleteItem {
  name: string;
  description: string;
  icon: string;
}

export interface ChatInputProps {
  onSend: (message: string) => void;
  onSlashCommand?: (command: string) => boolean; // Returns true if handled locally
  onCancel?: () => void;
  onNewChat?: () => void;
  disabled?: boolean;
  processing?: boolean;
  placeholder?: string;
  agents?: AutocompleteItem[];
  projectCommands?: AutocompleteItem[];
}

// Default dashboard commands
const dashboardCommands: AutocompleteItem[] = [
  { name: '/agents', description: 'List installed agents', icon: '🤖' },
  { name: '/mcp', description: 'List MCP servers', icon: '🔌' },
  { name: '/commands', description: 'Show all commands', icon: '⚡' },
  { name: '/help', description: 'Show help', icon: '📖' },
  { name: '/clear', description: 'Clear output', icon: '🧹' },
  { name: '/new', description: 'New chat session', icon: '🔄' },
  { name: '/resume', description: 'Resume a previous session', icon: '⏮️' },
];

export function ChatInput({
  onSend,
  onSlashCommand,
  onCancel,
  onNewChat,
  disabled = false,
  processing = false,
  placeholder = 'Send a message... (/ for commands, @ for agents)',
  agents = [],
  projectCommands = [],
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteItems, setAutocompleteItems] = useState<AutocompleteItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [_autocompleteType, setAutocompleteType] = useState<'command' | 'agent' | null>(null);
  const [startPos, setStartPos] = useState(0);
  const [_isPending, startTransition] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get autocomplete suggestions based on current input
  const getSuggestions = useCallback((text: string, cursorPos: number): AutocompleteItem[] => {
    const beforeCursor = text.substring(0, cursorPos);

    // Check for @ (agent mention)
    const atMatch = beforeCursor.match(/@([\w-]*)$/);
    if (atMatch) {
      const query = (atMatch[1] ?? '').toLowerCase();
      setAutocompleteType('agent');
      setStartPos(cursorPos - atMatch[0].length);
      return agents.filter(a =>
        a.name.toLowerCase().includes(query)
      );
    }

    // Check for / (command) - only at start of input
    const slashMatch = beforeCursor.match(/^\/([\w-]*)$/);
    if (slashMatch) {
      const query = (slashMatch[1] ?? '').toLowerCase();
      setAutocompleteType('command');
      setStartPos(0);
      const allCommands = [...dashboardCommands, ...projectCommands];
      return allCommands.filter(c =>
        c.name.toLowerCase().includes(query)
      );
    }

    return [];
  }, [agents, projectCommands]);

  // Debounced function to update suggestions
  const debouncedGetSuggestions = useMemo(
    () => debounce((value: string, cursor: number) => {
      const newSuggestions = getSuggestions(value, cursor);

      // Use transition for non-urgent autocomplete updates
      startTransition(() => {
        if (newSuggestions.length > 0) {
          setAutocompleteItems(newSuggestions);
          setSelectedIndex(0);
          setShowAutocomplete(true);
        } else {
          setShowAutocomplete(false);
          setAutocompleteItems([]);
        }
      });
    }, 150),
    [getSuggestions]
  );

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setMessage(newValue);

    const cursorPos = e.target.selectionStart || 0;
    debouncedGetSuggestions(newValue, cursorPos);
  }, [debouncedGetSuggestions]);

  // Select autocomplete item
  const selectItem = useCallback((index: number) => {
    const item = autocompleteItems[index];
    if (!item) return;

    const cursorPos = inputRef.current?.selectionStart || message.length;
    const afterCursor = message.substring(cursorPos);
    const newText = message.substring(0, startPos) + item.name + ' ' + afterCursor.trimStart();
    setMessage(newText);

    setShowAutocomplete(false);
    setAutocompleteItems([]);
    setSelectedIndex(0);

    // Focus and move cursor
    setTimeout(() => {
      if (inputRef.current) {
        const newCursorPos = startPos + item.name.length + 1;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }, [autocompleteItems, message, startPos]);

  // Handle send with slash command check
  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed || disabled || processing) return;

    // Check if it's a local slash command
    if (trimmed.startsWith('/') && onSlashCommand) {
      const handled = onSlashCommand(trimmed);
      if (handled) {
        setMessage('');
        return;
      }
    }

    onSend(trimmed);
    setMessage('');
  }, [message, disabled, processing, onSlashCommand, onSend]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showAutocomplete && autocompleteItems.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, autocompleteItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Tab':
          e.preventDefault();
          selectItem(selectedIndex);
          break;
        case 'Enter':
          e.preventDefault();
          selectItem(selectedIndex);
          break;
        case 'Escape':
          e.preventDefault();
          setShowAutocomplete(false);
          break;
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [showAutocomplete, selectedIndex, autocompleteItems, selectItem, handleSend]);

  // Scroll selected item into view
  useEffect(() => {
    if (showAutocomplete && dropdownRef.current) {
      const selected = dropdownRef.current.querySelector('.selected');
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, showAutocomplete]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowAutocomplete(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative flex gap-2 p-2 bg-[#2d2d44] border-t border-[#3d3d54]" data-tutorial="chat-input">
      {/* Autocomplete Dropdown */}
      {showAutocomplete && autocompleteItems.length > 0 && (
        <div
          ref={dropdownRef}
          className={clsx(
            "absolute bottom-full left-2 right-24 mb-1 max-h-[200px] overflow-y-auto bg-[#1a1a2e] border border-[#3d3d54] rounded-lg shadow-lg z-50 transition-opacity",
            _isPending && "opacity-60"
          )}
        >
          {autocompleteItems.map((item, i) => (
            <div
              key={item.name}
              className={clsx(
                'flex items-center gap-2 px-3 py-2 cursor-pointer text-sm border-b border-[#2d2d44] last:border-b-0 transition-colors',
                i === selectedIndex ? 'bg-primary-500/20 selected' : 'hover:bg-[#2d2d44]'
              )}
              onClick={() => selectItem(i)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="text-base flex-shrink-0">{item.icon}</span>
              <span className="text-primary-400 font-medium flex-shrink-0">{item.name}</span>
              <span className="text-[#888] text-xs truncate">{item.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={message}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || processing}
        className={clsx(
          'flex-1 px-3 py-2 bg-[#1a1a2e] border border-[#3d3d54] rounded text-sm text-[#e0e0e0] placeholder:text-[#666] focus:outline-none focus:border-primary-500',
          (disabled || processing) && 'opacity-50 cursor-not-allowed'
        )}
      />

      {/* Buttons */}
      {processing ? (
        <Button variant="danger" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      ) : (
        <>
          <Button variant="secondary" size="sm" onClick={onNewChat}>
            New
          </Button>
          <Button size="sm" onClick={handleSend} disabled={!message.trim() || disabled}>
            Send
          </Button>
        </>
      )}
    </div>
  );
}
