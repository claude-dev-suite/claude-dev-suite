// SPDX-License-Identifier: MIT
/**
 * Benchmark harness sources (Node ESM and Python). The harness reads its
 * configuration from a JSON file given as argv and writes its results to the
 * file named in that config — never to stdout, which belongs to the code
 * under test (a `console.log` in a benchmarked function used to corrupt the
 * wrapper's JSON and fail the run).
 *
 * Very fast functions are timed in calibrated batches (each sample = the mean
 * of `batch` consecutive calls, aimed at >= ~0.2 ms per sample) so timer
 * resolution does not dominate the measurement.
 */

export const NODE_HARNESS = String.raw`import { performance } from 'node:perf_hooks';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const cfg = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = (o) => writeFileSync(cfg.out, JSON.stringify(o));
let fn;
if (cfg.code !== undefined) {
  const AsyncFunction = (async () => {}).constructor;
  fn = new AsyncFunction(cfg.code);
} else {
  const mod = await import(pathToFileURL(cfg.modulePath).href);
  if (cfg.functionName) {
    fn = mod[cfg.functionName] ?? (mod.default && mod.default[cfg.functionName]);
    if (typeof fn !== 'function') { out({ error: 'Function not found or not exported: ' + cfg.functionName }); process.exit(0); }
  } else {
    fn = typeof mod.default === 'function' ? mod.default : (typeof mod.bench === 'function' ? mod.bench : undefined);
    if (typeof fn !== 'function') { out({ noExport: true }); process.exit(0); }
  }
}
const args = cfg.args || [];
let isAsync = false;
const r0 = fn(...args);
if (r0 && typeof r0.then === 'function') { isAsync = true; await r0; }
for (let i = 1; i < cfg.warmup; i++) { const r = fn(...args); if (isAsync) await r; }
let batch = 1;
{
  const s = performance.now();
  for (let i = 0; i < 20; i++) { const r = fn(...args); if (isAsync) await r; }
  const est = (performance.now() - s) / 20;
  if (est < 0.2) batch = Math.min(1e6, Math.max(1, Math.ceil(0.2 / Math.max(est, 1e-6))));
}
if (typeof globalThis.gc === 'function') globalThis.gc();
const heapBefore = process.memoryUsage().heapUsed;
const timings = new Array(cfg.iterations);
for (let i = 0; i < cfg.iterations; i++) {
  const s = performance.now();
  for (let j = 0; j < batch; j++) { const r = fn(...args); if (isAsync) await r; }
  timings[i] = (performance.now() - s) / batch;
}
const heapAfter = process.memoryUsage().heapUsed;
out({ timings, batch, isAsync, heapBefore, heapAfter });
process.exit(0);
`;

export const PYTHON_HARNESS = String.raw`import sys, os, json, time, gc, inspect, importlib.util
cfg = json.load(open(sys.argv[1], encoding='utf-8'))
def out(o):
    with open(cfg['out'], 'w', encoding='utf-8') as f:
        json.dump(o, f)
fn = None
if cfg.get('code') is not None:
    body = '\n'.join('    ' + l for l in cfg['code'].splitlines()) or '    pass'
    ns = {}
    exec(compile('def __pp_bench__():\n' + body + '\n', '<benchmark>', 'exec'), ns)
    fn = ns['__pp_bench__']
else:
    path = cfg['modulePath']
    sys.argv = [path]
    sys.path[0] = os.path.dirname(path)
    spec = importlib.util.spec_from_file_location('__pp_target__', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    if cfg.get('functionName'):
        fn = getattr(mod, cfg['functionName'], None)
        if not callable(fn):
            out({'error': 'Function not found: ' + cfg['functionName']}); sys.exit(0)
    else:
        fn = getattr(mod, 'bench', None)
        if not callable(fn):
            out({'noExport': True}); sys.exit(0)
args = cfg.get('args') or []
call = fn
if inspect.iscoroutinefunction(fn):
    import asyncio
    loop = asyncio.new_event_loop()
    call = lambda *a: loop.run_until_complete(fn(*a))
for _ in range(max(1, cfg['warmup'])):
    call(*args)
s = time.perf_counter()
for _ in range(20):
    call(*args)
est = (time.perf_counter() - s) / 20 * 1000
batch = 1
if est < 0.2:
    batch = int(min(1e6, max(1, -(-0.2 // max(est, 1e-6)))))
gc.collect()
gc_was = gc.isenabled()
gc.disable()
timings = []
try:
    for _ in range(cfg['iterations']):
        s = time.perf_counter()
        for _ in range(batch):
            call(*args)
        timings.append((time.perf_counter() - s) * 1000 / batch)
finally:
    if gc_was:
        gc.enable()
res = {'timings': timings, 'batch': batch}
if cfg.get('memory'):
    import tracemalloc
    gc.collect()
    tracemalloc.start()
    before = tracemalloc.get_traced_memory()[0]
    for _ in range(min(cfg['iterations'], 100)):
        call(*args)
    after = tracemalloc.get_traced_memory()[0]
    tracemalloc.stop()
    res['heapBefore'] = before
    res['heapAfter'] = after
out(res)
sys.stdout.flush()
os._exit(0)
`;
