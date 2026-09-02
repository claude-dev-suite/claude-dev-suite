// SPDX-License-Identifier: MIT
/**
 * Credentials Panel
 *
 * Sets the Anthropic credential the Orchestrator's Agent SDK uses to run the
 * model. Accepts either an API key (sk-ant-api…, billed as API credit) or an
 * OAuth token from `claude setup-token` (sk-ant-oat…, billed to a Claude
 * Pro/Max plan); the server picks the matching env var.
 *
 * This is NOT the Admin API key from the Usage panel — that one only reaches
 * the Admin API for usage and cost reporting and cannot run the model.
 */

import { useState, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import { useCredentialsStore } from '../../stores/credentials.store';
import { safeOpenExternal } from '../../utils/releaseUrl';
import type { CredentialKindInput } from '../../stores/credentials.store';

const API_KEYS_CONSOLE_URL = 'https://console.anthropic.com/settings/keys';

const KIND_OPTIONS: { value: CredentialKindInput; label: string; hint: string }[] = [
  { value: 'auto', label: 'Detect automatically', hint: 'Classified by prefix — the right choice unless detection fails.' },
  { value: 'api_key', label: 'API key', hint: 'Sets ANTHROPIC_API_KEY. Billed as API credit.' },
  { value: 'oauth_token', label: 'OAuth token', hint: 'Sets CLAUDE_CODE_OAUTH_TOKEN. Billed to your Claude Pro/Max plan.' },
];

// ============================================================
// Sub-components
// ============================================================

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface-800 border border-surface-700 rounded-lg p-5 space-y-4">{children}</div>
  );
}

/** Eye toggle for the secret input. */
function RevealToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? 'Hide credential' : 'Show credential'}
      className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors"
      tabIndex={-1}
    >
      {shown ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      )}
    </button>
  );
}

// ============================================================
// Panel
// ============================================================

