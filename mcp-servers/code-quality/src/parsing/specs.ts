// SPDX-License-Identifier: MIT
/**
 * Per-language tree-sitter node vocabularies.
 *
 * Node type names were verified against the grammars shipped in
 * @vscode/tree-sitter-wasm 0.3.1 (see tests/parsing.test.ts fixtures).
 */

import type { Node } from 'web-tree-sitter';
import type { LanguageId } from '../core/paths.js';

export interface LangSpec {
  /** Named function-like nodes: always their own unit, even when nested. */
  functionTypes: ReadonlySet<string>;
  /** Anonymous function-like nodes: a unit at top level, otherwise part of the enclosing unit (+1 nesting). */
  lambdaTypes: ReadonlySet<string>;
  classTypes: ReadonlySet<string>;
  ifTypes: ReadonlySet<string>;
  elseTypes: ReadonlySet<string>;
  elifTypes: ReadonlySet<string>;
  loopTypes: ReadonlySet<string>;
  switchTypes: ReadonlySet<string>;
  catchTypes: ReadonlySet<string>;
  ternaryTypes: ReadonlySet<string>;
  logicalTypes: ReadonlySet<string>;
  logicalOps: ReadonlySet<string>;
  tryTypes: ReadonlySet<string>;
  /** Extra cyclomatic decision points (comprehension clauses…). */
  extraDecisionTypes: ReadonlySet<string>;
  /** Cyclomatic +1 for this case-like node (non-default switch case / match arm)? */
  caseWeight(node: Node): number;
  /** Labeled break/continue, goto: cognitive +1. */
  isJumpToLabel(node: Node): boolean;
  /** Emptied-out catch (no statements, no comment explaining why). */
  isEmptyCatch(node: Node): boolean;
  /** Declarations whose numeric literals are named constants, not magic numbers. */
  constantContextTypes: ReadonlySet<string>;
  callTypes: ReadonlySet<string>;
  /** Import-like statements excluded from duplicate detection. */
  importTypes: ReadonlySet<string>;
}

const S = (...xs: string[]) => new Set(xs);

function namedNonComment(node: Node): Node[] {
  const out: Node[] = [];
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c && !c.type.includes('comment')) out.push(c);
  }
  return out;
}

function hasComment(node: Node): boolean {
  for (let i = 0; i < node.namedChildCount; i++) {
    if (node.namedChild(i)?.type.includes('comment')) return true;
  }
  return false;
}

function blockIsEmpty(block: Node | null): boolean {
  if (!block) return false;
  return namedNonComment(block).length === 0 && !hasComment(block);
}

function childWithLabel(node: Node, labelTypes: string[]): boolean {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c && labelTypes.includes(c.type)) return true;
  }
  return false;
}

const JS_BASE = {
  functionTypes: S('function_declaration', 'generator_function_declaration', 'method_definition'),
  lambdaTypes: S('arrow_function', 'function_expression', 'function', 'generator_function'),
  classTypes: S('class_declaration', 'class', 'abstract_class_declaration'),
  ifTypes: S('if_statement'),
  elseTypes: S('else_clause'),
  elifTypes: S(),
  loopTypes: S('for_statement', 'for_in_statement', 'while_statement', 'do_statement'),
  switchTypes: S('switch_statement'),
  catchTypes: S('catch_clause'),
  ternaryTypes: S('ternary_expression'),
  logicalTypes: S('binary_expression'),
  logicalOps: S('&&', '||', '??'),
  tryTypes: S('try_statement'),
  extraDecisionTypes: S(),
  caseWeight: (n: Node) => (n.type === 'switch_case' ? 1 : 0),
  isJumpToLabel: (n: Node) =>
    (n.type === 'break_statement' || n.type === 'continue_statement') && n.childForFieldName('label') !== null,
  isEmptyCatch: (n: Node) => n.type === 'catch_clause' && blockIsEmpty(n.childForFieldName('body')),
  constantContextTypes: S('enum_declaration', 'enum_body', 'enum_assignment'),
  callTypes: S('call_expression', 'new_expression'),
  importTypes: S('import_statement'),
};

