// SPDX-License-Identifier: MIT
import { Button, Input } from '../common';
import type { InputRequest, PermissionRequest } from './hooks/useOrchestratorState';

export interface InputPromptProps {
  inputRequest: InputRequest;
  userInput: string;
  onUserInputChange: (input: string) => void;
  onSendInput: (response?: string) => void;
}

export function InputPrompt({
  inputRequest,
  userInput,
  onUserInputChange,
  onSendInput,
}: InputPromptProps) {
  return (
    <div
      className="mt-4 p-4 rounded-lg border border-primary-500"
      style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(99, 102, 241, 0.1))' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">❓</span>
        <span className="font-semibold text-primary-400">Claude needs your input</span>
      </div>
      <p className="text-sm text-surface-400 mb-3">{inputRequest.prompt}</p>
      <div className="flex gap-2">
        <Input
          value={userInput}
          onChange={(e) => onUserInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSendInput()}
          placeholder="Type your response..."
          fullWidth
        />
        <Button onClick={() => onSendInput()}>Send</Button>
      </div>
      <div className="flex gap-2 mt-2">
        <Button variant="secondary" size="sm" onClick={() => onSendInput('y')}>
          Yes (y)
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onSendInput('n')}>
          No (n)
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onSendInput('')}>
          Continue (Enter)
        </Button>
      </div>
    </div>
  );
}

export interface PermissionPromptProps {
  permissionRequest: PermissionRequest;
  onPermissionResponse: (response: 'y' | 'a' | 'n') => void;
}

export function PermissionPrompt({
  permissionRequest,
  onPermissionResponse,
}: PermissionPromptProps) {
  return (
    <div
      className="mt-4 p-4 rounded-lg border border-yellow-500"
      style={{ background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.1))' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🔐</span>
        <span className="font-semibold text-yellow-500">Permission Required</span>
      </div>
      <div className="text-sm text-surface-400 mb-3">
        <strong className="text-white">{permissionRequest.type}</strong>:{' '}
        <code className="px-2 py-1 bg-black/20 rounded text-xs">{permissionRequest.target}</code>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button style={{ background: '#10b981' }} onClick={() => onPermissionResponse('y')}>
          ✓ Allow Once
        </Button>
        <Button style={{ background: '#8b5cf6' }} onClick={() => onPermissionResponse('a')}>
          ✓ Allow Always
        </Button>
        <Button style={{ background: '#ef4444' }} onClick={() => onPermissionResponse('n')}>
          ✗ Deny
        </Button>
      </div>
    </div>
  );
}
