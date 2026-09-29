// SPDX-License-Identifier: MIT
/**
 * tree-sitter analysis: function discovery, cyclomatic/cognitive complexity
 * (SonarSource examples), nesting, parameters, line counts, smells inputs.
 */

import { describe, it, expect } from 'vitest';
import { analyzeSource } from '../src/parsing/analyze.js';

const fn = async (lang: Parameters<typeof analyzeSource>[0], src: string) => (await analyzeSource(lang, src)).functions;

describe('function discovery', () => {
  it('does not mistake if/for/while/switch/catch for methods (old regex bug)', async () => {
    const src = `function outer(a) {
  if (a) { return 1; }
  for (let i = 0; i < 3; i++) { a++; }
  while (a) { a--; }
  switch (a) { case 1: break; }
  try { a(); } catch (e) { a = 0; }
  return a;
}`;
    const fns = await fn('javascript', src);
    expect(fns.map((f) => f.name)).toEqual(['outer']);
  });

  it('names methods, class-field arrows, and anonymous callbacks by their binding site', async () => {
    const src = `class Store {
  get(id) { return this.items[id]; }
  onChange = (e) => { this.last = e; };
}
export const handler = async (req) => req;
app.get('/x', function (req, res) { res.end(); });`;
    const names = (await fn('javascript', src)).map((f) => f.name);
    expect(names).toEqual(['Store.get', 'Store.onChange', 'handler', '<callback app.get>']);
  });

  it('labels JavaScript as javascript and TSX as tsx grammar without errors', async () => {
    const js = await analyzeSource('javascript', 'const x = <div>{a ? 1 : 2}</div>;');
    expect(js.parseErrors).toBe(0);
    const tsx = await analyzeSource('tsx', 'export const C = (p: { a: number }) => <b>{p.a}</b>;');
    expect(tsx.parseErrors).toBe(0);
    expect(tsx.lang).toBe('tsx');
  });

  it('skips bodiless declarations (abstract, interface, overload signatures)', async () => {
    const src = `abstract class A { abstract m(): void; run(): number { return 1; } }
interface I { f(): void }
function over(a: string): void;
function over(a: any) {}`;
    const names = (await fn('typescript', src)).map((f) => f.name);
    expect(names).toEqual(['A.run', 'over']);
  });
});

