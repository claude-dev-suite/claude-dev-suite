# Output type construction reference

## P2PKH (legacy single-sig)
```
scriptPubKey = OP_DUP OP_HASH160 <H160(pk)> OP_EQUALVERIFY OP_CHECKSIG
scriptSig    = <DER sig + sighash> <pubkey>
```
Address: Base58Check(0x00 || H160(pk)) → starts with `1`.

## P2SH (legacy script-hash)
```
redeemScript = ... whatever you want ...
scriptPubKey = OP_HASH160 <H160(redeemScript)> OP_EQUAL
scriptSig    = <args for redeemScript> <redeemScript bytes>
```
Address: Base58Check(0x05 || H160(redeemScript)) → starts with `3`.

Embedded wrappers:
- **P2SH-P2WPKH**: redeemScript = `OP_0 <H160(pk)>`. scriptSig = single
  push of redeemScript. Witness like P2WPKH.
- **P2SH-P2WSH**: redeemScript = `OP_0 <SHA256(witnessScript)>`.

## P2WPKH (SegWit v0)
```
scriptPubKey = OP_0 <H160(pk)>             (22 bytes total)
scriptSig    = empty
witness      = [<DER sig + sighash>, <pk>]
```
Address: Bech32(`bc`, version=0, payload=H160(pk)) → starts `bc1q...`.

## P2WSH (SegWit v0)
```
scriptPubKey = OP_0 <SHA256(witnessScript)>    (34 bytes)
scriptSig    = empty
witness      = [<args>, ..., <witnessScript bytes>]
```
Address: Bech32(`bc`, v=0, SHA256(witnessScript)).

## P2TR (Taproot, SegWit v1)
```
scriptPubKey = OP_1 <Q>                         (34 bytes)
              where Q = lift_x(P + t*G)
              P = internal pubkey (x-only, 32 bytes)
              t = taproot tweak = TaggedHash("TapTweak", P || merkle_root)

Key-path spend:
  witness = [<schnorr sig 64 or 65 bytes>]

Script-path spend:
  witness = [<inputs to leaf script>, ..., <leaf script>, <control block>]

  control block byte 0: 0xc0 | parity_of_Q
  + internal pubkey P (32 bytes)
  + merkle path (32 bytes per level)
```
Address: Bech32m(`bc`, v=1, payload=Q) → starts `bc1p...`.

## P2A (Pay-to-Anchor, SegWit v1 — *not* Taproot)
```
scriptPubKey = OP_1 <0x4e73>                    (4 bytes: 51 02 4e 73)
scriptSig    = empty
witness      = empty   (standard only with no witness data attached)
```
Address: Bech32m(`bc`, v=1, payload=0x4e73) → `bc1pfeessrawgf`
(`tb1pfees9rn5nz` on testnets, `bcrt1pfeesnyr2tx` on regtest).

Keyless: anybody can spend it, so it holds no value — it is a CPFP hook
that lets any party fee-bump a pre-signed transaction. BIP433 (Draft,
assigned 2025-12-08); spending became standard in Bitcoin Core 28.0
(October 2024, PR #30352), creating was already standard. Default dust
threshold for P2A is 240 sat. Pair with TRUC/BIP431 against pinning.

**Witness v1 is not a synonym for Taproot**: P2TR carries a 32-byte
program, P2A a 2-byte one. Decode on program length.

## Multi-sig (k-of-n)

Legacy P2SH:
```
redeemScript = OP_k <pk1> <pk2> ... <pkn> OP_n OP_CHECKMULTISIG
```

Native SegWit P2WSH:
```
witnessScript = OP_k <pk1> ... <pkn> OP_n OP_CHECKMULTISIG
```

Tapscript (preferred, replaces OP_CHECKMULTISIG):
```
leaf = <pk1> OP_CHECKSIG
       <pk2> OP_CHECKSIGADD
       <pk3> OP_CHECKSIGADD
       ... OP_CHECKSIGADD
       OP_<k> OP_NUMEQUAL
```

## Time-locked (cooldown vault)
```
redeemScript =
  IF
    <delay> OP_CHECKSEQUENCEVERIFY OP_DROP
    <hot_pubkey> OP_CHECKSIG
  ELSE
    <cold_pubkey> OP_CHECKSIG
  ENDIF
```
Hot path requires waiting `delay` blocks; cold path always available.

## OP_RETURN data output
```
scriptPubKey = OP_RETURN <data>
value = 0 (provably unspendable, no UTXO created)
```
Size is relay policy, not consensus: `-datacarriersize` caps the
aggregate scriptPubKey size of all nulldata outputs in the tx.
Default 100,000 since Bitcoin Core 30.0 (2025-10-10), and multiple
OP_RETURN outputs relay. `-datacarriersize=83` (= an 80-byte
payload) restores the pre-30.0 byte cap but not the one-output
rule; Knots defaults to 83 and to a single nulldata output.
