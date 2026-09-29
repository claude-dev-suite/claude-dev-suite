// SPDX-License-Identifier: MIT
/**
 * A small RFC 6265 cookie jar (domain/path matching, Secure, Max-Age/Expires)
 * plus the named-session registry the tools use (`session: "<name>"`).
 */

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  hostOnly: boolean;
  path: string;
  expires?: number; // epoch ms
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
}

function defaultPath(url: URL): string {
  const p = url.pathname;
  if (!p.startsWith('/') || p === '/') return '/';
  const idx = p.lastIndexOf('/');
  return idx <= 0 ? '/' : p.slice(0, idx);
}

function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith('.' + domain);
}

function pathMatches(reqPath: string, cookiePath: string): boolean {
  if (reqPath === cookiePath) return true;
  if (!reqPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith('/') || reqPath[cookiePath.length] === '/';
}

export function parseSetCookie(header: string, url: URL, now = Date.now()): Cookie | null {
  const parts = header.split(';');
  const first = parts.shift() ?? '';
  const eq = first.indexOf('=');
  if (eq <= 0) return null;
  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
  const host = url.hostname.toLowerCase();
  const cookie: Cookie = {
    name,
    value,
    domain: host,
    hostOnly: true,
    path: defaultPath(url),
    secure: false,
    httpOnly: false,
  };
  let maxAgeSeen = false;
  for (const raw of parts) {
    const i = raw.indexOf('=');
    const key = (i < 0 ? raw : raw.slice(0, i)).trim().toLowerCase();
    const val = i < 0 ? '' : raw.slice(i + 1).trim();
    switch (key) {
      case 'domain': {
        const d = val.replace(/^\./, '').toLowerCase();
        if (!d) break;
        if (!domainMatches(host, d)) return null; // cookie for a foreign domain: reject
        cookie.domain = d;
        cookie.hostOnly = false;
        break;
      }
      case 'path':
        if (val.startsWith('/')) cookie.path = val;
        break;
      case 'max-age': {
        const n = Number(val);
        if (Number.isFinite(n)) {
          cookie.expires = now + n * 1000;
          maxAgeSeen = true;
        }
        break;
      }
      case 'expires':
        if (!maxAgeSeen) {
          const t = Date.parse(val);
          if (!Number.isNaN(t)) cookie.expires = t;
        }
        break;
      case 'secure':
        cookie.secure = true;
        break;
      case 'httponly':
        cookie.httpOnly = true;
        break;
      case 'samesite':
        cookie.sameSite = val;
        break;
    }
  }
  return cookie;
}

export class CookieJar {
  private cookies: Cookie[] = [];

  store(url: URL, setCookieHeaders: string[], now = Date.now()): void {
    for (const h of setCookieHeaders) {
      const c = parseSetCookie(h, url, now);
      if (!c) continue;
      this.cookies = this.cookies.filter(
        (x) => !(x.name === c.name && x.domain === c.domain && x.path === c.path)
      );
      if (c.expires === undefined || c.expires > now) this.cookies.push(c);
    }
  }

  /** The Cookie header value for a request to `url`, or undefined. */
  header(url: URL, now = Date.now()): string | undefined {
    this.cookies = this.cookies.filter((c) => c.expires === undefined || c.expires > now);
    const host = url.hostname.toLowerCase();
    const secure = url.protocol === 'https:' || url.protocol === 'wss:';
    const matching = this.cookies
      .filter((c) => (c.hostOnly ? c.domain === host : domainMatches(host, c.domain)))
      .filter((c) => pathMatches(url.pathname || '/', c.path))
      .filter((c) => !c.secure || secure || host === 'localhost' || host === '127.0.0.1')
      .sort((a, b) => b.path.length - a.path.length);
    if (matching.length === 0) return undefined;
    return matching.map((c) => `${c.name}=${c.value}`).join('; ');
  }

  list(): Cookie[] {
    return [...this.cookies];
  }

  clear(): void {
    this.cookies = [];
  }
}

interface Session {
  jar: CookieJar;
  createdAt: number;
  lastUsed: number;
}

const MAX_SESSIONS = 50;
const sessions = new Map<string, Session>();

export function getSessionJar(name: string): CookieJar {
  let s = sessions.get(name);
  if (!s) {
    if (sessions.size >= MAX_SESSIONS) {
      // Evict the least-recently used session.
      const oldest = [...sessions.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
      if (oldest) sessions.delete(oldest[0]);
    }
    s = { jar: new CookieJar(), createdAt: Date.now(), lastUsed: Date.now() };
    sessions.set(name, s);
  }
  s.lastUsed = Date.now();
  return s.jar;
}

export function listSessions(): Array<{ name: string; cookies: number; createdAt: string; lastUsed: string }> {
  return [...sessions.entries()].map(([name, s]) => ({
    name,
    cookies: s.jar.list().length,
    createdAt: new Date(s.createdAt).toISOString(),
    lastUsed: new Date(s.lastUsed).toISOString(),
  }));
}

export function peekSession(name: string): CookieJar | undefined {
  return sessions.get(name)?.jar;
}

export function deleteSession(name?: string): number {
  if (name === undefined) {
    const n = sessions.size;
    sessions.clear();
    return n;
  }
  return sessions.delete(name) ? 1 : 0;
}
