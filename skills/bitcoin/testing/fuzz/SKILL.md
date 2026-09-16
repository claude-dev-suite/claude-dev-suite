---
name: bitcoin-testing-fuzz
description: |
  Fuzz testing for Bitcoin code: Bitcoin Core's libFuzzer harnesses,
  rust-bitcoin / bdk / secp256k1 cargo-fuzz, AFL++. Seed corpus
  bootstrapping, regression tests.
  USE WHEN: hardening Bitcoin libraries, writing fuzz harnesses,
  reproducing fuzz-found crashes.
allowed-tools: Read, Grep, Glob
---

# Fuzz Testing

Fuzzing finds bugs by feeding randomly-generated inputs and watching
for crashes / assertion failures. Critical for Bitcoin libraries
parsing untrusted data (txs, scripts, P2P messages).

## Bitcoin Core fuzz harnesses

Located in `src/test/fuzz/`. Each `.cpp` file is one harness.

Bitcoin Core 29.0 (April 2025) replaced Autotools with CMake
(minimum 3.22): `./autogen.sh` and `./configure` are gone, and the
driver binary moved from `src/test/fuzz/fuzz` to `build_fuzz/bin/fuzz`.
Current as of Bitcoin Core 31.1 (July 2026):

```bash
# Build with fuzzing (preset sets BUILD_FOR_FUZZING=ON and
# SANITIZERS=undefined,address,fuzzer)
cmake --preset=libfuzzer
cmake --build build_fuzz

# Run a specific harness
FUZZ=tx_in build_fuzz/bin/fuzz <corpus_dir>
FUZZ=script build_fuzz/bin/fuzz <corpus_dir>
```

`--preset=libfuzzer-nosan` builds the same harnesses without the
address/undefined sanitizers into `build_fuzz_nosan` — far higher
throughput for long coverage-hunting runs.

afl++ and Honggfuzz bypass the presets: configure with
`-DBUILD_FOR_FUZZING=ON` and their compiler wrappers
(`afl-clang-lto++`, `hfuzz-clang++`), then drive `build_fuzz/bin/fuzz`
under `afl-fuzz` / `honggfuzz`.

Available targets: tx_in, tx_out, script, descriptor_parse,
miniscript_string, psbt, addrman, block_header, process_message, etc.
`build_fuzz/test/fuzz/test_runner.py` executes them all.

## rust-bitcoin / BDK fuzz

Use `cargo-fuzz`:
```bash
cd rust-bitcoin/fuzz
cargo +nightly fuzz run script_decode
```

Each `fuzz_targets/*.rs` is a separate target.

## secp256k1 fuzz

Native libFuzzer harnesses; verify against test vectors first, then
random.

## Corpus management

- **Seed corpus**: well-formed examples covering edge cases.
- **Crash corpus**: inputs that triggered crashes; persist as
  regression tests.
- **Stored online**: Bitcoin Core's public corpus repo is
  `bitcoin-core/qa-assets` — one directory per harness under
  `fuzz_corpora/`, token dictionaries under `fuzz_dicts/` (as of
  September 2026).

## Coverage-guided fuzzing

libFuzzer / AFL++ instrument code with branch coverage. New inputs
that exercise new branches are kept, expanding coverage.

Effective for:
- Parsers (tx, script, PSBT, descriptors).
- Crypto primitives (signatures, hashes).
- Network message decoders.

## Common bugs found

- **Out-of-bounds reads** in parsers.
- **Integer overflows** (especially scriptnum arithmetic).
- **DoS via specific input shapes** (huge witness, deep script
  recursion).

## Continuous fuzzing

OSS-Fuzz and Bitcoin Core's own farms run continuous fuzzing 24/7.
Findings reported privately; fixed before public disclosure.

## Use cases

- **Hardening parsers** before production.
- **Pre-merge sanity** for Bitcoin Core PRs that touch consensus
  code.
- **Library audits** — fuzz a new BIP implementation.

## Common issues

- **Seed corpus too narrow** → fuzzer doesn't find new branches.
- **Test isolation** — globals + caches between fuzz runs.
- **Sanitizers slow** — production fuzz balances speed vs detection.

## See also

- [property-based/SKILL.md](../property-based/SKILL.md)
- [core-test-framework/SKILL.md](../core-test-framework/SKILL.md)
- [../libraries/rust-bitcoin/SKILL.md](../../libraries/rust-bitcoin/SKILL.md)
- [../libraries/bdk/SKILL.md](../../libraries/bdk/SKILL.md)
