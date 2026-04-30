# Feature bits reference (BOLT 9)

## Bit pair semantics

Each feature uses TWO bits:
- Even bit = "required" (peer MUST support).
- Odd bit = "optional" (peer MAY support).

Sender of `init` advertises bits. Receiver checks:
- For each EVEN bit set in peer's `init`, MUST also support it locally
  or close the connection.
- For each ODD bit set, MAY use feature; not required.

## Selected feature bits

```
0  / 1   option_data_loss_protect          channel state recovery on reconnect
4  / 5   option_upfront_shutdown_script    cooperative close addr commitment
6  / 7   gossip_queries                    selective gossip sync
8  / 9   var_onion_optin                   variable onion (TLV payload)
10 / 11  gossip_queries_ex                 extended gossip query
12 / 13  option_static_remotekey           stable to_remote, no rotation
14 / 15  payment_secret                    enables MPP (BOLT 11 's' tag)
16 / 17  basic_mpp                         multi-path payments
18 / 19  option_support_large_channel      "wumbo" > 0.16777216 BTC
20 / 21  option_anchors_zero_fee_htlc_tx   modern anchor commitment
22 / 23  option_anchor_outputs             legacy anchor (use 20/21 instead)
24 / 25  option_route_blinding             BOLT 4 blinded paths
26 / 27  option_shutdown_anysegwit         close to any segwit addr
28 / 29  option_dual_fund                  v2 dual-funded channels
30 / 31  option_quiesce                    pause channel updates
32 / 33  option_onion_messages             onion message protocol
34 / 35  option_provide_storage            store-and-forward backups
38 / 39  option_zeroconf                   accept channel before confirmations
40 / 41  option_scid_alias                 short_channel_id aliases for privacy
44 / 45  option_payment_metadata           extra metadata via PaymentMetadata TLV
50 / 51  option_keysend                    spontaneous payments via TLV
54 / 55  option_trampoline_routing         trampoline routing
56 / 57  option_simple_taproot_chans       taproot channels
58 / 59  option_splice                     splicing in/out
60 / 61  option_async_payments             async receive
62 / 63  option_route_blinding             (alias / variant)
```

(Numbering taken from BOLT 9 latest; consult current spec for any
recent additions.)

## Negotiation

`init` message exchanges:
```
init {
    globalfeatures: <bits>,    (deprecated; use features)
    features:       <bits>,
    networks: TLV,             (chain hashes supported)
    remote_addr: TLV,           (peer-observed remote address)
}
```

After exchange, both sides compute the **intersection** of feature
sets and use only mutually supported features.

## Implementation status (late 2025)

| Feature | LND | CLN | LDK | Eclair |
|---------|-----|-----|-----|--------|
| anchors_zero_fee_htlc_tx | required default | required default | yes | yes |
| basic_mpp | yes | yes | yes | yes |
| zeroconf | optional | optional | optional | optional |
| route_blinding | yes | yes | yes | yes |
| simple_taproot_chans | partial | partial | partial | partial |
| splice | partial | yes | partial | yes |
| dual_fund | partial | yes | partial | yes |

## Common bugs

- Setting an even bit unconditionally without checking peer support →
  connection closed.
- Forgetting to support `var_onion_optin` (effectively required) →
  unreachable from modern peers.
- `option_payment_metadata` mishandling: payment_metadata field MUST
  be passed back in HTLC for verification.
- Treating odd-bit-only features as mandatory → over-strict.
