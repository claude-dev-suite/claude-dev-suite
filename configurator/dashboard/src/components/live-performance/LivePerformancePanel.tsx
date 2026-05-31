// SPDX-License-Identifier: MIT
import { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Badge, Card } from '../common';
import { API_BASE } from '@/utils/api';
import clsx from 'clsx';

interface AppEnvironment {
  id: string;
  name: string;
  type: 'development' | 'staging' | 'production';
  appUrl: string;
  frontendUrl?: string;
  notes?: string;
}

interface EnvStatus {
  envId: string;
  appReachable: boolean;
  appStatusCode?: number;
  appLatencyMs?: number;
  frontendReachable?: boolean;
  checkedAt: string;
}

interface LivePerformancePanelProps {
  projectPath: string;
}

type Tab = 'environments' | 'status';

const TYPE_BADGE_VARIANT: Record<AppEnvironment['type'], 'info' | 'warning' | 'success'> = {
  development: 'info',
  staging: 'warning',
  production: 'success',
};

const TYPE_LABEL: Record<AppEnvironment['type'], string> = {
  development: 'dev',
  staging: 'staging',
  production: 'prod',
};

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const EMPTY_FORM: Omit<AppEnvironment, 'id'> = {
  name: '',
  type: 'development',
  appUrl: '',
  frontendUrl: '',
  notes: '',
};

