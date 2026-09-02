// SPDX-License-Identifier: MIT
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { API_BASE } from '../utils/api';

// ============================================================
// Types (mirror server/src/types/credentials.ts)
// ============================================================

/**
 * The credential the Agent SDK uses to run the model. NOT the Admin API key,
 * which is per-project, lives in the Usage panel, and only reaches the Admin
 * API for usage/cost reporting.
 */
export type CredentialKind = 'api_key' | 'oauth_token';

/** `auto` lets the server classify by prefix. */
export type CredentialKindInput = CredentialKind | 'auto';

export type CredentialSource = 'stored' | 'environment' | 'none';

/**
 * Masked status. The secret is write-only: no endpoint ever returns it, so the
 * panel derives "is one configured?" from `configured`, never from a value.
 */
export interface CredentialStatus {
  configured: boolean;
  source: CredentialSource;
  kind?: CredentialKind;
  envVar?: string;
  preview?: string;
  updatedAt?: string;
  storePath: string;
  /** Measured from the store file's mode; undefined when no store exists. */
  restrictedPermissions?: boolean;
}

export interface CredentialVerification {
  status: 'valid' | 'invalid' | 'inconclusive';
  message: string;
  httpStatus?: number;
}

// ============================================================
// Store
// ============================================================

interface CredentialsState {
  status: CredentialStatus | null;
  verification: CredentialVerification | null;
  loading: boolean;
  saving: boolean;
  verifying: boolean;
  error: string | null;

  fetchStatus: () => Promise<void>;
  saveCredential: (credential: string, kind?: CredentialKindInput) => Promise<boolean>;
  clearCredential: () => Promise<void>;
  verifyCredential: (credential?: string, kind?: CredentialKindInput) => Promise<void>;
  clearError: () => void;
  clearVerification: () => void;
}

const initialState = {
  status: null as CredentialStatus | null,
  verification: null as CredentialVerification | null,
  loading: false,
  saving: false,
  verifying: false,
  error: null as string | null,
};

/** Pull the server's error text out of the standard `{ success, error }` envelope. */
async function errorFrom(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `HTTP ${res.status}`;
}

export const useCredentialsStore = create<CredentialsState>()(
  devtools(
    (set) => ({
      ...initialState,

      fetchStatus: async () => {
        set({ loading: true, error: null }, false, 'fetchStatus/start');
        try {
          const res = await fetch(`${API_BASE}/api/credentials`);
          if (!res.ok) throw new Error(await errorFrom(res));
          const body = (await res.json()) as { data: CredentialStatus };
          set({ status: body.data, loading: false }, false, 'fetchStatus/success');
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to read credential status';
          set({ error: message, loading: false }, false, 'fetchStatus/error');
        }
      },

      /** @returns true when the credential was stored, so the caller can clear its input. */
      saveCredential: async (credential: string, kind: CredentialKindInput = 'auto') => {
        set({ saving: true, error: null, verification: null }, false, 'saveCredential/start');
        try {
          const res = await fetch(`${API_BASE}/api/credentials`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential, kind }),
          });
          if (!res.ok) throw new Error(await errorFrom(res));
          const body = (await res.json()) as { data: CredentialStatus };
          set({ status: body.data, saving: false }, false, 'saveCredential/success');
          return true;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to save credential';
          set({ error: message, saving: false }, false, 'saveCredential/error');
          return false;
        }
      },

      clearCredential: async () => {
        set({ saving: true, error: null, verification: null }, false, 'clearCredential/start');
        try {
          const res = await fetch(`${API_BASE}/api/credentials`, { method: 'DELETE' });
          if (!res.ok) throw new Error(await errorFrom(res));
          const body = (await res.json()) as { data: CredentialStatus };
          set({ status: body.data, saving: false }, false, 'clearCredential/success');
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to remove credential';
          set({ error: message, saving: false }, false, 'clearCredential/error');
        }
      },

      /** With no argument, verifies whatever credential is currently in effect. */
      verifyCredential: async (credential?: string, kind: CredentialKindInput = 'auto') => {
        set({ verifying: true, error: null, verification: null }, false, 'verifyCredential/start');
        try {
          const res = await fetch(`${API_BASE}/api/credentials/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credential ? { credential, kind } : {}),
          });
          if (!res.ok) throw new Error(await errorFrom(res));
          const body = (await res.json()) as { data: CredentialVerification };
          set({ verification: body.data, verifying: false }, false, 'verifyCredential/success');
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to verify credential';
          set({ error: message, verifying: false }, false, 'verifyCredential/error');
        }
      },

      clearError: () => set({ error: null }, false, 'clearError'),
      clearVerification: () => set({ verification: null }, false, 'clearVerification'),
    }),
    { name: 'credentials-store' },
  ),
);
