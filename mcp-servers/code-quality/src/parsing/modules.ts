// SPDX-License-Identifier: MIT
/**
 * Import/export extraction from syntax trees, per language.
 *
 * Only what module resolution and dead-code analysis need: specifiers with
 * the names they bind, and what a module exports (including re-exports).
 */

import type { Node, Tree } from 'web-tree-sitter';
import type { LanguageId } from '../core/paths.js';

export interface ImportBinding {
  /** Name in the exporting module: an export name, 'default', or '*' (namespace/all). */
  imported: string;
  local: string;
}

export interface ImportRecord {
  specifier: string;
  line: number;
  kind: 'static' | 'dynamic' | 'require' | 'reexport' | 'side-effect';
  typeOnly: boolean;
  /** Bindings; `[{imported:'*'}]` means every export may be used. */
  names: ImportBinding[];
  /** Python: number of leading dots of a relative import. */
  level?: number;
  /** Java: `import a.b.*`; Rust: `use a::*`. */
  wildcard?: boolean;
}

export interface ExportRecord {
  name: string;
  line: number;
  typeOnly: boolean;
}

export interface ReExportRecord {
  specifier: string;
  line: number;
  /** `null` = `export * from`; otherwise imported → exported pairs. */
  names: Array<{ imported: string; exported: string }> | null;
}

export interface ModuleInfo {
  imports: ImportRecord[];
  exports: ExportRecord[];
  reexports: ReExportRecord[];
  /** module.exports / exports.x / `export =`: exports cannot be enumerated reliably. */
  commonJs: boolean;
  /** Python: top-level function/class definitions. */
  definitions: Array<{ name: string; line: number; kind: 'function' | 'class' }>;
  /** Java package / Go package clause. */
  packageName?: string;
  /** Rust `mod x;` declarations (file modules). */
  modDecls: string[];
}

function stringValue(node: Node | null | undefined): string | null {
  if (!node) return null;
  const t = node.text;
  if (/^(['"`])/.test(t)) {
    const inner = t.slice(1, -1);
    return inner.includes('${') ? null : inner;
  }
  return null;
}

function line(n: Node): number {
  return n.startPosition.row + 1;
}

function hasToken(node: Node, token: string): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c && !c.isNamed && c.type === token) return true;
  }
  return false;
}

function emptyInfo(): ModuleInfo {
  return { imports: [], exports: [], reexports: [], commonJs: false, definitions: [], modDecls: [] };
}

function patternNames(node: Node, out: string[]): void {
  if (node.type === 'identifier' || node.type === 'shorthand_property_identifier_pattern') {
    out.push(node.text);
    return;
  }
  for (const c of node.namedChildren) {
    if (!c) continue;
    if (c.type === 'pair_pattern') {
      const v = c.childForFieldName('value');
      if (v) patternNames(v, out);
    } else if (c.type !== 'property_identifier') {
      patternNames(c, out);
    }
  }
}

