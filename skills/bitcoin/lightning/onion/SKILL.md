---
name: lightning-onion
description: |
  Sphinx onion routing for Lightning (BOLT 4): packet structure, per-hop
  encryption, payload TLV, blinded paths, onion messages.
  USE WHEN: implementing onion construction/decryption, debugging
  routing payloads, designing onion-based off-chain protocols.
allowed-tools: Read, Grep, Glob
---

# Lightning Onion Routing (Sphinx)

Lightning uses Sphinx — an anonymity-set-of-N onion routing protocol.
Each hop knows only the previous and next hops, not source/destination.

## Packet structure (BOLT 4)

```
[1 byte]    version (0x00)
[33 bytes]  ephemeral compressed pubkey
[1300 bytes] hops_data (encrypted)
[32 bytes]  HMAC over the packet
```

Total: 1366 bytes.

Up to 20 hops at 65 bytes/hop in legacy mode, or 27 hops in TLV mode.

## Per-hop derivation

For each hop `i`:
```
shared_secret_i = ECDH(node_i_privkey, ephemeral_pubkey)
rho_key_i, mu_key_i, um_key_i = derive_keys(shared_secret_i)
```

Used for:
- `rho` (ChaCha20) — encrypt forward stream.
- `mu` (HMAC-SHA256) — verify HMAC.
- `um` (XOR) — decrypt failure messages on backward path.

## Per-hop payload (TLV mode)

```
TLV records, each: type, length, value:
  type 2: amt_to_forward (u64)
  type 4: outgoing_cltv_value (u32)
  type 6: short_channel_id (u64)
  type 8: payment_data { payment_secret, total_msat }   (final hop)
  type 10: encrypted_recipient_data (for blinded paths)
  type 16: payment_metadata
  custom records (>= 65536, per BOLT 4)
```

For non-final hops: `short_channel_id` says which channel to forward
on.
For final hop: omit `short_channel_id`, include `payment_data`.

## Onion construction (sender)

```python
def build_onion(route, payloads, payment_hash):
    eph_priv = random_scalar()
    eph_pub  = eph_priv * G

    shared_secrets = []
    cur_priv = eph_priv
    for hop in route:
        ss = ecdh(cur_priv, hop.pubkey)
        shared_secrets.push(ss)
        # blinding factor for next hop
        b = sha256(eph_pub_bytes(cur_priv) || ss)
        cur_priv = (cur_priv * b) mod n

    # Build hops_data layered backward
    hops_data = zeros(1300)
    for i in reverse(range(len(route))):
        # Generate fillers for previous hops
        # Encrypt payload[i] using rho_key[i]
        # Insert payload bytes
        ...

    return SphinxPacket(version=0, eph_pub=eph_pub_initial, hops_data, hmac)
```

Reference impl: `rust-bitcoin/lightning-onion`, BOLT 4 test vectors.

## Onion processing (forwarder)

```python
def process_onion(my_priv, packet):
    # 1. Verify HMAC
    ss = ecdh(my_priv, packet.eph_pub)
    if hmac(mu_key(ss), payload) != packet.hmac: REJECT

    # 2. Decrypt one layer
    payload, rest = chacha20_decrypt(rho_key(ss), packet.hops_data)

    # 3. Read this hop's data
    my_payload = parse_tlv(payload)

    # 4. Build packet for next hop
    next_eph_pub = ss-derived blinded next eph_pub
    return next_packet, my_payload
```

## Failure messages

When a hop fails the HTLC, it returns a failure message **encrypted
backward** along the route:
```
fail_msg = padding || code || data
encrypted = chacha20(um_key_i, fail_msg)
```

Each upstream hop decrypts using their own `um_key`, eventually only
the source can read the original failure.

This prevents intermediate nodes from learning the source's identity
even on failure.

## Blinded paths (BOLT 4 update)

Receiver constructs a partial route hiding the final hops:
```
introduction_node → blinded_node_2 → blinded_node_3 (= recipient)
```

Each blinded hop's pubkey is mathematically derived such that:
- Forwarders see only an opaque blinded pubkey.
- The blinded-payload TLV (type 10) tells each hop how to forward.

Sender's pathfinder routes to the introduction node; from there the
onion handles the rest.

## Onion messages (BOLT 9 bit 32)

`option_onion_messages`: send arbitrary messages along the LN graph
without involving HTLCs / payments. Used for:
- Negotiating BOLT12 invoice requests.
- Trampoline routing setup.
- Ad-hoc out-of-band messages between LN nodes.

Format: same Sphinx packet structure, no HTLC attached.

## Constants and limits

- Total onion size: 1300 bytes hops_data. With TLV ~ 27 hops max.
- Padding: filler bytes to maintain constant size at each hop.
- Nonce: ChaCha20 with 16-byte nonce derived from shared secret.

## Common bugs

- Reusing `eph_priv` across two onions → linkability across payments.
- Incorrect HMAC verification (compute over wrong subset of packet).
- Misplaced filler bytes → onion arrives garbled at later hops.
- Forgetting to set `payment_secret` in final TLV → receiver
  rejects with `incorrect_or_unknown_payment_details`.
- Using legacy 65-byte payload format on a peer that requires TLV.

## See also

- [routing/SKILL.md](../routing/SKILL.md)
- [bolts/SKILL.md](../bolts/SKILL.md)
- [bolt12/SKILL.md](../bolt12/SKILL.md)
