---
name: bitcoin-privacy-tor
description: |
  Bitcoin over Tor: Tor v3 hidden services, onion-only nodes,
  bitcoind torcontrol integration, Lightning over Tor.
  USE WHEN: hardening node privacy, configuring onion-only setups,
  debugging Tor + bitcoind interaction.
allowed-tools: Read, Grep, Glob
---

# Bitcoin over Tor

Bitcoin Core has built-in support for routing P2P traffic over Tor.
Both inbound and outbound. Same for Lightning impls.

## Configuration (bitcoind)

```ini
proxy=127.0.0.1:9050
listen=1
listenonion=1
torcontrol=127.0.0.1:9051
torpassword=...           # OR cookie auth
externalip=...           # auto-discovered via Tor v3 hidden service

# Onion-only: drop all clearnet
onlynet=onion
```

`bitcoind` connects to Tor's controlport, creates a Tor v3 hidden
service automatically, advertises it via gossip.

`tor` is no longer accepted as a network name: Bitcoin Core 31.0
(April 2026) removed it, having deprecated it in favour of `onion`
back in v0.17.0. Write `onlynet=onion`, never `onlynet=tor`.

## Tor v3 only

BIP155 addrv2 introduced support for Tor v3. Tor v2 deprecated by
Tor project + Bitcoin Core.

Format: 56-character `.onion` (Tor v3 vs the older 16-char v2).

## Lightning over Tor

LND, CLN, LDK all support Tor:
- Inbound via `tor.v3=true` or similar config.
- Outbound: SOCKS5 to Tor proxy.
- Hidden service for receiving connections + invoices via private
  routes.

## Privacy benefit

- **IP address concealment** — peers don't learn your IP.
- **Geographic concealment** — no inferring location.
- **Censorship resistance** — Tor circumvents IP-based blocks.

## Private broadcast (Core 31.0+)

Bitcoin Core 31.0 (April 2026) added `-privatebroadcast`. Transactions
submitted via `sendrawtransaction` are broadcast over short-lived
connections through the Tor or I2P networks, without entering the local
mempool first:

```ini
privatebroadcast=1
```

Two gains: recipients never learn the originator's IP, and two
otherwise unrelated txs are not linkable, because a separate connection
is used per transaction.

- `getprivatebroadcastinfo` lists txs currently being privately
  broadcast; `abortprivatebroadcast` drops them from the queue.
- A separate connection is not by itself a separate Tor circuit:
  bitcoind warns at startup when `-proxyrandomize` is disabled that
  private-broadcast circuits may be correlated with other connections
  over Tor. Keep `-proxyrandomize=1` (the default).
- Wallet-submitted transactions are **not** affected by the option.
- Incompatible with `-connect`; bitcoind refuses to start if neither
  Tor nor I2P is reachable.

**Run 31.1 or later.** A disclosure of 6 June 2026 ("Private Broadcast
May Reveal Sender IP Address in Bitcoin Core 31.0", credited to Eugene
Siegel) describes an IP leak in 31.0: when private broadcast picks an
IPv4/IPv6 peer advertising BIP324 v2 transport and the v2 handshake
fails, the v1 retry does not go through the proxy and connects
directly, revealing the originator's IP to the recipient. Onion and
I2P peers are out of scope, as is the wallet broadcast path — and so
is any node that cannot make direct clearnet outbound connections in
the first place (`onlynet=onion` or a global `proxy=`). Upstream
workarounds for a node stuck on 31.0: `-privatebroadcast=0`,
`-v2transport=0`, or `-proxy=127.0.0.1:9050` so IPv4/IPv6 outbound is
proxied too. Fixed in 31.1 (8 July 2026), PRs #35032 and #35410.

## Privacy gotchas

- **Tx broadcast leaks** if you broadcast a tx to a random peer that
  knows your IP. With `onlynet=onion`, all P2P over Tor → no leak.
- **Block download** also goes over Tor → slower IBD.
- **DNS leak** if `proxy` is set but DNS queries go elsewhere → use
  `dns=0` and pre-bootstrap nodes via `addnode=`.
- **Time correlation** — even over Tor, tx timing can leak info.
  Mitigation in Core is `-privatebroadcast` (31.0+, see above).
  Dandelion++ (BIP156) was never merged into Core and the BIP is
  marked Closed in the BIPs repo (as of September 2026).

## Performance

- Tor v3 hidden service: ~50-100 ms RTT typical.
- IBD over Tor: ~2-3x slower than clearnet.
- Lightning channel ops: minor latency hit.

## I2P alternative

Bitcoin Core supports I2P via SAM:
```ini
i2psam=127.0.0.1:7656
```

Less common than Tor but provides a different network.

## CJDNS

Mesh-network IPv6 (fc00::/7). Bitcoin nodes can reach each other
without exiting to clearnet:
```ini
cjdnsreachable=1
```

Niche; mostly used by experimental peer-to-peer enthusiasts.

## Common bugs

- Forgetting `listenonion=1` → no inbound from Tor peers.
- Mixing clearnet + Tor without `onlynet=onion` → mixed routing.
- Tor circuit failures cause peer drops; bitcoind retries
  automatically.
- `externalip=` set incorrectly → wrong gossip advertisement.

## See also

- [../../core/operations/SKILL.md](../../core/operations/SKILL.md)
- [../../protocol/p2p/SKILL.md](../../protocol/p2p/SKILL.md)
- [dandelion/SKILL.md](../dandelion/SKILL.md)
