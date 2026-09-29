// SPDX-License-Identifier: MIT
/**
 * Auth helpers: bearer, basic, API key (header/query), digest, and OAuth2
 * client-credentials / password grants with an in-memory token cache (honours
 * expires_in, refreshes with refresh_token when the server issued one).
 */

import { z } from 'zod';
import { send, setHeader, type TlsOptions } from './client.js';
import type { Redactor } from '../util/redact.js';

export const AuthSchema = z
  .object({
    type: z.enum(['none', 'bearer', 'basic', 'apiKey', 'digest', 'oauth2']),
    token: z.string().optional().describe('bearer: the token'),
    username: z.string().optional().describe('basic/digest/oauth2 password grant'),
    password: z.string().optional().describe('basic/digest/oauth2 password grant'),
    name: z.string().optional().describe('apiKey: header or query parameter name'),
    value: z.string().optional().describe('apiKey: the key'),
    in: z.enum(['header', 'query']).optional().describe('apiKey location (default header)'),
    grant: z.enum(['client_credentials', 'password']).optional().describe('oauth2 grant type'),
    tokenUrl: z.string().optional().describe('oauth2 token endpoint'),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    scope: z.string().optional(),
    audience: z.string().optional(),
    clientAuth: z.enum(['basic', 'body']).optional().describe('oauth2: send client creds as Basic (default) or form body'),
    extraParams: z.record(z.string(), z.string()).optional().describe('oauth2: extra token-request form fields'),
  })
  .describe('Authentication applied to the request');

export type AuthSpec = z.infer<typeof AuthSchema>;

interface CachedToken {
  accessToken: string;
  tokenType: string;
  expiresAt: number;
  refreshToken?: string;
}

const tokenCache = new Map<string, CachedToken>();
const EXPIRY_SKEW_MS = 30_000;

function cacheKey(a: AuthSpec): string {
  // An in-memory map key, never persisted or logged: the spec (secret included)
  // is already in this process's memory, so hashing it protected nothing.
  return JSON.stringify([a.grant, a.tokenUrl, a.clientId, a.clientSecret, a.username, a.password, a.scope, a.audience, a.extraParams]);
}

export function clearTokenCache(): number {
  const n = tokenCache.size;
  tokenCache.clear();
  return n;
}

export function tokenCacheInfo(): Array<{ key: string; expiresAt: string; hasRefreshToken: boolean }> {
  return [...tokenCache.entries()].map(([k, v]) => ({
    key: k.slice(0, 12),
    expiresAt: new Date(v.expiresAt).toISOString(),
    hasRefreshToken: Boolean(v.refreshToken),
  }));
}

function need<T>(v: T | undefined, what: string): T {
  if (v === undefined || v === null || v === '') throw new Error(`auth: ${what} is required`);
  return v;
}

async function requestToken(
  a: AuthSpec,
  form: Record<string, string>,
  ctx: { tls?: TlsOptions; proxy?: string; timeoutMs?: number }
): Promise<CachedToken> {
  const tokenUrl = need(a.tokenUrl, 'tokenUrl');
  const clientId = need(a.clientId, 'clientId');
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };
  const body: Record<string, string> = { ...form, ...(a.extraParams ?? {}) };
  if (a.scope) body.scope = a.scope;
  if (a.audience) body.audience = a.audience;
  if ((a.clientAuth ?? 'basic') === 'basic') {
    const cred = `${encodeURIComponent(clientId)}:${encodeURIComponent(a.clientSecret ?? '')}`;
    headers.Authorization = `Basic ${Buffer.from(cred).toString('base64')}`;
  } else {
    body.client_id = clientId;
    if (a.clientSecret) body.client_secret = a.clientSecret;
  }
  const res = await send({
    method: 'POST',
    url: tokenUrl,
    headers,
    body: Buffer.from(new URLSearchParams(body).toString()),
    timeoutMs: ctx.timeoutMs ?? 30_000,
    tls: ctx.tls,
    proxy: ctx.proxy,
    maxResponseBytes: 1024 * 1024,
  });
  const text = res.body.toString('utf8');
  let json: Record<string, unknown> | undefined;
  try {
    json = JSON.parse(text);
  } catch {
    // Some legacy servers answer form-encoded.
    const p = new URLSearchParams(text);
    if (p.get('access_token')) json = Object.fromEntries(p.entries());
  }
  if (res.status < 200 || res.status >= 300 || !json || typeof json.access_token !== 'string') {
    const err = json && (json.error_description || json.error);
    throw new Error(
      `OAuth2 token request to ${tokenUrl} failed: HTTP ${res.status}${err ? ` — ${String(err)}` : ''}`
    );
  }
  const expiresIn = Number(json.expires_in);
  return {
    accessToken: json.access_token,
    tokenType: typeof json.token_type === 'string' ? json.token_type : 'Bearer',
    expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 3600_000),
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
  };
}

