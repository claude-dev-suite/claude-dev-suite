# Bitcoin transaction serialization

## Legacy serialization (pre-SegWit, also used for txid hashing)

```
[4 bytes]  version (LE)
[varint]   vin count
  per input:
    [32 bytes] prevout txid (LE)
    [4 bytes]  prevout vout (LE)
    [varint]   scriptSig length
    [...]      scriptSig bytes
    [4 bytes]  sequence (LE)
[varint]   vout count
  per output:
    [8 bytes]  value in sats (LE)
    [varint]   scriptPubKey length
    [...]      scriptPubKey bytes
[4 bytes]  locktime (LE)
```

## SegWit serialization (BIP141)

After version, insert two bytes: `marker = 0x00`, `flag = 0x01`. Witness
data appended after vouts but before locktime, one stack per input:

```
[4 bytes]  version
[1 byte]   marker = 0x00
[1 byte]   flag = 0x01
[varint]   vin count
  per input: ... (same as legacy)
[varint]   vout count
  per output: ... (same as legacy)
per input:
  [varint]   witness item count
  per item:
    [varint] item length
    [...]    item bytes
[4 bytes]  locktime
```

## Hash semantics

- `txid` = SHA256d(legacy serialization, no witness).
- `wtxid` = SHA256d(segwit serialization, including witness).
- Legacy tx: `txid == wtxid`.

## Weight units (BIP141)

- `weight = base_size × 3 + total_size`
- `vsize = ceil(weight / 4)` — used for fee rate.
- Block weight cap: **4,000,000 WU** (= 1 MB legacy + ~3 MB witness discount).

## Varint (CompactSize)

| First byte | Format |
|------------|--------|
| 0x00..0xfc | The value itself |
| 0xfd | next 2 bytes LE |
| 0xfe | next 4 bytes LE |
| 0xff | next 8 bytes LE |

Different from Protobuf varint. Always little-endian.

## Endianness gotchas

- All multi-byte numeric fields = **little-endian**.
- Hash byte strings = **internal byte order** in serialization, but
  **reversed** in JSON RPC and explorers ("display" / "RPC" byte order).
  When you see `txid` in `getrawtransaction`, that's reversed from the
  bytes that go on the wire.