const SPECS: Record<LanguageId, LangSpec> = {
  javascript: JS_BASE,
  typescript: JS_BASE,
  tsx: JS_BASE,
  python: {
    functionTypes: S('function_definition'),
    lambdaTypes: S('lambda'),
    classTypes: S('class_definition'),
    ifTypes: S('if_statement'),
    elseTypes: S('else_clause'),
    elifTypes: S('elif_clause'),
    loopTypes: S('for_statement', 'while_statement'),
    switchTypes: S('match_statement'),
    catchTypes: S('except_clause', 'except_group_clause'),
    ternaryTypes: S('conditional_expression'),
    logicalTypes: S('boolean_operator'),
    logicalOps: S('and', 'or'),
    tryTypes: S('try_statement', 'with_statement'),
    extraDecisionTypes: S('for_in_clause', 'if_clause'),
    caseWeight: (n) => {
      if (n.type !== 'case_clause') return 0;
      const pat = n.namedChildren.find((c) => c?.type === 'case_pattern');
      return pat && pat.namedChildCount === 0 ? 0 : 1; // `case _:` is the default
    },
    isJumpToLabel: () => false,
    isEmptyCatch: (n) => {
      if (n.type !== 'except_clause' && n.type !== 'except_group_clause') return false;
      const block = n.namedChildren.find((c) => c?.type === 'block') ?? null;
      if (!block || hasComment(block) || hasComment(n)) return false;
      const stmts = namedNonComment(block);
      return stmts.length === 1 && (stmts[0].type === 'pass_statement' || stmts[0].text === '...');
    },
    constantContextTypes: S(),
    callTypes: S('call'),
    importTypes: S('import_statement', 'import_from_statement', 'future_import_statement'),
  },
  go: {
    functionTypes: S('function_declaration', 'method_declaration'),
    lambdaTypes: S('func_literal'),
    classTypes: S('type_spec'),
    ifTypes: S('if_statement'),
    elseTypes: S(),
    elifTypes: S(),
    loopTypes: S('for_statement'),
    switchTypes: S('expression_switch_statement', 'type_switch_statement', 'select_statement'),
    catchTypes: S(),
    ternaryTypes: S(),
    logicalTypes: S('binary_expression'),
    logicalOps: S('&&', '||'),
    tryTypes: S(),
    extraDecisionTypes: S(),
    caseWeight: (n) => (n.type === 'expression_case' || n.type === 'type_case' || n.type === 'communication_case' ? 1 : 0),
    isJumpToLabel: (n) =>
      n.type === 'goto_statement' ||
      ((n.type === 'break_statement' || n.type === 'continue_statement') && childWithLabel(n, ['label_name'])),
    isEmptyCatch: () => false,
    constantContextTypes: S('const_declaration', 'const_spec'),
    callTypes: S('call_expression'),
    importTypes: S('import_declaration', 'package_clause'),
  },
  java: {
    functionTypes: S('method_declaration', 'constructor_declaration', 'compact_constructor_declaration'),
    lambdaTypes: S('lambda_expression'),
    classTypes: S('class_declaration', 'interface_declaration', 'enum_declaration', 'record_declaration'),
    ifTypes: S('if_statement'),
    elseTypes: S(),
    elifTypes: S(),
    loopTypes: S('for_statement', 'enhanced_for_statement', 'while_statement', 'do_statement'),
    switchTypes: S('switch_expression', 'switch_statement'),
    catchTypes: S('catch_clause'),
    ternaryTypes: S('ternary_expression'),
    logicalTypes: S('binary_expression'),
    logicalOps: S('&&', '||'),
    tryTypes: S('try_statement', 'try_with_resources_statement'),
    extraDecisionTypes: S(),
    caseWeight: (n) => (n.type === 'switch_label' && n.namedChildCount > 0 && !/^default\b/.test(n.text) ? 1 : 0),
    isJumpToLabel: (n) => (n.type === 'break_statement' || n.type === 'continue_statement') && childWithLabel(n, ['identifier']),
    isEmptyCatch: (n) => n.type === 'catch_clause' && blockIsEmpty(n.childForFieldName('body')),
    constantContextTypes: S('enum_constant', 'annotation', 'marker_annotation'),
    callTypes: S('method_invocation', 'object_creation_expression'),
    importTypes: S('import_declaration', 'package_declaration'),
  },
  rust: {
    functionTypes: S('function_item'),
    lambdaTypes: S('closure_expression'),
    classTypes: S('impl_item', 'trait_item'),
    ifTypes: S('if_expression'),
    elseTypes: S('else_clause'),
    elifTypes: S(),
    loopTypes: S('for_expression', 'while_expression', 'loop_expression'),
    switchTypes: S('match_expression'),
    catchTypes: S(),
    ternaryTypes: S(),
    logicalTypes: S('binary_expression'),
    logicalOps: S('&&', '||'),
    tryTypes: S(),
    extraDecisionTypes: S(),
    caseWeight: (n) => {
      if (n.type !== 'match_arm') return 0;
      const pat = n.childForFieldName('pattern');
      return pat && pat.namedChildCount === 0 && pat.text.trim() === '_' ? 0 : 1;
    },
    isJumpToLabel: (n) => (n.type === 'break_expression' || n.type === 'continue_expression') && childWithLabel(n, ['label']),
    isEmptyCatch: () => false,
    constantContextTypes: S('const_item', 'static_item', 'attribute_item', 'enum_variant'),
    callTypes: S('call_expression', 'macro_invocation'),
    importTypes: S('use_declaration', 'extern_crate_declaration'),
  },
  csharp: {
    functionTypes: S(
      'method_declaration', 'constructor_declaration', 'destructor_declaration', 'operator_declaration',
      'conversion_operator_declaration', 'local_function_statement', 'accessor_declaration'
    ),
    lambdaTypes: S('lambda_expression', 'anonymous_method_expression'),
    classTypes: S('class_declaration', 'struct_declaration', 'record_declaration', 'interface_declaration'),
    ifTypes: S('if_statement'),
    elseTypes: S(),
    elifTypes: S(),
    loopTypes: S('for_statement', 'foreach_statement', 'while_statement', 'do_statement'),
    switchTypes: S('switch_statement', 'switch_expression'),
    catchTypes: S('catch_clause'),
    ternaryTypes: S('conditional_expression'),
    logicalTypes: S('binary_expression'),
    logicalOps: S('&&', '||', '??'),
    tryTypes: S('try_statement', 'using_statement'),
    extraDecisionTypes: S(),
    caseWeight: (n) => {
      if (n.type === 'switch_section') {
        let cases = 0;
        for (let i = 0; i < n.childCount; i++) if (n.child(i)?.type === 'case') cases++;
        // Older grammar versions wrap labels in case_switch_label nodes.
        for (const c of n.namedChildren) if (c?.type === 'case_switch_label' || c?.type === 'case_pattern_switch_label') cases++;
        return cases;
      }
      if (n.type === 'switch_expression_arm') {
        const first = n.namedChild(0);
        return first && first.type === 'discard' ? 0 : 1;
      }
      return 0;
    },
    isJumpToLabel: (n) => n.type === 'goto_statement',
    isEmptyCatch: (n) => n.type === 'catch_clause' && blockIsEmpty(n.childForFieldName('body')),
    constantContextTypes: S('enum_member_declaration', 'attribute'),
    callTypes: S('invocation_expression', 'object_creation_expression'),
    importTypes: S('using_directive', 'extern_alias_directive'),
  },
};

