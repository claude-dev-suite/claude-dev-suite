// SPDX-License-Identifier: MIT
/**
 * Guarded HTTP client.
 *
 * Every hop — the initial URL and each redirect Location — goes through
 * `@dev-suite/shared`'s SSRF guard, which normalises decimal/hex/octal IPv4
 * literals, understands IPv6 (loopback, ULA, link-local, IPv4-mapped) and
 * resolves hostnames so a name pointing into a blocked range is refused.
 * The cloud-metadata range 169.254.0.0/16 is refused unconditionally; other
 * private ranges follow API_EXPLORER_ALLOW_PRIVATE_URLS (default: allowed,
 * because local dev servers are what this tool mostly reads).
 *
 * The previous guard only matched a dotted 169.254.x.x literal and let
 * `fetch` follow redirects on its own, so any public URL redirecting to the
 * metadata service was fetched.
 */

import { validateUrl } from "@dev-suite/shared";
import { getSettings } from "./env.js";
import { redactUrl } from "./redact.js";

export class HttpError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) {
    super(message);
    this.name = "HttpError";
  }
}

export interface FetchTextOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export interface FetchTextResult {
  text: string;
  contentType: string;
  status: number;
  finalUrl: string;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
type UrlGuard = (url: string) => Promise<void>;

let fetchImpl: FetchLike = (input, init) => fetch(input, init);
let urlGuard: UrlGuard = (url) => validateUrl(url, { allowPrivate: getSettings().allowPrivate });

/** Test seam: replace the network layer. Returns a restore function. */
export function setFetchImpl(impl: FetchLike): () => void {
  const prev = fetchImpl;
  fetchImpl = impl;
  return () => {
    fetchImpl = prev;
  };
}

/** Test seam: replace the SSRF guard (e.g. to avoid DNS in unit tests). */
export function setUrlGuard(guard: UrlGuard): () => void {
  const prev = urlGuard;
  urlGuard = guard;
  return () => {
    urlGuard = prev;
  };
}

export async function guardUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpError(`Invalid URL: ${redactUrl(url)}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HttpError(`Only http(s) URLs can be fetched, got ${parsed.protocol}`);
  }
  await urlGuard(url);
}

const REDIRECT = new Set([301, 302, 303, 307, 308]);

async function readCapped(response: Response, maxBytes: number, url: string): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(`Response from ${redactUrl(url)} is ${declared} bytes, over the ${maxBytes}-byte limit (API_EXPLORER_MAX_SPEC_BYTES)`);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(`Response from ${redactUrl(url)} exceeded the ${maxBytes}-byte limit (API_EXPLORER_MAX_SPEC_BYTES)`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}

async function fetchOnce(url: string, opts: FetchTextOptions): Promise<FetchTextResult> {
  const settings = getSettings();
  const timeoutMs = opts.timeoutMs ?? settings.timeoutMs;
  const maxBytes = opts.maxBytes ?? settings.maxSpecBytes;
  const maxRedirects = opts.maxRedirects ?? 5;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let current = url;
  let method = opts.method ?? "GET";
  let body = opts.body;
  let headers: Record<string, string> = { ...(opts.headers ?? {}) };
  const origin = new URL(url).origin;

  try {
    for (let hop = 0; ; hop++) {
      await guardUrl(current);
      let response: Response;
      try {
        response = await fetchImpl(current, {
          method,
          headers,
          body,
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new HttpError(`Timeout fetching ${redactUrl(current)} after ${timeoutMs}ms`, undefined, true);
        }
        const msg = error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : String(error);
        throw new HttpError(`Network error fetching ${redactUrl(current)}: ${msg}`, undefined, true);
      }

      if (REDIRECT.has(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new HttpError(`Redirect ${response.status} from ${redactUrl(current)} has no Location header`);
        if (hop >= maxRedirects) throw new HttpError(`Too many redirects (max ${maxRedirects}) fetching ${redactUrl(url)}`);
        const next = new URL(location, current).toString();
        // Configured credentials belong to the configured origin only.
        if (new URL(next).origin !== origin) headers = {};
        if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
          method = "GET";
          body = undefined;
        }
        current = next;
        continue;
      }

      if (!response.ok) {
        const retryable = response.status >= 500 || response.status === 429;
        throw new HttpError(
          `HTTP ${response.status} ${response.statusText} fetching ${redactUrl(current)}`,
          response.status,
          retryable
        );
      }

      const text = await readCapped(response, maxBytes, current);
      return {
        text,
        contentType: response.headers.get("content-type") ?? "",
        status: response.status,
        finalUrl: current,
      };
    }
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof HttpError)) {
      throw new HttpError(`Timeout fetching ${redactUrl(current)} after ${timeoutMs}ms`, undefined, true);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a URL as text. Retries only transient failures (network, timeout,
 * 5xx, 429) — an SSRF refusal, a 404 or an oversized body is final.
 */
export async function fetchText(url: string, opts: FetchTextOptions = {}): Promise<FetchTextResult> {
  const retries = getSettings().retryCount;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchOnce(url, opts);
    } catch (error) {
      lastError = error;
      if (!(error instanceof HttpError) || !error.retryable || attempt === retries) break;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 300));
    }
  }
  throw lastError;
}