export async function getOAuth2Token(
  a: AuthSpec,
  ctx: { tls?: TlsOptions; proxy?: string; timeoutMs?: number } = {}
): Promise<{ token: CachedToken; cached: boolean }> {
  const key = cacheKey(a);
  const hit = tokenCache.get(key);
  if (hit && hit.expiresAt - EXPIRY_SKEW_MS > Date.now()) return { token: hit, cached: true };

  if (hit?.refreshToken) {
    try {
      const refreshed = await requestToken(a, { grant_type: 'refresh_token', refresh_token: hit.refreshToken }, ctx);
      if (!refreshed.refreshToken) refreshed.refreshToken = hit.refreshToken;
      tokenCache.set(key, refreshed);
      return { token: refreshed, cached: false };
    } catch {
      // Fall through to a fresh grant.
    }
  }

  const grant = a.grant ?? 'client_credentials';
  const form: Record<string, string> =
    grant === 'password'
      ? { grant_type: 'password', username: need(a.username, 'username'), password: need(a.password, 'password') }
      : { grant_type: 'client_credentials' };
  const token = await requestToken(a, form, ctx);
  tokenCache.set(key, token);
  return { token, cached: false };
}

export interface AppliedAuth {
  digest?: { username: string; password: string };
  /** What was applied, for the request echo (no secret values). */
  summary?: string;
}

/**
 * Apply auth to headers/query in place. Every secret used is registered with
 * the redactor so it cannot leak back through the result.
 */
export async function applyAuth(
  auth: AuthSpec | undefined,
  headers: Record<string, string>,
  query: URLSearchParams,
  redactor: Redactor,
  ctx: { tls?: TlsOptions; proxy?: string; timeoutMs?: number } = {}
): Promise<AppliedAuth> {
  if (!auth || auth.type === 'none') return {};
  switch (auth.type) {
    case 'bearer': {
      const token = need(auth.token, 'token');
      redactor.add(token);
      setHeader(headers, 'Authorization', `Bearer ${token}`);
      return { summary: 'bearer' };
    }
    case 'basic': {
      const user = need(auth.username, 'username');
      const pass = auth.password ?? '';
      const b64 = Buffer.from(`${user}:${pass}`).toString('base64');
      redactor.add(pass);
      redactor.add(b64);
      setHeader(headers, 'Authorization', `Basic ${b64}`);
      return { summary: `basic (${user})` };
    }
    case 'apiKey': {
      const name = need(auth.name, 'name');
      const value = need(auth.value, 'value');
      redactor.add(value);
      if ((auth.in ?? 'header') === 'query') query.set(name, value);
      else setHeader(headers, name, value);
      return { summary: `apiKey (${auth.in ?? 'header'}: ${name})` };
    }
    case 'digest': {
      const username = need(auth.username, 'username');
      const password = need(auth.password, 'password');
      redactor.add(password);
      return { digest: { username, password }, summary: `digest (${username})` };
    }
    case 'oauth2': {
      redactor.add(auth.clientSecret);
      redactor.add(auth.password);
      const { token, cached } = await getOAuth2Token(auth, ctx);
      redactor.add(token.accessToken);
      redactor.add(token.refreshToken);
      const scheme = /^bearer$/i.test(token.tokenType) ? 'Bearer' : token.tokenType;
      setHeader(headers, 'Authorization', `${scheme} ${token.accessToken}`);
      return { summary: `oauth2 ${auth.grant ?? 'client_credentials'} (${cached ? 'cached token' : 'new token'})` };
    }
  }
  return {};
}
