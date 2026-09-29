// SPDX-License-Identifier: MIT
/**
 * Human-readable names and parameter lists for function/class nodes.
 */

import type { Node } from 'web-tree-sitter';
import type { LanguageId } from '../core/paths.js';

function field(node: Node | null | undefined, name: string): Node | null {
  return node ? node.childForFieldName(name) : null;
}

function short(text: string, max = 60): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/** Name for a function-like node; falls back to where an anonymous function is bound. */
export function functionName(node: Node, lang: LanguageId): string {
  const own = field(node, 'name');
  if (lang === 'go' && node.type === 'method_declaration') {
    const recv = field(node, 'receiver');
    const typeId = recv?.descendantsOfType('type_identifier')[0];
    return `${typeId ? typeId.text + '.' : ''}${own?.text ?? '<method>'}`;
  }
  if (lang === 'csharp' && node.type === 'accessor_declaration') {
    const kw = node.children.find((c) => c && !c.isNamed && /^(get|set|init|add|remove)$/.test(c.type));
    const prop = node.parent?.parent;
    const propName = field(prop, 'name')?.text;
    return `${propName ?? '<property>'}.${kw?.type ?? 'accessor'}`;
  }
  if (lang === 'csharp' && node.type === 'operator_declaration') {
    const op = field(node, 'operator');
    return `operator ${op?.text ?? ''}`.trim();
  }
  if (own) return short(own.text);

  // Anonymous: name it after its binding site.
  let p = node.parent;
  while (p && (p.type === 'parenthesized_expression' || p.type === 'as_expression' || p.type === 'satisfies_expression')) p = p.parent;
  if (!p) return '<anonymous>';
  switch (p.type) {
    case 'variable_declarator':
    case 'init_declarator':
    case 'let_declaration':
      return short((field(p, 'name') ?? field(p, 'pattern'))?.text ?? '<anonymous>');
    case 'assignment_expression':
    case 'assignment':
    case 'augmented_assignment_expression':
      return short(field(p, 'left')?.text ?? '<anonymous>');
    case 'pair':
      return short(field(p, 'key')?.text ?? '<anonymous>');
    case 'public_field_definition':
    case 'field_definition':
      return short((field(p, 'name') ?? field(p, 'property'))?.text ?? '<anonymous>');
    case 'short_var_declaration':
    case 'expression_list': {
      const decl = p.type === 'expression_list' ? p.parent : p;
      const left = field(decl, 'left');
      return short(left?.text ?? '<anonymous>');
    }
    case 'arguments':
    case 'argument_list':
    case 'argument': {
      let call = p.parent;
      if (call?.type === 'argument') call = call.parent?.parent ?? null;
      const callee = field(call, 'function') ?? field(call, 'name');
      return callee ? `<callback ${short(callee.text, 40)}>` : '<anonymous>';
    }
    default:
      return '<anonymous>';
  }
}

export function className(node: Node, lang: LanguageId): string {
  if (lang === 'rust' && node.type === 'impl_item') {
    const t = field(node, 'type')?.text ?? '<impl>';
    const trait = field(node, 'trait')?.text;
    return trait ? `${t} (impl ${short(trait, 30)})` : t;
  }
  return short(field(node, 'name')?.text ?? '<anonymous class>');
}

/** Go `type X struct{}` / `type X interface{}` is class-like; aliases are not. */
export function isClassLike(node: Node, lang: LanguageId): boolean {
  if (lang === 'go') {
    const t = field(node, 'type')?.type;
    return t === 'struct_type' || t === 'interface_type';
  }
  if (lang === 'python' || lang === 'javascript' || lang === 'typescript' || lang === 'tsx') return true;
  return true;
}

/**
 * Visibility of a function-like node as far as dead-code analysis cares:
 * 'private' means only its own file/type (or Go package, Rust crate) can call it.
 */
