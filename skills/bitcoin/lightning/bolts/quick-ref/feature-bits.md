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
0  / 1   option_data_loss_protect            ASSUMED; recovery on reconnect
4  / 5   option_upfront_shutdown_script      cooperative close addr commitment
6  / 7   gossip_queries                      selective gossip sync
8  / 9   var_onion_optin                     ASSUMED; TLV onion payload
10 / 11  gossip_queries_ex                   extended gossip query
12 / 13  option_static_remotekey             ASSUMED; stable to_remote
14 / 15  payment_secret                      ASSUMED; BOLT 11 's' tag
16 / 17  basic_mpp                           multi-path payments
18 / 19  option_support_large_channel        "wumbo" > 0.16777216 BTC
22 / 23  option_anchors                      anchor commitment, zero-fee HTLC tx
24 / 25  option_route_blinding               BOLT 4 blinded paths
26 / 27  option_shutdown_anysegwit           close to any segwit addr
28 / 29  option_dual_fund                    v2 dual-funded channels
34 / 35  option_quiesce                      pause channel updates (`stfu`)
36 / 37  option_attribution_data             attribution data, fulfillment_payload
38 / 39  option_onion_messages               onion message protocol
40 / 41  zero_fee_commitments                zero-fee commitment/HTLC txs (v3)
42 / 43  option_provide_storage              store-and-forward backups
44 / 45  option_channel_type                 ASSUMED; explicit channel type
46 / 47  option_scid_alias                   short_channel_id aliases, privacy
48 / 49  option_payment_metadata             extra metadata via TLV record
50 / 51  option_zeroconf                     accept channel before confirmation
60 / 61  option_simple_close                 simplified closing negotiation
62 / 63  option_splice                       splicing in/out
66 / 67  option_onion_messages_only_channels onion msgs from channel peers only
```

(Table transcribed from `09-features.md` on lightning/bolts master as of
September 2026; repo HEAD `1528972`, 2026-08-26. Bits not listed above are
unassigned in BOLT 9. Consult the spec for anything added since.)

### Bits defined outside 09-features.md

```
80 / 81    option_simple_taproot          simple taproot channels
180 / 181  option_simple_taproot_staging  pre-final staging variant
```

Simple taproot channels live in the extension BOLT `bolt-simple-taproot.md`,
merged to lightning/bolts master on 2026-05-04 (PR #995), not in the numbered
BOLT 9 table. LND names these `SimpleTaprootChannels{Required,Optional}Final`
(80/81) and `...Staging` (180/181) in `lnwire/features.go`.

Bits with no BOLT 9 assignment that you will still see on the wire:
- `keysend` — LND advertises 54/55; never assigned by BOLT 9.
- Trampoline routing — BOLTs PR #836 proposes 56/57, still unmerged as of
  September 2026. rust-lightning defines `Trampoline` at 56/57; Eclair
  advertises only its own pre-spec `trampoline_payment_prototype` at
  148/149.

### History

Legacy `option_anchor_outputs` used to occupy 20/21 and
`option_anchors_zero_fee_htlc_tx` 22/23. On 2024-05-20 BOLT 9 deleted the
20/21 row and renamed the surviving 22/23 feature to `option_anchors`, so
today 20/21 is retired rather than reusable (LND still defines
`AnchorsOptional = 21` for the legacy commitment type).

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

## Implementation status (September 2026)

| Feature | LND | CLN | LDK | Eclair |
|---------|-----|-----|-----|--------|
| option_anchors (22/23) | required default | required default | yes | yes |
| basic_mpp | yes | yes | yes | yes |
| zeroconf | optional | optional | optional | optional |
| route_blinding | yes | yes | yes | yes |
| option_simple_taproot (80/81) | yes | no | no | yes |
| option_splice (62/63) | no | yes (default) | yes | yes |
| dual_fund (28/29) | no | yes | partial | yes |

(Read September 2026 off each project's feature registry on master: lnd
v0.21.3-beta, CLN v26.06.7, rust-lightning v0.2.6 (2026-09-09), Eclair
v0.14.3. `lnd` defines no 28/29 bit at all, and no 62/63 bit either: v0.21.0
(2026-06-05) describes its taproot nonce rework only as "groundwork for
splice support" and there is still no splice RPC in `lnrpc/lightning.proto`
at v0.21.3-beta. CLN turned
splicing on by default in v26.04 (2026-04-20). rust-lightning has supported
splicing since v0.2 (2025-12-03) — `SpliceProduction` at 62/63, with
`SplicePrototype` realigned onto bit 63 in v0.2.2 (2026-02-06) for Eclair
compatibility. Per-implementation reasoning: SKILL.md.)

## Common bugs

- Setting an even bit unconditionally without checking peer support →
  connection closed.
- Forgetting to support `var_onion_optin` (effectively required) →
  unreachable from modern peers.
- `option_payment_metadata` mishandling: payment_metadata field MUST
  be passed back in HTLC for verification.
- Treating odd-bit-only features as mandatory → over-strict.
