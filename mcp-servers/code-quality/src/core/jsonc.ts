// SPDX-License-Identifier: MIT
/** Parse JSON with comments and trailing commas (tsconfig.json, biome.jsonc…). */
export function parseJsonc(text: string): any {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
    } else if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
    } else {
      out += ch;
      i++;
    }
  }
  out = out.replace(/,(\s*[}\]])/g, '$1');
  if (out.charCodeAt(0) === 0xfeff) out = out.slice(1);
  return JSON.parse(out);
}
