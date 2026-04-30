---
name: bitcoin-message-signing
description: |
  Generic Bitcoin message signing: BIP137 (legacy P2PKH-only) and BIP322
  (modern, supports any output type). Used for proof-of-ownership,
  withdraw verification, federated authentication, exchange KYC-free
  attestation.
  USE WHEN: implementing "sign this message with your Bitcoin address",
  verifying ownership of an address, building auth via signing.
allowed-tools: Read, Grep, Glob
---

# Bitcoin Message Signing

Two specifications:

- **BIP137** (Hourglass) — legacy. Works only for P2PKH (uncompressed
  or compressed). Output: 65-byte recoverable ECDSA + Base64.
- **BIP322** (modern) — works for any output type (P2PKH, P2WPKH,
  P2WSH, P2TR, even script-only). Output: a virtual PSBT-like
  signature.

## BIP137 (legacy)

```
prefix      = "Bitcoin Signed Message:\n"
preamble    = varint(len(prefix)) || prefix || varint(len(msg)) || msg
hash        = SHA256d(preamble)
signature   = recoverable_ecdsa_sign(privkey, hash)   # 65 bytes
encoded     = base64(signature)
```

Verify: recover pubkey from signature, derive P2PKH address, compare.

**Limitations**:
- Only P2PKH. Cannot prove ownership of a SegWit / Taproot address.
- Wallets don't always agree on the prefix (some include trailing
  newline, others don't).
- Recoverable ECDSA implies pubkey isn't directly transmitted.

## BIP322 (modern)

Generalizes signing by constructing a **virtual transaction**:

```
to_spend = transaction with:
  version=0, locktime=0,
  vin = [{ prevout: 0xffffffff..., scriptSig: OP_0 PUSH msg_hash, sequence: 0 }],
  vout = [{ value: 0, scriptPubKey: <message-target scriptPubKey> }]

to_sign = transaction with:
  version=0, locktime=0,
  vin = [{ prevout: txid_of_to_spend, vout: 0, sequence: 0 }],
  vout = [{ value: 0, scriptPubKey: OP_RETURN }]
```

Then sign `to_sign` as a normal transaction spending `to_spend`'s
output. The signature can be:
- A full BIP322 signature with witness data, OR
- A "simple" form where only the witness/scriptSig is encoded.

### Address types supported

- P2PKH, P2SH-anything, P2WPKH, P2WSH, P2TR.
- Multi-key: produce multiple sigs across signers and combine into one
  BIP322 witness.
- Even script-only addresses (no key) can produce a "proof of
  knowledge" of preimage.

## Encoded forms

- **BIP322 simple** — Base64 of a witness stack only. Suitable for
  P2WPKH/P2WSH/P2TR.
- **BIP322 full** — Base64 of `to_sign` PSBT-like blob. Required for
  P2SH or anything with non-witness data.

## Verification flow

```python
def verify_bip322(address, message, signature_b64):
    spk = address_to_scriptPubKey(address)
    msg_hash = bip322_hash(message)
    to_spend = build_to_spend(spk, msg_hash)
    to_sign  = build_to_sign(to_spend)
    apply_signature(to_sign, signature_b64)
    return script_executes_successfully(to_sign, vin[0])
```

## Common use cases

- **Exchange withdraw verification** — "prove you own the destination
  before we send".
- **Federated/KYC-free login** — sign a server-issued nonce with the
  Bitcoin address you want to associate with the account.
- **Off-chain attestation** — sign a public commitment.
- **DLC oracle attestation** — adapter signatures + BIP322.

## Library support

- `bitcoinjs-lib` (since 6.x) — BIP322 sign/verify.
- `python-bitcoinlib` — BIP137 native, BIP322 via plugin.
- `rust-bitcoin` — BIP322 in `signed-message` crate.
- `bitcoinj` — BIP137; BIP322 incomplete.

## Common bugs

- Mixing BIP137 prefix conventions across wallets — verify with the
  same library/wallet that signed where possible.
- Trying to BIP137-sign a SegWit address by deriving an arbitrary
  P2PKH from the same key → semantically wrong; use BIP322 instead.
- For Taproot: the witness stack must use `SIGHASH_DEFAULT` to be
  byte-identical to a real Taproot spend; some libraries default to
  `SIGHASH_ALL` (0x01) which encodes a different sighash.

## See also

- [psbt/SKILL.md](../psbt/SKILL.md)
- [../../wallets/hd/SKILL.md](../../wallets/hd/SKILL.md)
- [../../cryptography/schnorr/SKILL.md](../../cryptography/schnorr/SKILL.md)
