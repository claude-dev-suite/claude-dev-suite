// SPDX-License-Identifier: MIT
/**
 * Keep credentials out of what the model sees.
 *
 * `docker inspect` returns `Config.Env` verbatim, and `compose config` resolves
 * `${VAR}` interpolation into literal values, so both routinely carry database
 * passwords and API tokens. Values are redacted unless the key is on a short
 * list of names that are never secret; `revealEnv` opts out per call.
 */

export const REDACTED = "[REDACTED]";

const SECRET_KEY_RE = /(PASS|PWD|SECRET|TOKEN|KEY|CREDENTIAL|AUTH|PRIVATE|CERT|SALT|SESSION|COOKIE|DSN|CONN|DATABASE_URL|_URL$|_URI$)/i;
const BENIGN_KEY_RE =
  /^(PATH|HOME|HOSTNAME|LANG|LANGUAGE|LC_[A-Z_]+|TERM|TZ|SHELL|USER|UID|GID|PORT|HOST|NODE_ENV|RAILS_ENV|APP_ENV|FLASK_ENV|ENVIRONMENT|ENV|DEBIAN_FRONTEND|PYTHONUNBUFFERED|PYTHONDONTWRITEBYTECODE|PYTHONPATH|GOPATH|GOROOT|[A-Z0-9_]*_VERSION|[A-Z0-9_]*_HOME|[A-Z0-9_]*_PORT)$/i;

/** True when a variable's value can be shown without opting in. */
export function isBenignEnvKey(key: string): boolean {
  return BENIGN_KEY_RE.test(key) && !SECRET_KEY_RE.test(key);
}

/** `scheme://user:password@host` → `scheme://user:***@host` anywhere in a string. */
export function scrubUrlCredentials(text: string): string {
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):([^\s@/]+)@/gi, "$1:***@");
}

/** Redact a `KEY=VALUE` list (Docker's Config.Env shape). */
export function redactEnvList(env: unknown, reveal: boolean): unknown {
  if (!Array.isArray(env)) return env;
  if (reveal) return env;
  return env.map((entry) => {
    if (typeof entry !== "string") return entry;
    const eq = entry.indexOf("=");
    if (eq < 0) return entry;
    const key = entry.slice(0, eq);
    return isBenignEnvKey(key) ? scrubUrlCredentials(entry) : `${key}=${REDACTED}`;
  });
}

/** Redact a `{KEY: VALUE}` map (compose `environment`, build args). */
export function redactEnvMap(env: unknown, reveal: boolean): unknown {
  if (Array.isArray(env)) return redactEnvList(env, reveal);
  if (!env || typeof env !== "object" || reveal) return env;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(env as Record<string, unknown>)) {
    if (v === null || v === undefined) out[k] = v;
    else out[k] = isBenignEnvKey(k) ? (typeof v === "string" ? scrubUrlCredentials(v) : v) : REDACTED;
  }
  return out;
}

/** Redact `Config.Env` (and `ContainerConfig.Env` on old image inspects) in an inspect document. */
export function redactInspect(doc: unknown, reveal: boolean): unknown {
  if (reveal) return doc;
  if (Array.isArray(doc)) return doc.map((d) => redactInspect(d, reveal));
  if (!doc || typeof doc !== "object") return doc;
  const obj = { ...(doc as Record<string, unknown>) };
  for (const key of ["Config", "ContainerConfig"]) {
    const cfg = obj[key];
    if (cfg && typeof cfg === "object") {
      obj[key] = { ...(cfg as Record<string, unknown>), Env: redactEnvList((cfg as Record<string, unknown>).Env, false) };
    }
  }
  return obj;
}

/** Redact environment + secrets content in `docker compose config --format json` output. */
export function redactComposeConfig(doc: unknown, reveal: boolean): unknown {
  if (reveal || !doc || typeof doc !== "object") return doc;
  const obj = { ...(doc as Record<string, unknown>) };
  const services = obj.services;
  if (services && typeof services === "object") {
    const out: Record<string, unknown> = {};
    for (const [name, svc] of Object.entries(services as Record<string, unknown>)) {
      if (!svc || typeof svc !== "object") {
        out[name] = svc;
        continue;
      }
      const s = { ...(svc as Record<string, unknown>) };
      if ("environment" in s) s.environment = redactEnvMap(s.environment, false);
      const build = s.build;
      if (build && typeof build === "object" && "args" in (build as object)) {
        s.build = { ...(build as Record<string, unknown>), args: redactEnvMap((build as Record<string, unknown>).args, false) };
      }
      out[name] = s;
    }
    obj.services = out;
  }
  for (const key of ["secrets", "configs"]) {
    const block = obj[key];
    if (block && typeof block === "object") {
      const out: Record<string, unknown> = {};
      for (const [name, def] of Object.entries(block as Record<string, unknown>)) {
        if (def && typeof def === "object" && "content" in (def as object)) {
          out[name] = { ...(def as Record<string, unknown>), content: REDACTED };
        } else {
          out[name] = def;
        }
      }
      obj[key] = out;
    }
  }
  return obj;
}
