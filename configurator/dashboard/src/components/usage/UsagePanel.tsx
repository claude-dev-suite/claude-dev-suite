// SPDX-License-Identifier: MIT
import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import clsx from 'clsx';
import { useUsageStore } from '../../stores/usage.store';
import { safeOpenExternal } from '../../utils/releaseUrl';
import type {
  AlertThreshold,
  AlertSeverity,
  AlertMetric,
  AlertOperator,
  DeepLink,
  UsageAlert,
} from '../../stores/usage.store';

// ============================================================
// Helpers
// ============================================================

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 minute ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
}

function severityColor(s: AlertSeverity) {
  switch (s) {
    case 'critical': return 'text-red-400 bg-red-500/10 border-red-500/30';
    case 'warning':  return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
    case 'info':     return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
  }
}

function severityDot(s: AlertSeverity) {
  switch (s) {
    case 'critical': return 'bg-red-500';
    case 'warning':  return 'bg-yellow-500';
    case 'info':     return 'bg-blue-500';
  }
}

function deepLinkIcon(icon: DeepLink['icon']) {
  switch (icon) {
    case 'credits':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      );
    case 'dashboard':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
    case 'plan':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      );
    case 'settings':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    default:
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      );
  }
}

// ============================================================
// Default deep links (shown when backend is unavailable)
// ============================================================

const DEFAULT_DEEP_LINKS: DeepLink[] = [
  {
    label: 'Enable Extra Usage',
    url: 'https://console.anthropic.com/settings/limits',
    description: 'Request higher usage limits for your account',
    icon: 'settings',
  },
  {
    label: 'Add Credits',
    url: 'https://console.anthropic.com/settings/billing',
    description: 'Purchase credits to continue using the API',
    icon: 'credits',
  },
  {
    label: 'View Usage Dashboard',
    url: 'https://console.anthropic.com/usage',
    description: 'Full analytics view in Anthropic Console',
    icon: 'dashboard',
  },
  {
    label: 'Manage Plan',
    url: 'https://console.anthropic.com/settings/plans',
    description: 'Upgrade or manage your subscription plan',
    icon: 'plan',
  },
];

// ============================================================
// Metric / operator labels for the UI
// ============================================================

const METRIC_OPTIONS: Array<{ value: AlertMetric; label: string }> = [
  { value: 'daily_cost_usd', label: 'Daily Cost (USD)' },
  { value: 'monthly_cost_usd', label: 'Monthly Cost (USD)' },
  { value: 'daily_tokens', label: 'Daily Tokens' },
  { value: 'monthly_tokens', label: 'Monthly Tokens' },
];

const OPERATOR_OPTIONS: Array<{ value: AlertOperator; label: string }> = [
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
];

const SEVERITY_OPTIONS: AlertSeverity[] = ['info', 'warning', 'critical'];

// ============================================================
// Sub-components
// ============================================================

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  severity?: AlertSeverity | null;
  loading?: boolean;
}