export function CredentialsPanel() {
  const status = useCredentialsStore((s) => s.status);
  const verification = useCredentialsStore((s) => s.verification);
  const loading = useCredentialsStore((s) => s.loading);
  const saving = useCredentialsStore((s) => s.saving);
  const verifying = useCredentialsStore((s) => s.verifying);
  const error = useCredentialsStore((s) => s.error);
  const fetchStatus = useCredentialsStore((s) => s.fetchStatus);
  const saveCredential = useCredentialsStore((s) => s.saveCredential);
  const clearCredential = useCredentialsStore((s) => s.clearCredential);
  const verifyCredential = useCredentialsStore((s) => s.verifyCredential);
  const clearError = useCredentialsStore((s) => s.clearError);

  const [input, setInput] = useState('');
  const [kind, setKind] = useState<CredentialKindInput>('auto');
  const [shown, setShown] = useState(false);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleSave = useCallback(async () => {
    if (!input.trim()) return;
    const saved = await saveCredential(input.trim(), kind);
    // Only drop the value once it is safely stored, so a rejected paste is
    // still there to correct instead of having to be fetched again.
    if (saved) {
      setInput('');
      setShown(false);
      setKind('auto');
    }
  }, [input, kind, saveCredential]);

  const handleVerify = useCallback(() => {
    // With text in the box, test that; otherwise test what is already in effect.
    void verifyCredential(input.trim() || undefined, kind);
  }, [input, kind, verifyCredential]);

  const configured = status?.configured ?? false;
  const fromEnvironment = status?.source === 'environment';

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold text-white">Credentials</h1>
          <p className="text-sm text-surface-400 mt-1">
            The Anthropic credential the Orchestrator uses to run the model. Stored once for every
            project, so launching the app from the desktop no longer depends on your shell&apos;s
            environment.
          </p>
        </div>

        {/* Current status */}
        <SectionCard>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-white">Current credential</h2>
              {loading && !status ? (
                <p className="text-sm text-surface-400 mt-1">Checking…</p>
              ) : configured ? (
                <div className="mt-1 space-y-1">
                  <p className="text-sm text-surface-300 font-mono break-all">{status?.preview}</p>
                  <p className="text-xs text-surface-500">
                    {status?.kind === 'oauth_token' ? 'OAuth token' : 'API key'} → sets{' '}
                    <code className="text-surface-400">{status?.envVar}</code>
                    {fromEnvironment
                      ? ' — inherited from the environment this app was launched with, not saved here.'
                      : status?.updatedAt
                        ? ` — saved ${new Date(status.updatedAt).toLocaleString()}.`
                        : '.'}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-yellow-400 mt-1">
                  No credential set here. If the Claude CLI is logged in (<code>claude login</code>),
                  it authenticates from its own credentials on disk, which this panel cannot see.
                  Otherwise the Orchestrator will fail to authenticate.
                </p>
              )}
            </div>
            <span
              className={clsx(
                'flex-shrink-0 px-2 py-1 text-xs font-medium rounded-full',
                configured
                  ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                  : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30',
              )}
            >
              {configured ? (fromEnvironment ? 'From environment' : 'Configured') : 'Not set'}
            </span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleVerify}
              disabled={verifying || (!configured && !input.trim())}
              className={clsx(
                'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
                verifying || (!configured && !input.trim())
                  ? 'bg-surface-600 text-surface-400 cursor-not-allowed'
                  : 'bg-surface-700 text-white border border-surface-600 hover:bg-surface-600',
              )}
            >
              {verifying ? 'Verifying…' : 'Verify'}
            </button>
            {status?.source === 'stored' && (
              <button
                onClick={() => void clearCredential()}
                disabled={saving}
                className="px-3 py-1.5 text-sm font-medium rounded-lg text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>

          {verification && (
            <div
              className={clsx(
                'text-sm rounded-lg border p-3',
                verification.status === 'valid'
                  ? 'bg-green-500/10 border-green-500/30 text-green-400'
                  : verification.status === 'invalid'
                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                    : 'bg-surface-700/50 border-surface-600 text-surface-300',
              )}
            >
              {verification.message}
            </div>
          )}
        </SectionCard>

        {/* Set a credential */}
        <SectionCard>
          <div>
            <h2 className="text-sm font-medium text-white">
              {configured && !fromEnvironment ? 'Replace credential' : 'Set credential'}
            </h2>
            <p className="text-xs text-surface-400 mt-1">
              Paste an API key (<code className="text-surface-300">sk-ant-api…</code>) or an OAuth
              token from <code className="text-surface-300">claude setup-token</code> (
              <code className="text-surface-300">sk-ant-oat…</code>).{' '}
              <button
                onClick={() => safeOpenExternal(API_KEYS_CONSOLE_URL)}
                className="underline hover:text-surface-200 transition-colors"
              >
                Create an API key
              </button>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={shown ? 'text' : 'password'}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (error) clearError();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSave();
                }}
                placeholder="sk-ant-api… or sk-ant-oat…"
                spellCheck={false}
                autoComplete="off"
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-primary-500/60 pr-10 transition-colors"
              />
              <RevealToggle shown={shown} onToggle={() => setShown((v) => !v)} />
            </div>
            <button
              onClick={() => void handleSave()}
              disabled={saving || !input.trim()}
              className={clsx(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors flex-shrink-0',
                saving || !input.trim()
                  ? 'bg-surface-600 text-surface-400 cursor-not-allowed'
                  : 'bg-primary-500 hover:bg-primary-600 text-white',
              )}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-surface-400" htmlFor="credential-kind">
              Type
            </label>
            <select
              id="credential-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as CredentialKindInput)}
              className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500/60 transition-colors"
            >
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-surface-500">
              {KIND_OPTIONS.find((o) => o.value === kind)?.hint}
            </p>
          </div>

          {error && (
            <div className="text-sm bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3">
              {error}
            </div>
          )}
        </SectionCard>

        {/* What this is not */}
        <SectionCard>
          <h2 className="text-sm font-medium text-white">Which credential goes where</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-surface-400 border-b border-surface-700">
                <tr>
                  <th className="py-2 pr-4 font-medium">Prefix</th>
                  <th className="py-2 pr-4 font-medium">What it does</th>
                  <th className="py-2 font-medium">Where it goes</th>
                </tr>
              </thead>
              <tbody className="text-surface-300">
                <tr className="border-b border-surface-700/50">
                  <td className="py-2 pr-4 font-mono whitespace-nowrap">sk-ant-api…</td>
                  <td className="py-2 pr-4">Runs the model, billed as API credit</td>
                  <td className="py-2">This panel</td>
                </tr>
                <tr className="border-b border-surface-700/50">
                  <td className="py-2 pr-4 font-mono whitespace-nowrap">sk-ant-oat…</td>
                  <td className="py-2 pr-4">Runs the model on your Claude Pro/Max plan</td>
                  <td className="py-2">This panel</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono whitespace-nowrap">sk-ant-admin…</td>
                  <td className="py-2 pr-4">Usage and cost reporting only — cannot run the model</td>
                  <td className="py-2">Usage panel</td>
                </tr>
              </tbody>
            </table>
          </div>
          {status?.source === 'stored' && (
            <p className="text-xs text-surface-500">
              Stored at <code className="text-surface-400 break-all">{status.storePath}</code>
              {status.restrictedPermissions === true
                ? ' with owner-only permissions (0600), read from the file itself.'
                : status.restrictedPermissions === false
                  ? ' — not owner-only. On Windows a POSIX mode does not apply and the file relies on your account’s permissions; elsewhere the chmod did not take, which some network and non-POSIX filesystems do silently.'
                  : '.'}
            </p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
