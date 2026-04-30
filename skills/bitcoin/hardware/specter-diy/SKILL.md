---
name: bitcoin-hardware-specter-diy
description: |
  Specter DIY: open-source HW wallet built on STM32 dev board with
  display. By the Specter team.
  USE WHEN: building Specter DIY, evaluating DIY HW signing options.
allowed-tools: Read, Grep, Glob
---

# Specter DIY

DIY hardware wallet by the Specter team (Crypto Advance). Built on
STM32 dev boards with attached displays.

## Hardware (DIY)

- STM32F469-Discovery board (~$80).
- Custom firmware via PlatformIO.
- USB connection.

## Operation

- Standard PSBT signing flow via Specter Desktop.
- Single-coin (Bitcoin) signing.
- Multisig coordination via Specter Desktop.

## Compared to other DIYs

| Aspect | Specter DIY | SeedSigner | Krux |
|--------|-------------|------------|------|
| Hardware | STM32 dev board | Raspberry Pi | Sipeed M5StickV |
| Cost | Mid ($80) | Low ($60) | Low ($50) |
| Statelessness | Stateful | Stateless | Stateless |
| Coordination | Specter Desktop | Multiple wallets | Multiple wallets |
| Tinkering required | Some | Some | Some |

## Use cases

- **Specter Desktop ecosystem** users wanting matching hardware.
- **STM32 enthusiasts** preferring real hardware-level dev.

## Limitations

- **Smaller community** than SeedSigner / Krux.
- **STM32 hardware** availability sometimes limited.

## See also

- [seedsigner/SKILL.md](../seedsigner/SKILL.md)
- [krux/SKILL.md](../krux/SKILL.md)
- [../infrastructure/specter-desktop/SKILL.md](../../infrastructure/specter-desktop/SKILL.md)