function jsModule(tree: Tree): ModuleInfo {
  const info = emptyInfo();
  const root = tree.rootNode;

  const visitTop = (stmt: Node) => {
    if (stmt.type === 'import_statement') {
      const source = stringValue(stmt.childForFieldName('source'));
      const typeOnly = hasToken(stmt, 'type') || /^import\s+type\s/.test(stmt.text);
      const req = stmt.namedChildren.find((c) => c?.type === 'import_require_clause');
      if (req) {
        const s = stringValue(req.childForFieldName('source'));
        if (s) info.imports.push({ specifier: s, line: line(stmt), kind: 'require', typeOnly: false, names: [{ imported: '*', local: '*' }] });
        return;
      }
      if (source === null) return;
      const clause = stmt.namedChildren.find((c) => c?.type === 'import_clause');
      const names: ImportBinding[] = [];
      if (clause) {
        for (const c of clause.namedChildren) {
          if (!c) continue;
          if (c.type === 'identifier') names.push({ imported: 'default', local: c.text });
          else if (c.type === 'namespace_import') names.push({ imported: '*', local: c.namedChild(0)?.text ?? '*' });
          else if (c.type === 'named_imports') {
            for (const s of c.namedChildren) {
              if (s?.type !== 'import_specifier') continue;
              const nm = s.childForFieldName('name');
              const alias = s.childForFieldName('alias');
              const imported = stringValue(nm) ?? nm?.text ?? '';
              names.push({ imported, local: alias?.text ?? imported });
            }
          }
        }
      }
      info.imports.push({
        specifier: source,
        line: line(stmt),
        kind: clause ? 'static' : 'side-effect',
        typeOnly,
        names,
      });
      return;
    }
    if (stmt.type === 'export_statement') {
      const source = stringValue(stmt.childForFieldName('source'));
      const typeOnly = /^export\s+type\s/.test(stmt.text);
      const clause = stmt.namedChildren.find((c) => c?.type === 'export_clause');
      if (source !== null) {
        const ns = stmt.namedChildren.find((c) => c?.type === 'namespace_export');
        if (ns) {
          const exported = ns.namedChild(0)?.text ?? '*';
          info.reexports.push({ specifier: source, line: line(stmt), names: [{ imported: '*', exported }] });
          info.exports.push({ name: exported, line: line(stmt), typeOnly });
        } else if (clause) {
          const pairs = clause.namedChildren
            .filter((s): s is Node => s?.type === 'export_specifier')
            .map((s) => {
              const nm = s.childForFieldName('name');
              const imported = stringValue(nm) ?? nm?.text ?? '';
              const alias = s.childForFieldName('alias');
              return { imported, exported: stringValue(alias) ?? alias?.text ?? imported };
            });
          info.reexports.push({ specifier: source, line: line(stmt), names: pairs });
          for (const p of pairs) info.exports.push({ name: p.exported, line: line(stmt), typeOnly });
        } else {
          info.reexports.push({ specifier: source, line: line(stmt), names: null });
        }
        return;
      }
      if (hasToken(stmt, 'default')) {
        info.exports.push({ name: 'default', line: line(stmt), typeOnly: false });
        return;
      }
      if (hasToken(stmt, '=')) {
        info.commonJs = true; // TS `export = x`
        return;
      }
      if (clause) {
        for (const s of clause.namedChildren) {
          if (s?.type !== 'export_specifier') continue;
          const nm = s.childForFieldName('name');
          const alias = s.childForFieldName('alias');
          info.exports.push({ name: stringValue(alias) ?? alias?.text ?? nm?.text ?? '', line: line(stmt), typeOnly });
        }
        return;
      }
      const decl = stmt.childForFieldName('declaration');
      if (decl) {
        const isType = /^(type_alias_declaration|interface_declaration)$/.test(decl.type);
        if (decl.type === 'lexical_declaration' || decl.type === 'variable_declaration') {
          for (const d of decl.namedChildren) {
            if (d?.type !== 'variable_declarator') continue;
            const names: string[] = [];
            const nm = d.childForFieldName('name');
            if (nm) patternNames(nm, names);
            for (const n of names) info.exports.push({ name: n, line: line(d), typeOnly: false });
          }
        } else {
          const nm = decl.childForFieldName('name');
          if (nm) info.exports.push({ name: stringValue(nm) ?? nm.text, line: line(decl), typeOnly: isType || typeOnly });
        }
      }
    }
  };

  for (const stmt of root.namedChildren) if (stmt) visitTop(stmt);
  // `declare module 'x' { export … }` blocks describe other modules — ignored.

  // require('x'), import('x'), module.exports / exports.x anywhere.
  for (const call of root.descendantsOfType('call_expression')) {
    if (!call) continue;
    const fn = call.childForFieldName('function');
    const args = call.childForFieldName('arguments');
    const first = args?.namedChild(0);
    const spec = stringValue(first);
    if (!fn || spec === null) continue;
    if (fn.type === 'import') {
      info.imports.push({ specifier: spec, line: line(call), kind: 'dynamic', typeOnly: false, names: [{ imported: '*', local: '*' }] });
    } else if (fn.type === 'identifier' && fn.text === 'require') {
      info.imports.push({ specifier: spec, line: line(call), kind: 'require', typeOnly: false, names: [{ imported: '*', local: '*' }] });
    } else if (/^(jest|vi)\.(mock|requireActual|importActual)$/.test(fn.text) || fn.text === 'require.resolve') {
      info.imports.push({ specifier: spec, line: line(call), kind: 'dynamic', typeOnly: false, names: [{ imported: '*', local: '*' }] });
    }
  }
  for (const asg of root.descendantsOfType('assignment_expression')) {
    const left = asg?.childForFieldName('left');
    if (left && /^(module\.exports|exports)\b/.test(left.text)) {
      info.commonJs = true;
      break;
    }
  }
  return info;
}

