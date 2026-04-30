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

## Privacy gotchas

- **Tx broadcast leaks** if you broadcast a tx to a random peer that
  knows your IP. With `onlynet=onion`, all P2P over Tor → no leak.
- **Block download** also goes over Tor → slower IBD.
- **DNS leak** if `proxy` is set but DNS queries go elsewhere → use
  `dns=0` and pre-bootstrap nodes via `addnode=`.
- **Time correlation** — even over Tor, tx timing can leak info.
  Mitigation: Dandelion++ (BIP156) randomizes broadcast.

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
