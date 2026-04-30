---
name: bitcoin-infrastructure-caravan
description: |
  Caravan: open-source web-based multisig coordinator (no install).
  Read-only by default; HW wallet support via HWI bridge.
  USE WHEN: setting up multisig without installing software,
  educational multisig flows.
allowed-tools: Read, Grep, Glob
---

# Caravan

Web-based multisig coordinator by Unchained Capital. Browser-only,
no install. Open-source.

URL: `caravanmultisig.com` (or self-hosted).

## Features

- **Multi-vendor multisig**: Trezor, Ledger, Coldcard, etc.
- **PSBT** workflow.
- **Read-only by default** — keys never leave devices.
- **Wallet creation** via descriptor + xpubs.
- **Test mode** for learning before mainnet.

## Setup flow

1. Create wallet config: pick threshold (2-of-3 etc.) + key sources.
2. For each key:
   - Connect HW wallet via HWI bridge (HTTP).
   - Enter xpub at standard derivation.
3. Save wallet config (JSON) — needed for recovery.
4. Generate addresses; verify on each HW wallet.
5. Sign PSBTs by passing through each device.

## Compared

| Aspect | Caravan | Sparrow | Specter |
|--------|---------|---------|---------|
| Install | None (web) | Yes | Yes |
| Bitcoin Core | optional | recommended | recommended |
| Multi-sig only | yes | no | no |
| Lightning | no | partial | yes |
| Maturity | mature | mature | mature |

## Use cases

- **Multisig newcomers** wanting browser-based flow.
- **Educational**: walk through multisig setup.
- **Air-gapped quick coordination** between users.

## Common issues

- HWI bridge runs locally; if not running, no HW connection.
- Pure web means cleared cache loses wallet config — **always save
  the JSON config file**.
- Public-host caveat: even though browser-only, network requests
  may leak metadata; for high-value, self-host.

## See also

- [specter-desktop/SKILL.md](../specter-desktop/SKILL.md)
- [sparrow/SKILL.md](../sparrow/SKILL.md)
- [../hardware/hwi/SKILL.md](../../hardware/hwi/SKILL.md)
- [../hardware/multi-vendor-multisig/SKILL.md](../../hardware/multi-vendor-multisig/SKILL.md)
