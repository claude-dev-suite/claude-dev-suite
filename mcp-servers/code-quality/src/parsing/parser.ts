// SPDX-License-Identifier: MIT
/**
 * tree-sitter (WASM) parsing.
 *
 * The runtime and grammars are inlined (see scripts/gen-wasm-assets.mjs), so
 * parsing needs nothing but Node. Languages load lazily on first use.
 */

import { gunzipSync } from 'zlib';
import { Parser, Language, type Tree } from 'web-tree-sitter';
import { WASM_ASSETS } from '../generated/wasm-assets.js';
import type { LanguageId } from '../core/paths.js';

let initPromise: Promise<void> | null = null;
const languages = new Map<LanguageId, Promise<Language>>();
const parsers = new Map<LanguageId, Parser>();

function asset(id: string): Uint8Array {
  const b64 = WASM_ASSETS[id];
  if (!b64) throw new Error(`No inlined WASM asset "${id}"`);
  return new Uint8Array(gunzipSync(Buffer.from(b64, 'base64')));
}

function init(): Promise<void> {
  if (!initPromise) {
    initPromise = Parser.init({ wasmBinary: asset('runtime') }).catch((err: unknown) => {
      initPromise = null;
      throw new Error(`tree-sitter runtime failed to initialise: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
  return initPromise;
}

async function language(lang: LanguageId): Promise<Language> {
  await init();
  let p = languages.get(lang);
  if (!p) {
    p = Language.load(asset(lang));
    languages.set(lang, p);
  }
  return p;
}

export async function getParser(lang: LanguageId): Promise<Parser> {
  let parser = parsers.get(lang);
  if (!parser) {
    const l = await language(lang);
    parser = new Parser();
    parser.setLanguage(l);
    parsers.set(lang, parser);
  }
  return parser;
}

/**
 * Parse `content`; the caller MUST `tree.delete()` when done (WASM memory is
 * not garbage-collected). Prefer `withTree`.
 */
export async function parse(lang: LanguageId, content: string): Promise<Tree> {
  const parser = await getParser(lang);
  const tree = parser.parse(content);
  if (!tree) throw new Error(`tree-sitter returned no tree for ${lang}`);
  return tree;
}

export async function withTree<T>(lang: LanguageId, content: string, fn: (tree: Tree) => T): Promise<T> {
  const tree = await parse(lang, content);
  try {
    return fn(tree);
  } finally {
    tree.delete();
  }
}