function pythonModule(tree: Tree): ModuleInfo {
  const info = emptyInfo();
  const root = tree.rootNode;
  const top = (stmt: Node) => {
    if (stmt.type === 'import_statement') {
      for (const c of stmt.namedChildren) {
        if (!c) continue;
        const nameNode = c.type === 'aliased_import' ? c.childForFieldName('name') : c;
        const alias = c.type === 'aliased_import' ? c.childForFieldName('alias')?.text : undefined;
        if (!nameNode) continue;
        const mod = nameNode.text;
        info.imports.push({
          specifier: mod,
          line: line(stmt),
          kind: 'static',
          typeOnly: false,
          names: [{ imported: '*', local: alias ?? mod.split('.')[0] }],
          level: 0,
        });
      }
    } else if (stmt.type === 'import_from_statement') {
      const modNode = stmt.childForFieldName('module_name');
      let level = 0;
      let mod = '';
      if (modNode?.type === 'relative_import') {
        const prefix = modNode.namedChildren.find((c) => c?.type === 'import_prefix');
        level = prefix ? prefix.text.length : 0;
        mod = modNode.namedChildren.find((c) => c?.type === 'dotted_name')?.text ?? '';
      } else if (modNode) {
        mod = modNode.text;
      }
      const names: ImportBinding[] = [];
      let wildcard = false;
      for (let i = 0; i < stmt.childCount; i++) {
        const c = stmt.child(i);
        if (!c) continue;
        if (c.type === 'wildcard_import') wildcard = true;
        if (stmt.fieldNameForChild(i) !== 'name') continue;
        if (c.type === 'aliased_import') {
          names.push({ imported: c.childForFieldName('name')?.text ?? '', local: c.childForFieldName('alias')?.text ?? '' });
        } else {
          names.push({ imported: c.text, local: c.text });
        }
      }
      info.imports.push({
        specifier: mod,
        line: line(stmt),
        kind: 'static',
        typeOnly: false,
        names: wildcard ? [{ imported: '*', local: '*' }] : names,
        level,
        wildcard,
      });
    } else if (stmt.type === 'function_definition' || stmt.type === 'class_definition') {
      const nm = stmt.childForFieldName('name');
      if (nm) info.definitions.push({ name: nm.text, line: line(stmt), kind: stmt.type === 'class_definition' ? 'class' : 'function' });
    } else if (stmt.type === 'decorated_definition') {
      // Decorated definitions are usually registered (routes, fixtures, CLI commands): not dead.
    } else if (stmt.type === 'if_statement' || stmt.type === 'try_statement') {
      // `try: import x except ImportError` and TYPE_CHECKING blocks.
      for (const block of stmt.descendantsOfType(['import_statement', 'import_from_statement'])) if (block) top(block);
    }
  };
  for (const stmt of root.namedChildren) if (stmt) top(stmt);
  // Function-local imports still create dependencies.
  for (const stmt of root.descendantsOfType(['import_statement', 'import_from_statement'])) {
    if (stmt && stmt.parent?.type !== 'module' && !info.imports.some((i) => i.line === line(stmt))) top(stmt);
  }
  return info;
}

function goModule(tree: Tree): ModuleInfo {
  const info = emptyInfo();
  for (const spec of tree.rootNode.descendantsOfType('import_spec')) {
    const p = spec?.childForFieldName('path');
    const s = stringValue(p);
    if (spec && s !== null) info.imports.push({ specifier: s, line: line(spec), kind: 'static', typeOnly: false, names: [{ imported: '*', local: '*' }] });
  }
  const pkg = tree.rootNode.namedChildren.find((c) => c?.type === 'package_clause');
  info.packageName = pkg?.namedChild(0)?.text;
  return info;
}