export function visibilityOf(node: Node, lang: LanguageId, simpleName: string): { private: boolean; decorated: boolean } {
  const kids = node.children;
  const modText = kids
    .filter((c) => c && (c.type === 'modifiers' || c.type === 'modifier' || c.type === 'accessibility_modifier' || c.type === 'visibility_modifier'))
    .map((c) => c!.text)
    .join(' ');
  let decorated = kids.some((c) => c && (c.type === 'decorator' || c.type === 'attribute_list')) || /@\w/.test(modText);
  const prev = node.previousNamedSibling;
  if (prev && (prev.type === 'attribute_item' || prev.type === 'decorator' || prev.type === 'annotation')) decorated = true;
  if (node.parent?.type === 'decorated_definition') decorated = true;
  switch (lang) {
    case 'java':
    case 'csharp':
      return { private: /\bprivate\b/.test(modText) && !/\bprotected\b/.test(modText), decorated };
    case 'rust':
      return { private: !kids.some((c) => c?.type === 'visibility_modifier'), decorated };
    case 'go':
      return { private: /^[a-z_]/.test(simpleName), decorated };
    case 'python':
      return { private: /^_[^_]/.test(simpleName), decorated };
    default: {
      const nameNode = node.childForFieldName('name');
      return { private: /\bprivate\b/.test(modText) || nameNode?.type === 'private_property_identifier', decorated };
    }
  }
}

export interface ParamInfo {
  name: string;
  type: string | null;
}

function paramNameOf(p: Node): string {
  const n = field(p, 'name') ?? field(p, 'pattern') ?? p.descendantsOfType('identifier')[0] ?? p;
  return short(n.text, 40);
}

function paramTypeOf(p: Node): string | null {
  const t = field(p, 'type');
  if (!t) return null;
  return short(t.type === 'type_annotation' ? t.text.replace(/^:\s*/, '') : t.text, 40);
}

/** Parameters of a function-like node, excluding receivers such as `this`/`self`. */
export function parameters(node: Node, lang: LanguageId, isMethod: boolean): ParamInfo[] {
  const list = field(node, 'parameters');
  if (!list) {
    const single = field(node, 'parameter');
    return single ? [{ name: short(single.text, 40), type: null }] : [];
  }
  const out: ParamInfo[] = [];
  for (let i = 0; i < list.childCount; i++) {
    const c = list.child(i);
    if (!c || !c.isNamed || c.type.includes('comment')) continue;
    switch (lang) {
      case 'javascript':
      case 'typescript':
      case 'tsx': {
        const pattern = field(c, 'pattern');
        if (pattern?.type === 'this') continue;
        out.push({ name: c.type === 'identifier' ? c.text : paramNameOf(c), type: paramTypeOf(c) });
        break;
      }
      case 'python': {
        if (c.type === 'keyword_separator' || c.type === 'positional_separator') continue;
        const name = c.type === 'identifier' ? c.text : paramNameOf(c);
        if (isMethod && out.length === 0 && (name === 'self' || name === 'cls')) continue;
        out.push({ name, type: paramTypeOf(c) });
        break;
      }
      case 'go': {
        if (c.type === 'parameter_declaration' || c.type === 'variadic_parameter_declaration') {
          const names = c.children.filter((x, idx) => x && c.fieldNameForChild(idx) === 'name');
          const type = paramTypeOf(c);
          if (names.length === 0) out.push({ name: '_', type });
          for (const n of names) out.push({ name: n!.text, type });
        }
        break;
      }
      case 'java':
        if (c.type === 'formal_parameter' || c.type === 'spread_parameter') out.push({ name: paramNameOf(c), type: paramTypeOf(c) });
        break;
      case 'rust':
        if (c.type === 'parameter' || c.type === 'variadic_parameter') out.push({ name: paramNameOf(c), type: paramTypeOf(c) });
        break;
      case 'csharp':
        if (c.type === 'parameter') out.push({ name: paramNameOf(c), type: paramTypeOf(c) });
        else if (list.fieldNameForChild(i) === 'name') out.push({ name: c.text, type: null }); // `params T[] x`
        break;
    }
  }
  return out;
}