function MetricCard({ title, value, subtitle, severity, loading }: MetricCardProps) {
  const valueColor = severity === 'critical'
    ? 'text-red-400'
    : severity === 'warning'
    ? 'text-yellow-400'
    : 'text-white';

  return (
    <div className="bg-surface-800 border border-surface-700 rounded-lg p-4 flex flex-col gap-1">
      <p className="text-xs font-medium text-surface-400 uppercase tracking-wide">{title}</p>
      {loading ? (
        <div className="h-7 w-24 bg-surface-700 rounded animate-pulse mt-1" />
      ) : (
        <p className={clsx('text-2xl font-bold', valueColor)}>{value}</p>
      )}
      {subtitle && (
        <p className="text-xs text-surface-500 mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}

interface AlertBadgeProps {
  severity: AlertSeverity;
}

function AlertBadge({ severity }: AlertBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
        severityColor(severity)
      )}
    >
      <span className={clsx('w-1.5 h-1.5 rounded-full', severityDot(severity))} />
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}

interface AlertRowProps {
  alert: UsageAlert;
}

function AlertRow({ alert }: AlertRowProps) {
  return (
    <div
      className={clsx(
        'flex items-start gap-3 p-3 rounded-lg border',
        severityColor(alert.threshold.severity)
      )}
    >
      <div className={clsx('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', severityDot(alert.threshold.severity))} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-surface-100">{alert.message}</p>
        <div className="flex items-center gap-3 mt-1 text-xs text-surface-400">
          <span>
            Current:{' '}
            <span className="text-surface-300 font-medium">
              {alert.threshold.metric.includes('cost')
                ? formatCost(alert.currentValue)
                : formatTokens(alert.currentValue)}
            </span>
          </span>
          <span>
            Threshold:{' '}
            <span className="text-surface-300 font-medium">
              {alert.threshold.operator}{' '}
              {alert.threshold.metric.includes('cost')
                ? formatCost(alert.threshold.value)
                : formatTokens(alert.threshold.value)}
            </span>
          </span>
          <span>{formatRelativeTime(alert.timestamp)}</span>
        </div>
      </div>
      <AlertBadge severity={alert.threshold.severity} />
    </div>
  );
}

// ============================================================
// Threshold add-form (used inside the thresholds section)
// ============================================================

interface NewThresholdForm {
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  value: string;
  severity: AlertSeverity;
}

const defaultThresholdForm: NewThresholdForm = {
  name: '',
  metric: 'daily_cost_usd',
  operator: 'gt',
  value: '',
  severity: 'warning',
};

interface ThresholdsSectionProps {
  thresholds: AlertThreshold[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (t: Omit<AlertThreshold, 'id'>) => void;
}

function ThresholdsSection({ thresholds, onToggle, onDelete, onAdd }: ThresholdsSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewThresholdForm>(defaultThresholdForm);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!form.name.trim()) {
      setFormError('Name is required');
      return;
    }
    const numVal = parseFloat(form.value);
    if (isNaN(numVal) || numVal < 0) {
      setFormError('Value must be a positive number');
      return;
    }
    onAdd({
      name: form.name.trim(),
      metric: form.metric,
      operator: form.operator,
      value: numVal,
      severity: form.severity,
      enabled: true,
    });
    setForm(defaultThresholdForm);
    setFormError(null);
    setShowForm(false);
  };

  return (
    <div className="space-y-3">
      {thresholds.length === 0 && (
        <p className="text-sm text-surface-500 italic">No thresholds configured.</p>
      )}

      {thresholds.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 p-3 bg-surface-800 border border-surface-700 rounded-lg"
        >
          {/* Toggle */}
          <button
            onClick={() => onToggle(t.id)}
            className={clsx(
              'w-9 h-5 rounded-full transition-colors flex-shrink-0 relative',
              t.enabled ? 'bg-primary-500' : 'bg-surface-600'
            )}
            title={t.enabled ? 'Disable threshold' : 'Enable threshold'}
          >
            <span
              className={clsx(
                'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                t.enabled ? 'translate-x-4' : 'translate-x-0.5'
              )}
            />
          </button>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-surface-200">{t.name}</span>
              <AlertBadge severity={t.severity} />
            </div>
            <p className="text-xs text-surface-400 mt-0.5">
              {METRIC_OPTIONS.find((m) => m.value === t.metric)?.label}{' '}
              {t.operator}{' '}
              {t.metric.includes('cost') ? formatCost(t.value) : formatTokens(t.value)}
            </p>
          </div>

          {/* Delete */}
          <button
            onClick={() => onDelete(t.id)}
            className="p-1.5 text-surface-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0"
            title="Delete threshold"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      ))}

      {/* Add form */}
      {showForm ? (
        <div className="bg-surface-800 border border-surface-600 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-surface-200">New Threshold</p>

          <div className="grid grid-cols-2 gap-3">
            {/* Name */}
            <div className="col-span-2">
              <label className="block text-xs text-surface-400 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. High daily cost"
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-primary-500 transition-colors"
              />
            </div>

            {/* Metric */}
            <div>
              <label className="block text-xs text-surface-400 mb-1">Metric</label>
              <select
                value={form.metric}
                onChange={(e) => setForm({ ...form, metric: e.target.value as AlertMetric })}
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500 transition-colors"
              >
                {METRIC_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Operator */}
            <div>
              <label className="block text-xs text-surface-400 mb-1">Operator</label>
              <select
                value={form.operator}
                onChange={(e) => setForm({ ...form, operator: e.target.value as AlertOperator })}
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500 transition-colors"
              >
                {OPERATOR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Value */}
            <div>
              <label className="block text-xs text-surface-400 mb-1">Value</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder={form.metric.includes('cost') ? '10.00' : '100000'}
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-primary-500 transition-colors"
              />
            </div>

            {/* Severity */}
            <div>
              <label className="block text-xs text-surface-400 mb-1">Severity</label>
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value as AlertSeverity })}
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500 transition-colors"
              >
                {SEVERITY_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {formError && (
            <p className="text-xs text-red-400">{formError}</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Add Threshold
            </button>
            <button
              onClick={() => { setShowForm(false); setForm(defaultThresholdForm); setFormError(null); }}
              className="px-4 py-2 text-surface-400 hover:text-white hover:bg-surface-700 text-sm font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-primary-400 hover:text-primary-300 hover:bg-primary-500/10 rounded-lg transition-colors border border-dashed border-surface-600 hover:border-primary-500/50 w-full justify-center"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Threshold
        </button>
      )}
    </div>
  );
}

