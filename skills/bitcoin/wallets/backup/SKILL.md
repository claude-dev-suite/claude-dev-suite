---
name: bitcoin-wallet-backup
description: |
  Wallet backup formats: BIP39 mnemonic, SLIP-39 Shamir Backup, SeedQR,
  CompactSeedQR, Coldcard's CTL-format, paper backup hygiene, metal
  backup vendors and threat models.
  USE WHEN: designing backup UX, evaluating backup security, helping
  recover a backed-up seed.
allowed-tools: Read, Grep, Glob
---

# Wallet Backup Formats

## BIP39 mnemonic (standard)

12 / 15 / 18 / 21 / 24 words from BIP39 wordlist + optional
passphrase. Recoverable into any BIP39-compatible wallet.

Encoding density: 12 words ≈ 132 bits (128 entropy + 4 checksum).
Average length: ~70-90 ASCII chars.

## SLIP-39 Shamir Backup

Trezor-introduced format using Shamir's Secret Sharing:
- M-of-N share threshold.
- Each share is 20-33 words from a different wordlist (1024 words).
- Can be split into **groups** (e.g., 2-of-3 family + 2-of-2 board)
  for hierarchical recovery.

Use case: distributing shares geographically/socially without giving
any single party full key access.

Compatibility: Trezor (native), Keystone (partial), most others
require BIP39 → SLIP-39 conversion.

**Important**: SLIP-39 uses a different wordlist than BIP39 — the
shares are not BIP39 words.

## SeedQR

A QR code encoding of BIP39 mnemonic for hardware wallet interaction.

Format:
- Each word's wordlist index (0-2047) → 4 decimal digits → 4
  characters.
- 12 words → 48-char string → QR code.

CompactSeedQR variant: encodes raw entropy bytes directly (more dense,
slightly less wallet-compatible).

Use case: airgap signing devices (SeedSigner, Krux) scan a printed
SeedQR rather than typing 12 words.

## Coldcard's CTL format

`words.txt` → 24 words newline-separated. Tarot-encoded paper grids
also supported on Coldcard for entry resilience.

## Plate / metal backups

Stamping seed words into stainless steel / titanium plates protects
against fire, water, and light damage.

Vendors:
- **Cryptosteel Capsule** — letter tiles in steel cylinder.
- **Blockplate** — stamped grid.
- **SeedXOR** — XOR-based two-plate scheme (2-of-2).
- **Hodlr Plate** — center-punch grid.
- **Cobo Tablet** — stainless steel embossed plates.

Trade-offs:
- Stamped plates: durable but visible; unauthorized observer can
  read words.
- Tile-based: theft-detect-friendly (one missing tile breaks key).
- XOR plates: unreadable without both halves.

## Paper backup hygiene

- Use **acid-free** paper for >5 year shelf life.
- Avoid thermal printer paper (fades).
- **Don't laminate** seed-on-paper unless you also want to make it
  indestructible by fire — laminated paper burns sealed inside its
  pouch and is harder to destroy intentionally.
- Store in **2+ physical locations** — single point of failure.

## Threat model considerations

| Threat | Mitigation |
|--------|-----------|
| House fire | metal backup + offsite copy |
| Flood | metal backup + offsite |
| Burglary | hidden / encrypted (passphrase) |
| Coercion | passphrase = "duress" wallet with small balance + BIP85 main wallet |
| Heir access | Shamir 2-of-3 with a lawyer / family member / safety deposit box |
| Inheritance | encrypted instructions revealed on death (Casa Inheritance, dead-man switches) |

## Passphrase backup

Passphrase ("25th word") is **not** included in the BIP39 mnemonic.
It must be backed up **separately** with the same care.

- Store somewhere completely different from the seed.
- Memorize if possible.
- If compromise risk is real, use multi-factor (e.g., split into 2
  pieces).

**Loss of passphrase = loss of wallet** (no protocol-level recovery).

## Backup verification

After backup, **practice recovery** before depositing real funds:
1. Erase the wallet.
2. Restore from backup (and passphrase, if used).
3. Verify the first receiving address matches.
4. Optionally: sign a test message and verify with original
   recorded data.

Many funds are lost not from the seed loss but from a backup that
was never tested.

## Common pitfalls

- **Photo of seed** on phone → cloud-synced → exposed.
- **Passphrase not backed up** → permanent loss.
- **Confusing BIP39 ↔ SLIP-39 wordlists** during recovery.
- **Using a wallet's "backup file" (encrypted blob)** without
  understanding what's inside — wallet-specific format may not be
  importable elsewhere.
- **Single backup location** → physical risk.
- **Mixed-up passphrase capitalization** during recovery → completely
  different wallet, looks empty.

## See also

- [hd/SKILL.md](../hd/SKILL.md)
- [entropy/SKILL.md](../entropy/SKILL.md)
- [../../hardware/seedsigner/SKILL.md](../../hardware/seedsigner/SKILL.md)
- [../../hardware/coldcard/SKILL.md](../../hardware/coldcard/SKILL.md)