export function LivePerformancePanel({ projectPath }: LivePerformancePanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('environments');
  const [environments, setEnvironments] = useState<AppEnvironment[]>([]);
  const [statuses, setStatuses] = useState<Map<string, EnvStatus>>(new Map());
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<AppEnvironment, 'id'>>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchEnvironments = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE}/api/live-performance/environments?path=${encodeURIComponent(projectPath)}`
      );
      if (res.ok) {
        const data = await res.json();
        setEnvironments(data.data?.environments ?? []);
        setError(null);
      }
    } catch {
      // non-critical on load
    }
  }, [projectPath]);

  const saveEnvironments = async (envs: AppEnvironment[]) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/live-performance/environments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, environments: envs }),
      });
      if (!res.ok) {
        setError('Failed to save environments');
      }
    } catch {
      setError('Failed to save environments');
    } finally {
      setSaving(false);
    }
  };

  const detectFromEnvFiles = async () => {
    setDetecting(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/live-performance/detect?path=${encodeURIComponent(projectPath)}`
      );
      if (res.ok) {
        const data = await res.json();
        const suggested: AppEnvironment[] = data.data?.suggested ?? [];
        if (suggested.length > 0) {
          const merged = [...environments];
          for (const s of suggested) {
            if (!merged.some((e) => e.appUrl === s.appUrl)) {
              merged.push({ ...s, id: generateId() });
            }
          }
          setEnvironments(merged);
          await saveEnvironments(merged);
        }
      } else {
        setError('Auto-detect failed');
      }
    } catch {
      setError('Auto-detect failed');
    } finally {
      setDetecting(false);
    }
  };

  const checkStatus = useCallback(async (env: AppEnvironment): Promise<EnvStatus> => {
    const base: EnvStatus = {
      envId: env.id,
      appReachable: false,
      checkedAt: new Date().toISOString(),
    };

    try {
      const res = await fetch(
        `${API_BASE}/api/live-performance/status?path=${encodeURIComponent(projectPath)}&url=${encodeURIComponent(env.appUrl)}`
      );
      if (res.ok) {
        const data = await res.json();
        base.appReachable = data.data?.reachable ?? false;
        base.appStatusCode = data.data?.statusCode;
        base.appLatencyMs = data.data?.latencyMs;
      }
    } catch {
      // appReachable stays false
    }

    if (env.frontendUrl) {
      try {
        const res = await fetch(
          `${API_BASE}/api/live-performance/status?path=${encodeURIComponent(projectPath)}&url=${encodeURIComponent(env.frontendUrl)}`
        );
        if (res.ok) {
          const data = await res.json();
          base.frontendReachable = data.data?.reachable ?? false;
        }
      } catch {
        base.frontendReachable = false;
      }
    }

    return base;
  }, [projectPath]);

  const checkAllStatuses = useCallback(async (envs: AppEnvironment[]) => {
    setChecking(true);
    const results = await Promise.all(envs.map(checkStatus));
    setStatuses((prev) => {
      const next = new Map(prev);
      for (const r of results) next.set(r.envId, r);
      return next;
    });
    setChecking(false);
  }, [checkStatus]);

  // Load environments on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loader toggles loading state; intentional fetch-on-mount
    fetchEnvironments();
  }, [projectPath, fetchEnvironments]);

  // Auto-refresh logic
  useEffect(() => {
    if (autoRefresh && environments.length > 0) {
      autoRefreshRef.current = setInterval(() => {
        checkAllStatuses(environments);
      }, 30000);
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [autoRefresh, environments, checkAllStatuses]);

  const openAddForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEditForm = (env: AppEnvironment) => {
    setEditingId(env.id);
    setForm({ name: env.name, type: env.type, appUrl: env.appUrl, frontendUrl: env.frontendUrl ?? '', notes: env.notes ?? '' });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const submitForm = async () => {
    if (!form.name.trim() || !form.appUrl.trim()) {
      setError('Name and App URL are required');
      return;
    }
    setError(null);
    let updated: AppEnvironment[];
    if (editingId) {
      updated = environments.map((e) =>
        e.id === editingId ? { ...e, ...form, frontendUrl: form.frontendUrl || undefined, notes: form.notes || undefined } : e
      );
    } else {
      const newEnv: AppEnvironment = {
        id: generateId(),
        name: form.name.trim(),
        type: form.type,
        appUrl: form.appUrl.trim(),
        frontendUrl: form.frontendUrl?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
      };
      updated = [...environments, newEnv];
    }
    setEnvironments(updated);
    await saveEnvironments(updated);
    cancelForm();
  };

  const deleteEnvironment = async (id: string) => {
    const updated = environments.filter((e) => e.id !== id);
    setEnvironments(updated);
    setStatuses((prev) => { const next = new Map(prev); next.delete(id); return next; });
    await saveEnvironments(updated);
  };

  const formatLatency = (ms?: number) => (ms !== undefined ? `${ms}ms` : null);
  const formatCheckedAt = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString();
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">Live Performance</h3>
        <p className="text-sm text-surface-400">
          Configure environments and monitor application availability and latency.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-700">
        {(['environments', 'status'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              'px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px',
              activeTab === tab
                ? 'border-primary-500 text-primary-400'
                : 'border-transparent text-surface-400 hover:text-surface-200'
            )}
          >
            {tab === 'environments' ? 'Environments' : 'Status'}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-white ml-2">x</button>
        </div>
      )}

      {/* Tab: Environments */}
      {activeTab === 'environments' && (
        <div className="space-y-4">
          {/* Actions bar */}
          <div className="flex items-center gap-3">
            <Button variant="primary" size="sm" onClick={openAddForm}>
              Add Environment
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={detectFromEnvFiles}
              loading={detecting}
              disabled={detecting}
            >
              Auto-detect from .env files
            </Button>
          </div>

          {/* Inline form */}
          {showForm && (
            <Card padding="md" className="border-primary-500/50">
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-white">
                  {editingId ? 'Edit Environment' : 'Add Environment'}
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-surface-300 mb-1">Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full bg-surface-800 border border-surface-600 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-primary-500"
                      placeholder="My App"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-surface-300 mb-1">Type</label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AppEnvironment['type'] }))}
                      className="w-full bg-surface-800 border border-surface-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                    >
                      <option value="development">Development</option>
                      <option value="staging">Staging</option>
                      <option value="production">Production</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-surface-300 mb-1">App URL</label>
                    <input
                      type="text"
                      value={form.appUrl}
                      onChange={(e) => setForm((f) => ({ ...f, appUrl: e.target.value }))}
                      className="w-full bg-surface-800 border border-surface-600 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-primary-500"
                      placeholder="http://localhost:8080"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-surface-300 mb-1">
                      Frontend URL <span className="text-surface-500">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={form.frontendUrl}
                      onChange={(e) => setForm((f) => ({ ...f, frontendUrl: e.target.value }))}
                      className="w-full bg-surface-800 border border-surface-600 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-primary-500"
                      placeholder="http://localhost:5173"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-surface-300 mb-1">
                    Notes <span className="text-surface-500">(optional)</span>
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    className="w-full bg-surface-800 border border-surface-600 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-primary-500 resize-none"
                    placeholder="Any notes about this environment..."
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Button variant="primary" size="sm" onClick={submitForm} loading={saving} disabled={saving}>
                    {editingId ? 'Save Changes' : 'Add'}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={cancelForm}>
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Environment list */}
          {environments.length === 0 && !showForm ? (
            <div className="text-center py-12 text-surface-400 text-sm">
              <p className="mb-3">No environments configured.</p>
              <Button variant="secondary" size="sm" onClick={openAddForm}>
                Add your first environment
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {environments.map((env) => (
                <Card key={env.id} padding="md">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white text-sm">{env.name}</span>
                        <Badge variant={TYPE_BADGE_VARIANT[env.type]} size="sm">
                          {TYPE_LABEL[env.type]}
                        </Badge>
                      </div>
                      <p className="text-xs text-surface-400 font-mono truncate">{env.appUrl}</p>
                      {env.frontendUrl && (
                        <p className="text-xs text-surface-500 font-mono truncate mt-0.5">
                          Frontend: {env.frontendUrl}
                        </p>
                      )}
                      {env.notes && (
                        <p className="text-xs text-surface-500 mt-1 italic">{env.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button variant="secondary" size="sm" onClick={() => openEditForm(env)}>
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => deleteEnvironment(env.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Status */}
      {activeTab === 'status' && (
        <div className="space-y-4">
          {environments.length === 0 ? (
            <div className="text-center py-12 text-surface-400 text-sm">
              <p className="mb-3">No environments configured.</p>
              <button
                onClick={() => setActiveTab('environments')}
                className="text-primary-400 hover:text-primary-300 underline underline-offset-2 text-sm"
              >
                Go to Environments to add one
              </button>
            </div>
          ) : (
            <>
              {/* Controls */}
              <div className="flex items-center gap-4">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => checkAllStatuses(environments)}
                  loading={checking}
                  disabled={checking}
                >
                  Check All
                </Button>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div
                    onClick={() => setAutoRefresh((v) => !v)}
                    className={clsx(
                      'relative w-9 h-5 rounded-full transition-colors',
                      autoRefresh ? 'bg-primary-500' : 'bg-surface-700'
                    )}
                  >
                    <div
                      className={clsx(
                        'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                        autoRefresh ? 'translate-x-4' : 'translate-x-0.5'
                      )}
                    />
                  </div>
                  <span className="text-xs text-surface-300">Auto-refresh (30s)</span>
                </label>
              </div>

              {/* Status cards */}
              <div className="space-y-3">
                {environments.map((env) => {
                  const status = statuses.get(env.id);

                  return (
                    <Card key={env.id} padding="md">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white text-sm">{env.name}</span>
                            <Badge variant={TYPE_BADGE_VARIANT[env.type]} size="sm">
                              {TYPE_LABEL[env.type]}
                            </Badge>
                          </div>

                          {/* App URL status */}
                          <div className="flex items-center gap-2">
                            <StatusDot
                              state={status === undefined ? 'unknown' : status.appReachable ? 'ok' : 'error'}
                            />
                            <span className="text-xs text-surface-400 font-mono truncate">{env.appUrl}</span>
                            {status?.appReachable && status.appLatencyMs !== undefined && (
                              <span className="text-xs text-green-400 flex-shrink-0">
                                {formatLatency(status.appLatencyMs)}
                              </span>
                            )}
                            {status && !status.appReachable && (
                              <span className="text-xs text-red-400 flex-shrink-0">unreachable</span>
                            )}
                          </div>

                          {/* Frontend URL status */}
                          {env.frontendUrl && (
                            <div className="flex items-center gap-2">
                              <StatusDot
                                state={
                                  status === undefined
                                    ? 'unknown'
                                    : status.frontendReachable === undefined
                                    ? 'unknown'
                                    : status.frontendReachable
                                    ? 'ok'
                                    : 'error'
                                }
                              />
                              <span className="text-xs text-surface-500 font-mono truncate">{env.frontendUrl}</span>
                              {status?.frontendReachable === false && (
                                <span className="text-xs text-red-400 flex-shrink-0">unreachable</span>
                              )}
                            </div>
                          )}

                          {/* Last checked */}
                          {status && (
                            <p className="text-xs text-surface-500">
                              Last checked: {formatCheckedAt(status.checkedAt)}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

type DotState = 'ok' | 'error' | 'unknown';

function StatusDot({ state }: { state: DotState }) {
  return (
    <div
      className={clsx('w-2.5 h-2.5 rounded-full flex-shrink-0', {
        'bg-green-400': state === 'ok',
        'bg-red-400': state === 'error',
        'bg-surface-600': state === 'unknown',
      })}
    />
  );
}