// ============================================================
// Deep Links Grid
// ============================================================

interface DeepLinksGridProps {
  links: DeepLink[];
}

function DeepLinksGrid({ links }: DeepLinksGridProps) {
  // safeOpenExternal validates the scheme (https: only) before opening, guarding
  // against javascript:, data:, file:, etc. coming from API-sourced DeepLink data.
  const openLink = (url: string) => safeOpenExternal(url);

  return (
    <div className="grid grid-cols-2 gap-3">
      {links.map((link) => (
        <button
          key={link.label}
          onClick={() => openLink(link.url)}
          className="flex items-start gap-3 p-4 bg-surface-800 border border-surface-700 rounded-lg hover:border-primary-500/40 hover:bg-surface-700/50 transition-all text-left group"
        >
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-400 group-hover:bg-primary-500/20 transition-colors">
            {deepLinkIcon(link.icon)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-surface-200 group-hover:text-white transition-colors">
              {link.label}
            </p>
            <p className="text-xs text-surface-500 mt-0.5 line-clamp-2">{link.description}</p>
          </div>
          <svg
            className="w-3.5 h-3.5 text-surface-600 group-hover:text-primary-400 flex-shrink-0 mt-0.5 transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      ))}
    </div>
  );
}

// ============================================================
// Section wrapper
// ============================================================

function Section({ title, children, action }: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-surface-200 uppercase tracking-wide">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

// ============================================================
// Main Panel
// ============================================================

export interface UsagePanelProps {
  projectPath: string;
}

export function UsagePanel({ projectPath }: UsagePanelProps) {
  const summary = useUsageStore((s) => s.summary);
  const config = useUsageStore((s) => s.config);
  const loading = useUsageStore((s) => s.loading);
  const configLoading = useUsageStore((s) => s.configLoading);
  const configSaving = useUsageStore((s) => s.configSaving);
  const error = useUsageStore((s) => s.error);
  const fetchSummary = useUsageStore((s) => s.fetchSummary);
  const fetchConfig = useUsageStore((s) => s.fetchConfig);
  const saveConfig = useUsageStore((s) => s.saveConfig);
  const clearError = useUsageStore((s) => s.clearError);

  // Local state
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showThresholds, setShowThresholds] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [relativeTime, setRelativeTime] = useState('');

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initial fetch
  useEffect(() => {
    void fetchConfig(projectPath);
    void fetchSummary(projectPath);
  }, [projectPath, fetchConfig, fetchSummary]);

  // Update relative time every 30s
  useEffect(() => {
    const update = () => setRelativeTime(formatRelativeTime(summary?.lastFetched ?? null));
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [summary?.lastFetched]);

  // Auto-poll
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    const interval = config?.pollingIntervalMs ?? 60_000;
    if (interval > 0) {
      pollingRef.current = setInterval(() => {
        void fetchSummary(projectPath);
      }, interval);
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [projectPath, config?.pollingIntervalMs, fetchSummary]);

  // Derived values
  // Server-derived: GET /api/usage/config returns a masked view, never the key.
  const hasApiKey = !!config?.hasApiKey;
  const todayCost = summary?.cost?.today?.totalCostUsd ?? 0;
  const monthlyCost = summary?.cost?.monthly?.totalCostUsd ?? 0;
  const todayUsage = summary?.usage?.today;
  const todayTokens = (todayUsage?.totalInputTokens ?? 0) + (todayUsage?.totalOutputTokens ?? 0);
  const activeAlerts = summary?.alerts ?? [];
  const deepLinks = (summary?.deepLinks?.length ?? 0) > 0 ? summary!.deepLinks : DEFAULT_DEEP_LINKS;

  // Determine severity of today's cost based on thresholds
  const costSeverity: AlertSeverity | null = (() => {
    if (!config?.alertThresholds?.length) return null;
    const triggered = activeAlerts.filter((a) => a.threshold.metric === 'daily_cost_usd');
    if (triggered.some((a) => a.threshold.severity === 'critical')) return 'critical';
    if (triggered.some((a) => a.threshold.severity === 'warning')) return 'warning';
    return null;
  })();

  const handleSaveApiKey = useCallback(async () => {
    if (!apiKeyInput.trim()) {
      setKeyError('Please enter your Admin API key');
      return;
    }
    if (!apiKeyInput.startsWith('sk-ant-admin')) {
      setKeyError('Admin API keys must start with "sk-ant-admin"');
      return;
    }
    setKeyError(null);
    setSavingKey(true);
    try {
      const newConfig = {
        adminApiKey: apiKeyInput.trim(),
        alertThresholds: config?.alertThresholds ?? [],
        pollingIntervalMs: config?.pollingIntervalMs ?? 60_000,
      };
      await saveConfig(projectPath, newConfig);
      await fetchSummary(projectPath);
      setApiKeyInput('');
    } finally {
      setSavingKey(false);
    }
  }, [apiKeyInput, config, saveConfig, fetchSummary, projectPath]);

  const handleToggleThreshold = useCallback(
    (id: string) => {
      if (!config) return;
      const updated = config.alertThresholds.map((t) =>
        t.id === id ? { ...t, enabled: !t.enabled } : t
      );
      void saveConfig(projectPath, { ...config, alertThresholds: updated });
    },
    [config, projectPath, saveConfig]
  );

  const handleDeleteThreshold = useCallback(
    (id: string) => {
      if (!config) return;
      const updated = config.alertThresholds.filter((t) => t.id !== id);
      void saveConfig(projectPath, { ...config, alertThresholds: updated });
    },
    [config, projectPath, saveConfig]
  );

  const handleAddThreshold = useCallback(
    (t: Omit<AlertThreshold, 'id'>) => {
      if (!config) return;
      const newThreshold: AlertThreshold = {
        ...t,
        id: `threshold-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      };
      void saveConfig(projectPath, {
        ...config,
        alertThresholds: [...config.alertThresholds, newThreshold],
      });
    },
    [config, projectPath, saveConfig]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
        <div>
          <h2 className="text-lg font-semibold text-white">Usage Monitor</h2>
          <p className="text-sm text-surface-400">
            Anthropic API token usage, costs, and threshold alerts
          </p>
        </div>
        <div className="flex items-center gap-3">
          {summary?.lastFetched && (
            <span className="text-xs text-surface-500">
              Updated {relativeTime}
            </span>
          )}
          <button
            onClick={() => { clearError(); void fetchSummary(projectPath); }}
            disabled={loading}
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors',
              loading
                ? 'text-surface-500 cursor-not-allowed'
                : 'text-surface-400 hover:text-white hover:bg-surface-700'
            )}
          >
            <svg
              className={clsx('w-4 h-4', loading && 'animate-spin')}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1 text-sm">{error}</div>
            <button
              onClick={clearError}
              className="text-red-400 hover:text-red-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Config banner - shown when no API key */}
        {!configLoading && !hasApiKey && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-yellow-400">
                  Configure your Anthropic Admin API key to enable usage monitoring
                </p>
                <p className="text-xs text-yellow-400/70 mt-0.5">
                  An Admin API key is required to access usage and billing data.{' '}
                  <button
                    onClick={() => safeOpenExternal('https://console.anthropic.com/settings/api-keys')}
                    className="underline hover:text-yellow-300 transition-colors"
                  >
                    Learn how to get one
                  </button>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => { setApiKeyInput(e.target.value); setKeyError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveApiKey(); }}
                  placeholder="sk-ant-admin-..."
                  className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-yellow-500/60 pr-10 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors"
                  tabIndex={-1}
                >
                  {showApiKey ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              <button
                onClick={() => void handleSaveApiKey()}
                disabled={savingKey || !apiKeyInput.trim()}
                className={clsx(
                  'px-4 py-2 text-sm font-medium rounded-lg transition-colors flex-shrink-0',
                  savingKey || !apiKeyInput.trim()
                    ? 'bg-surface-600 text-surface-400 cursor-not-allowed'
                    : 'bg-primary-500 hover:bg-primary-600 text-white'
                )}
              >
                {savingKey ? 'Saving...' : 'Save Key'}
              </button>
            </div>
            {keyError && <p className="text-xs text-red-400">{keyError}</p>}
          </div>
        )}

        {/* Overview cards */}
        <Section title="Overview">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard
              title="Today's Cost"
              value={loading ? '...' : formatCost(todayCost)}
              subtitle="Token usage billing"
              severity={costSeverity}
              loading={loading && !summary}
            />
            <MetricCard
              title="Today's Tokens"
              value={loading ? '...' : formatTokens(todayTokens)}
              subtitle={`In: ${formatTokens(todayUsage?.totalInputTokens ?? 0)} / Out: ${formatTokens(todayUsage?.totalOutputTokens ?? 0)}`}
              loading={loading && !summary}
            />
            <MetricCard
              title="Monthly Cost"
              value={loading ? '...' : formatCost(monthlyCost)}
              subtitle="Current billing period"
              loading={loading && !summary}
            />
            <MetricCard
              title="Active Alerts"
              value={loading ? '...' : String(activeAlerts.length)}
              subtitle={activeAlerts.length === 0 ? 'All thresholds clear' : 'Thresholds exceeded'}
              severity={activeAlerts.some((a) => a.threshold.severity === 'critical')
                ? 'critical'
                : activeAlerts.some((a) => a.threshold.severity === 'warning')
                ? 'warning'
                : null}
              loading={loading && !summary}
            />
          </div>
        </Section>

        {/* Active alerts */}
        {activeAlerts.length > 0 && (
          <Section title="Active Alerts">
            <div className="space-y-2">
              {activeAlerts.map((alert) => (
                <AlertRow key={alert.id} alert={alert} />
              ))}
            </div>
          </Section>
        )}

        {/* Threshold configuration */}
        {hasApiKey && (
          <Section
            title="Alert Thresholds"
            action={
              <button
                onClick={() => setShowThresholds((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors"
              >
                {showThresholds ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                    Collapse
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    Configure ({config?.alertThresholds?.length ?? 0})
                  </>
                )}
              </button>
            }
          >
            {showThresholds ? (
              <ThresholdsSection
                thresholds={config?.alertThresholds ?? []}
                onToggle={handleToggleThreshold}
                onDelete={handleDeleteThreshold}
                onAdd={handleAddThreshold}
              />
            ) : (
              <div className="p-3 bg-surface-800 border border-surface-700 rounded-lg">
                <p className="text-sm text-surface-400">
                  {(config?.alertThresholds?.length ?? 0) === 0
                    ? 'No thresholds configured. Click "Configure" to add alert rules.'
                    : `${config!.alertThresholds.length} threshold${config!.alertThresholds.length > 1 ? 's' : ''} configured (${config!.alertThresholds.filter((t) => t.enabled).length} active).`}
                </p>
              </div>
            )}
          </Section>
        )}

        {/* API key management (when key already set) */}
        {hasApiKey && (
          <Section title="API Key">
            <div className="flex items-center justify-between p-3 bg-surface-800 border border-surface-700 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-surface-200 font-medium">Admin API key configured</p>
                  <p className="text-xs text-surface-500">
                    {config?.apiKeyPreview ?? 'sk-ant-admin-…'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (config) {
                    void saveConfig(projectPath, {
                      alertThresholds: config.alertThresholds,
                      pollingIntervalMs: config.pollingIntervalMs,
                      adminApiKey: '',
                    });
                  }
                }}
                className="px-3 py-1.5 text-xs text-surface-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                Remove
              </button>
            </div>

            {/* Show banner for key input again */}
            {!hasApiKey && (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => { setApiKeyInput(e.target.value); setKeyError(null); }}
                    placeholder="sk-ant-admin-..."
                    className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-primary-500 pr-10 transition-colors"
                  />
                </div>
                <button
                  onClick={() => void handleSaveApiKey()}
                  disabled={configSaving || !apiKeyInput.trim()}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-500 hover:bg-primary-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {configSaving ? 'Saving...' : 'Update Key'}
                </button>
              </div>
            )}
          </Section>
        )}

        {/* Polling interval */}
        {hasApiKey && config && (
          <Section title="Auto-Refresh">
            <div className="flex items-center gap-3 p-3 bg-surface-800 border border-surface-700 rounded-lg">
              <svg className="w-4 h-4 text-surface-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <label className="text-sm text-surface-300 flex-1">Polling interval</label>
              <select
                value={config.pollingIntervalMs}
                onChange={(e) => {
                  const ms = Number(e.target.value);
                  void saveConfig(projectPath, { ...config, pollingIntervalMs: ms });
                }}
                className="bg-surface-700 border border-surface-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500 transition-colors"
              >
                <option value={0}>Manual only</option>
                <option value={30_000}>30 seconds</option>
                <option value={60_000}>1 minute</option>
                <option value={300_000}>5 minutes</option>
                <option value={900_000}>15 minutes</option>
                <option value={1_800_000}>30 minutes</option>
              </select>
            </div>
          </Section>
        )}

        {/* Deep links */}
        <Section title="Anthropic Console">
          <DeepLinksGrid links={deepLinks} />
        </Section>

      </div>
    </div>
  );
}
