# Transaction malleability

Malleability = third party can change `txid` without invalidating
signatures. Pre-SegWit, this was a major issue for any protocol relying
on txid (Lightning's pre-anchor commitments, atomic swaps, ...).

## Pre-SegWit malleability vectors (BIP62 enumeration)

1. **Non-canonical signature encoding** — DER allows multiple
   serializations of the same signature (low-S vs high-S, padding bytes).
2. **Non-canonical pubkey encoding** — uncompressed/compressed/hybrid.
3. **Non-minimal push opcodes** — `OP_PUSHBYTES_1` vs `OP_1` for value 1.
4. **Unused stack values** — extra `OP_NOP` data.
5. **Sighash type bytes** with high-bit set in unconventional ways.
6. **Multisig "extra null"** — `OP_CHECKMULTISIG` consumes one extra
   stack item; can be replaced with any value.
7. **Mid-state reorg** — replacing input scripts (the txid changes).

## How SegWit fixes this

- Witness data is **excluded from txid** (only included in wtxid).
- All signature/pubkey data lives in the witness → mutating it changes
  wtxid but **not** txid.
- For tx that uses **only** SegWit inputs: txid is fixed once outputs
  are decided. Lightning's commitment txs can pre-sign refund paths.

## Residual cases

- Mixed legacy + SegWit inputs: txid still malleable via legacy input
  scriptSig.
- Replace-by-fee (BIP125): a separate tx that conflicts with yours
  replaces it; your txid is gone, but this is **not** malleability —
  it's policy.
- Pinning (Lightning): an attacker spends an HTLC output with a tx
  that prevents you from publishing the timeout/success path tx. v3
  TRUC + ephemeral anchors mitigates this.

## Practical implications

- Always wait for **1+ confirmations** before treating a txid as final
  in legacy contexts.
- For 0-conf with SegWit-only inputs, txid is immediately stable —
  but RBF/full-RBF can still replace.
- Lightning's anchor commitments (current standard) and v3 TRUC
  proposals (post-replacement-cycling) are the modern answer to
  pre-anchor malleability.