function javaModule(tree: Tree): ModuleInfo {
  const info = emptyInfo();
  for (const stmt of tree.rootNode.namedChildren) {
    if (!stmt) continue;
    if (stmt.type === 'package_declaration') {
      info.packageName = stmt.namedChildren.find((c) => c && /identifier/.test(c.type))?.text;
    } else if (stmt.type === 'import_declaration') {
      const id = stmt.namedChildren.find((c) => c && /identifier/.test(c.type));
      if (!id) continue;
      const wildcard = stmt.namedChildren.some((c) => c?.type === 'asterisk');
      const isStatic = hasToken(stmt, 'static');
      info.imports.push({
        specifier: id.text,
        line: line(stmt),
        kind: 'static',
        typeOnly: false,
        names: [{ imported: isStatic ? 'static' : '*', local: '*' }],
        wildcard,
      });
    }
  }
  return info;
}

function flattenUse(node: Node, prefix: string, out: Array<{ path: string; wildcard: boolean }>): void {
  switch (node.type) {
    case 'scoped_use_list': {
      const p = node.childForFieldName('path')?.text ?? '';
      const list = node.childForFieldName('list');
      const base = prefix ? (p ? `${prefix}::${p}` : prefix) : p;
      for (const c of list?.namedChildren ?? []) if (c) flattenUse(c, base, out);
      return;
    }
    case 'use_list':
      for (const c of node.namedChildren) if (c) flattenUse(c, prefix, out);
      return;
    case 'use_as_clause': {
      const p = node.childForFieldName('path');
      if (p) flattenUse(p, prefix, out);
      return;
    }
    case 'use_wildcard': {
      const inner = node.namedChild(0)?.text ?? '';
      out.push({ path: prefix ? (inner ? `${prefix}::${inner}` : prefix) : inner, wildcard: true });
      return;
    }
    default: {
      const t = node.text;
      out.push({ path: prefix ? (t === 'self' ? prefix : `${prefix}::${t}`) : t, wildcard: false });
    }
  }
}

function rustModule(tree: Tree): ModuleInfo {
  const info = emptyInfo();
  for (const item of tree.rootNode.descendantsOfType(['mod_item', 'use_declaration'])) {
    if (!item) continue;
    if (item.type === 'mod_item') {
      if (!item.childForFieldName('body')) {
        const name = item.childForFieldName('name')?.text;
        // Only file modules declared at this file's top level map to files.
        if (name && item.parent?.type === 'source_file') info.modDecls.push(name);
      }
      continue;
    }
    const arg = item.childForFieldName('argument');
    if (!arg) continue;
    const paths: Array<{ path: string; wildcard: boolean }> = [];
    flattenUse(arg, '', paths);
    for (const p of paths) {
      info.imports.push({ specifier: p.path, line: line(item), kind: 'static', typeOnly: false, names: [{ imported: '*', local: '*' }], wildcard: p.wildcard });
    }
  }
  return info;
}

function csharpModule(tree: Tree): ModuleInfo {
  const info = emptyInfo();
  for (const u of tree.rootNode.descendantsOfType('using_directive')) {
    if (!u) continue;
    const name = u.namedChildren.find((c) => c && /name|identifier/.test(c.type));
    if (name) info.imports.push({ specifier: name.text, line: line(u), kind: 'static', typeOnly: false, names: [{ imported: '*', local: '*' }] });
  }
  return info;
}

export function extractModule(tree: Tree, lang: LanguageId): ModuleInfo {
  switch (lang) {
    case 'javascript':
    case 'typescript':
    case 'tsx':
      return jsModule(tree);
    case 'python':
      return pythonModule(tree);
    case 'go':
      return goModule(tree);
    case 'java':
      return javaModule(tree);
    case 'rust':
      return rustModule(tree);
    case 'csharp':
      return csharpModule(tree);
  }
}
