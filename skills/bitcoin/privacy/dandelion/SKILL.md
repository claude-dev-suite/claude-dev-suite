---
name: bitcoin-privacy-dandelion
description: |
  Dandelion++ (BIP156): tx broadcast privacy. Stem phase (forward to
  one peer) → fluff phase (gossip to all). Hides origin IP.
  USE WHEN: evaluating tx-broadcast privacy, implementing Dandelion-
  aware relay logic.
allowed-tools: Read, Grep, Glob
---

# Dandelion++ (BIP156)

A tx broadcast privacy enhancement. Without Dandelion, tx broadcast
to all your peers immediately = first peer with chain analytics can
infer your IP.

## Mechanism

Two phases, run over an **anonymity graph** that is rebuilt every
~10 min on average (an "epoch"). Routing is fixed per epoch, not
drawn per transaction.

### Stem phase (anonymity)

- Each node picks **two** of its *outbound* peers as Dandelion
  destinations (`DANDELION_MAX_DESTINATIONS = 2`) and maps every
  inbound peer to one of them.
- A stem tx arriving on a given inbound peer always leaves via the
  same destination for the whole epoch ("per-inbound-edge"
  routing). Picking the next hop at random *per transaction*
  instead is what enables the fingerprint attack BIP156 avoids.
- Expected stem length is `1/q` — ~10 hops at BIP156's `q = 10%`.

During stem, only the chain of forwarders sees the tx.

### Fluff phase (broadcast)

- BIP156: before relaying, a node SHOULD convert the Dandelion tx
  into a typical tx with probability `q = 10%` — a coin flip
  **per transmission**.
- The Dandelion++ paper instead fixes the role **per node, per
  epoch** (diffuser or relayer, from a hash of the node's own
  identity and the epoch number), so the outcome does not depend
  on the transaction.
- A fluffing node `inv`s to all its peers; from there the tx
  propagates network-wide via standard gossip.

## Privacy benefit

- Original sender IP hidden among the stem hop pool.
- Chain analyst sees the tx first arrive from a "fluffer", not the
  origin.
- Coordinated chain-analytics nodes have to guess which fluff
  position was the source.

## Implementation status

- BIP156 dates from 2017 (`Assigned: 2017-06-09` in the BIP
  header); the Dandelion++ paper is the 2018 item.
- **Never adopted by Bitcoin Core.** BIP156 is listed with status
  **Closed** in the BIPs repo README (checked September 2026); the
  mainline tx relay path is still plain `inv` flooding.
- The only Bitcoin implementation was the BIP156 reference fork of
  Core (`dandelion-org/bitcoin`), never merged upstream. Outside
  Bitcoin, Grin and Monero implement Dandelion++ natively (both
  present on master, checked September 2026). `btcsuite/btcd`
  carries no Dandelion code, commits or issues (checked September
  2026).
- Core shipped a different answer to the same problem instead — see
  *Private broadcast* below.

## Why it was never adopted

- Adds latency to broadcast (10-30 seconds typical).
- Requires coordinated stem peers; if attacker controls many peers,
  can defeat.
- Limited measured privacy gain (still some attribution possible
  via timing).

## Private broadcast (Bitcoin Core 31.0+)

Core 31.0 (19 April 2026) added `-privatebroadcast`, a boolean node
option, default `false` (checked on master, September 2026). When
enabled, txs submitted via `sendrawtransaction` are broadcast over
**short-lived connections through Tor or I2P only**, and are not put
in the local mempool first.

Two privacy properties, per the 31.0 release notes:
1. The originator's IP address is never known to the recipients.
2. Two otherwise unrelated txs from the same originator are not
   linkable — a **separate connection per transaction** is used.

Introspection/control RPCs, also new in 31.0:
- `getprivatebroadcastinfo` — lists txs currently being privately
  broadcast.
- `abortprivatebroadcast` — drops matching txs from the private
  broadcast queue.

Constraints (from `init.cpp` on master, September 2026):
- Txs submitted **through the wallet are not affected**; the option
  only covers `sendrawtransaction`.
- Startup fails if neither Tor nor I2P is reachable.
- Incompatible with `-connect` (private broadcast must open its own
  connections to randomly chosen Tor/I2P peers); use
  `-maxconnections=0 -addnode=...` instead.
- Warns if `-proxyrandomize=0`, since Tor circuits for private
  broadcast may then correlate with other Tor connections.
- At most 64 concurrent private broadcast connections
  (`MAX_PRIVATE_BROADCAST_CONNECTIONS`); further ones pause.

**Upgrade note:** 31.0 leaked the originator IP — under certain
circumstances connections were made over clearnet rather than the
enabled privacy network. Fixed in **31.1 (July 2026)**. Do not rely
on `-privatebroadcast` on 31.0.

## Workarounds in production

Beyond (or without) `-privatebroadcast`, best practice for broadcast
privacy:
- **Broadcast over Tor** (`onlynet=onion`) — defeats IP correlation.
- **Use a relay service** (mempool.space "submit" via Tor).
- **Run your own node** — eliminates third-party attribution.

Tor-only setups achieve stronger broadcast privacy than Dandelion++
would have in practice.

## See also

- [tor/SKILL.md](../tor/SKILL.md)
- [../../protocol/p2p/SKILL.md](../../protocol/p2p/SKILL.md)