export function specFor(lang: LanguageId): LangSpec {
  return SPECS[lang];
}

export const COMMENT_RE = /comment/;

const STRING_TYPES = new Set([
  'string', 'template_string', 'string_literal', 'raw_string_literal', 'interpreted_string_literal',
  'char_literal', 'character_literal', 'verbatim_string_literal', 'interpolated_string_expression',
  'concatenated_string', 'text_block', 'rune_literal', 'string_content',
]);

export function isStringNode(type: string): boolean {
  return STRING_TYPES.has(type);
}

const NUMBER_RE =
  /^(number|integer|float|int_literal|float_literal|imaginary_literal|decimal_integer_literal|hex_integer_literal|octal_integer_literal|binary_integer_literal|decimal_floating_point_literal|hex_floating_point_literal|integer_literal|real_literal)$/;

export function isNumberNode(type: string): boolean {
  return NUMBER_RE.test(type);
}

const LITERAL_WORDS = new Set(['true', 'false', 'null', 'nil', 'none', 'undefined', 'null_literal', 'boolean_literal', 'unit_expression']);

export function isLiteralLeaf(type: string): boolean {
  return isNumberNode(type) || LITERAL_WORDS.has(type);
}

export function isIdentifierLeaf(type: string): boolean {
  return (
    type.endsWith('identifier') ||
    type === 'this' ||
    type === 'self' ||
    type === 'super' ||
    type === 'crate' ||
    type === 'label_name' ||
    type === 'metavariable'
  );
}
