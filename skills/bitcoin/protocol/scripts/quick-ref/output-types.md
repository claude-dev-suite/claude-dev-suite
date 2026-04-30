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
scriptPubKey = OP_RETURN <data, ≤ 80 bytes>
value = 0 (provably unspendable, no UTXO created)
```