describe('cognitive complexity (SonarSource specification)', () => {
  it('sumOfPrimes = 7, getWords = 1 (examples from the whitepaper)', async () => {
    const src = `function sumOfPrimes(max) {
  let total = 0;
  OUT: for (let i = 1; i <= max; ++i) {
    for (let j = 2; j < i; ++j) {
      if (i % j == 0) {
        continue OUT;
      }
    }
    total += i;
  }
  return total;
}
function getWords(number) {
  switch (number) {
    case 1: return "one";
    case 2: return "a couple";
    case 3: return "a few";
    default: return "lots";
  }
}`;
    const [primes, words] = await fn('javascript', src);
    expect(primes.cognitive).toBe(7);
    expect(primes.cyclomatic).toBe(4);
    expect(words.cognitive).toBe(1);
    expect(words.cyclomatic).toBe(4);
  });

  it('else-if and else are +1 without nesting penalty; mixed boolean operators count per sequence', async () => {
    const src = `function f(a, b, c) {
  if (a && b || c) { return 1; }
  else if (b) { return 2; }
  else { return 3; }
}`;
    const [f] = await fn('javascript', src);
    expect(f.cognitive).toBe(5); // if +1, && +1, || +1, else if +1, else +1
    expect(f.cyclomatic).toBe(5); // 1 + if + && + || + else-if
  });

  it('lambdas add nesting but no increment, and belong to the enclosing function', async () => {
    const src = `function f(items) {
  return items.map((x) => { if (x) { return 1; } return 2; });
}`;
    const fns = await fn('javascript', src);
    expect(fns).toHaveLength(1);
    expect(fns[0].cognitive).toBe(2); // if at nesting 1
  });

  it('counts recursion once', async () => {
    const [f] = await fn('javascript', 'function fact(n) { return n <= 1 ? 1 : n * fact(n - 1); }');
    expect(f.cognitive).toBe(2); // ternary + recursion
  });

  it('Python: nesting follows indentation blocks, elif/else are hybrid, comprehensions add to cyclomatic', async () => {
    const src = `class K:
    def m(self, a, b, *args):
        """doc"""
        if a and b or c:
            pass
        elif b:
            for x in y:
                if x:
                    pass
        else:
            pass
        try:
            pass
        except ValueError:
            pass
        return [x for x in y if x]
`;
    const r = await analyzeSource('python', src);
    const m = r.functions[0];
    expect(m.name).toBe('K.m');
    expect(m.params.map((p) => p.name)).toEqual(['a', 'b', 'args']); // self excluded
    expect(m.cognitive).toBe(11); // if1 and1 or1 elif1 for(n1)2 if(n2)3 else1 except1
    expect(m.cyclomatic).toBe(10);
    expect(m.maxNesting).toBe(3);
    expect(r.commentLines).toBe(1); // the docstring
    expect(r.emptyCatches).toEqual([14]);
  });

  it('Go, Java, Rust and C# use the same rules', async () => {
    const go = (await fn('go', `package p
func (s *S) M(a, b int, c string) error {
  if x := 1; x > 0 && a < b {
  } else if a > 2 {
  } else {
  }
  for i := 0; i < 3; i++ { if i > 1 { break } }
  switch a { case 1: ; case 2: ; default: }
  f := func() { if a > 0 {} }
  return nil
}`))[0];
    expect(go.name).toBe('S.M');
    expect(go.params).toHaveLength(3);
    expect([go.cyclomatic, go.cognitive]).toEqual([9, 10]);

    const java = (await fn('java', `class A { private void m(int a, String b) {
    if (a > 0 && b != null) {} else if (a > 1) {} else {}
    for (int i=0;;) {}
    switch (a) { case 1: break; case 2: break; default: }
    try {} catch (Exception e) {}
    Runnable q = () -> { if (a > 1) {} };
  } }`))[0];
    expect(java.name).toBe('A.m');
    expect(java.isPrivate).toBe(true);
    expect([java.cyclomatic, java.cognitive]).toEqual([9, 9]);

    const rust = await fn('rust', `impl S {
  pub fn new(a: i32, b: &str) -> Self {
    if a > 0 && b.is_empty() { } else if let Some(x) = y { } else { }
    match a { 1 => {}, 2 => {}, _ => {} }
    let c = |x| if x { 1 } else { 2 };
    Self { a }
  }
  fn s(&self) -> i32 { self.s() }
}`);
    expect(rust.map((f) => f.name)).toEqual(['S.new', 'S.s']);
    expect([rust[0].cyclomatic, rust[0].cognitive]).toEqual([7, 8]);
    expect(rust[1].params).toHaveLength(0); // &self excluded
    expect(rust[1].cognitive).toBe(1); // recursion

    const cs = await fn('csharp', `class C {
  public int P { get { return x; } set { x = value; } }
  public int Q { get; set; }
  private void M(int a, params string[] b) {
    if (a > 0 && b != null) {} else if (a > 1) {} else {}
    switch (a) { case 1: case 2: break; default: break; }
    var r = a switch { 1 => 2, _ => 3 };
    try {} catch (Exception e) {}
    y = a ?? b;
  }
}`);
    expect(cs.map((f) => f.name)).toEqual(['C.P.get', 'C.P.set', 'C.M']);
    expect(cs[2].params).toHaveLength(2);
    expect([cs[2].cyclomatic, cs[2].cognitive]).toEqual([9, 8]);
  });
});

describe('file metrics', () => {
  it('counts code, comment-only and blank lines from the syntax tree', async () => {
    const src = `// header
/* block
   comment */
const a = 1; // trailing

const s = \`multi
line\`;
`;
    const r = await analyzeSource('javascript', src);
    expect(r.loc).toBe(7);
    expect(r.commentLines).toBe(3);
    expect(r.blankLines).toBe(1);
    expect(r.sloc).toBe(3);
  });

  it('computes Halstead and a bounded maintainability index', async () => {
    const [f] = await fn('javascript', 'function add(a, b) { return a + b; }');
    expect(f.halstead.distinctOperands).toBe(3); // add, a, b
    expect(f.halstead.volume).toBeGreaterThan(0);
    expect(f.maintainability).toBeGreaterThan(50);
    expect(f.maintainability).toBeLessThanOrEqual(100);
  });

  it('finds magic numbers but not named constants, enums or defaults', async () => {
    const src = `const TIMEOUT = 3000;
enum E { A = 7 }
function f(retries = 5) { setTimeout(g, 4500); return arr[3] + 0 + 1; }`;
    const r = await analyzeSource('typescript', src);
    expect(r.magicNumbers.map((m) => m.value)).toEqual(['4500']);
  });

  it('detects empty catch blocks but accepts a commented one', async () => {
    const src = `try { a(); } catch (e) {}
try { b(); } catch (e) { /* expected: optional */ }`;
    const r = await analyzeSource('javascript', src);
    expect(r.emptyCatches).toEqual([1]);
  });
});
