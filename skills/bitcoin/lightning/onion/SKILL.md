---
name: lightning-onion
description: |
  Sphinx onion routing for Lightning (BOLT 4): packet structure, per-hop
  encryption, payload TLV, blinded paths, attribution data, onion messages.
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
- `um` (HMAC-SHA256) — authenticate failure messages on the backward
  path; the backward XOR stream uses `ammag` (and `ammagext` for
  attribution data).

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
return_packet = hmac(32B) || failure_len(2B) || failuremsg
                || pad_len(2B) || pad
hmac          = HMAC-SHA256(um_key_i, rest of return_packet)
obfuscated    = return_packet XOR chacha20_stream(ammag_key_i)
```

Each upstream hop wraps with its own `ammag` stream — no hop decrypts
or re-MACs. The source peels the layers in route order and attributes
the failure to the first hop whose `um` HMAC verifies, so eventually
only the source can read the original failure.

This prevents intermediate nodes from learning the source's identity
even on failure.

## Attribution data (feature 36/37)

`option_attribution_data` (BOLT 9 bits 36/37, merged into BOLT 4
2025-11-17 by bolts PR #1044) adds a second return field next to
`reason`, carried as TLV type 1 on **both** `update_fail_htlc` and
`update_fulfill_htlc`:

```
htlc_hold_times  20 * u32        per-hop hold time, units of 100 ms
truncated_hmacs  210 * 4 bytes   HMAC-SHA256 truncated to 4 bytes
```

Each hop shifts both arrays back one slot (pruning the now-unreachable
HMACs), writes its own hold time at the front, adds its 20 truncated
HMACs — one per position it could occupy, since only the sender knows
where it sits — and XORs the whole block with a stream from a new key
type `ammagext`. `hmac_x_y` covers, in order: the return packet before
obfuscation, the first `y+1` hold times, and the `y` downstream HMACs.
So a hop cannot tamper with anything downstream without invalidating
its own HMAC. 210 = 20+19+...+1, the HMACs still reachable after
pruning.

The origin verifies each hop's HMAC with that hop's `um` key. The first
HMAC that fails is the blame boundary: it makes a failure
*attributable* to a node pair rather than to the whole route, and the
recorded hold times give the sender a per-hop latency measurement for
scoring. Reporting zero is allowed for nodes without accurate timing;
the sender should then spread the latency penalty across hops.

Hops reached with `path_key` set (inside a blinded path) do **not**
contribute attribution data — they fail via
`update_fail_malformed_htlc` with `invalid_onion_blinding`, and their
timings would aid de-anonymization. Attribution therefore stops at the
introduction node, or at the first hop not advertising 36/37.

Size caps, added by bolts PR #1349 (merged 2026-08-26), to leave room
for `attribution_data` in the message:

- Return packets: at most 32768 bytes (32 KiB). Earlier versions
  allowed larger, so an intermediate node **truncates** an oversized
  return packet to its first 32768 bytes rather than rejecting it.
- `fulfillment_payload`: at most 32 KiB, and since it shipped with the
  limit there is no legacy case — a receiver MUST send `error` and
  fail the channel on an oversized one.

## fulfillment_payload (success-side return data)

bolts PR #1344 (merged 2026-07-27) adds TLV type 3 on
`update_fulfill_htlc`: optional data the **final** node returns to the
origin on success, the mirror of `reason` on the failure side.

```
plaintext  = fulfillment_payload_tlvs   (type 1 = padding; no other
                                         record types defined yet)
             padded to >= 256 and a multiple of 256 bytes, tag excluded
key        = key type `fulfillment` from ss_final
payload    = ChaCha20-Poly1305(key, nonce = all zero, plaintext) || tag
```

Each intermediate hop obfuscates it with its `ammag` key exactly as it
wraps a failure return packet; the final node does not, since the
ciphertext is already the innermost layer. Intermediate
`attribution_data` HMACs additionally cover the `fulfillment_payload`
as received from downstream; the final node's HMACs do not.

Unlike `attribution_data`, this is *not* gated on `path_key`: a blinded
final node MAY originate one and blinded hops obfuscate and relay it,
because the origin shares a secret with every hop — using the blinded
pubkey for blinded hops. A recipient hiding behind dummy hops must
therefore originate the payload as if it were the last hop, applying
the concealed hops' obfuscation itself, so the origin's fixed peel
count still decodes.

Two independent checks, deliberately different in extent: the Poly1305
tag is end-to-end and catches tampering by any hop, blinded or not;
the attribution HMACs give per-hop blame only where hops contribute
them.

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

## Onion messages (BOLT 9 bits 38/39)

`option_onion_messages`: send arbitrary messages along the LN graph
without involving HTLCs / payments. Used for:
- Negotiating BOLT12 invoice requests.
- Trampoline routing setup.
- Ad-hoc out-of-band messages between LN nodes.

Format: same Sphinx packet structure, no HTLC attached.

## Constants and limits

- Total onion size: 1300 bytes hops_data. With TLV ~ 27 hops max.
- Padding: filler bytes to maintain constant size at each hop.
- Nonce: ChaCha20 streams use a fixed 96-bit zero nonce; safety comes
  from keys never being reused (BOLT 4, "Pseudo Random Byte Stream").

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
- [channel-jamming/SKILL.md](../channel-jamming/SKILL.md)
