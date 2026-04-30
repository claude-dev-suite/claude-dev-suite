// SPDX-License-Identifier: MIT
/**
 * Bitcoin Detection Service
 *
 * Detects Bitcoin / Lightning / L2 / metaprotocols stack signals from
 * project files (package.json, Cargo.toml, requirements.txt, go.mod,
 * pom.xml, .csproj, docker-compose, conf files, ord/inscriptions assets,
 * etc.) and surfaces matching technologies in DetectionResult so that
 * the dashboard recommends the appropriate Bitcoin agents and skills.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { DetectionResult } from '../../types.js';
import { fileExists, fileContains } from '../../utils/fs-utils.js';

// (rule.pattern, rule.value) tables: pattern is checked via `fileContains`
// and `value` is a `STACK_TO_AGENTS` key (defined in detection.constants.ts).

// Cargo.toml dependencies → Bitcoin tech
const CARGO_BITCOIN_RULES = [
  { pattern: '"bitcoin"', value: 'bitcoin-rust' },
  { pattern: 'bdk_wallet', value: 'bitcoin-bdk' },
  { pattern: '"bdk"', value: 'bitcoin-bdk' },
  { pattern: 'ldk-node', value: 'bitcoin-ldk' },
  { pattern: '"lightning"', value: 'bitcoin-ldk' },
  { pattern: '"miniscript"', value: 'bitcoin-miniscript' },
  { pattern: 'rust-miniscript', value: 'bitcoin-miniscript' },
  { pattern: 'secp256k1', value: 'bitcoin-cryptography' },
  { pattern: '"dlc"', value: 'bitcoin-dlc' },
  { pattern: 'rust-dlc', value: 'bitcoin-dlc' },
  { pattern: 'taproot-assets', value: 'bitcoin-taproot-assets' },
  { pattern: 'rgb-core', value: 'bitcoin-rgb' },
  { pattern: 'rgb-lightning', value: 'bitcoin-rgb' },
] as const;

// package.json dependencies (TS/JS) → Bitcoin tech
const NPM_BITCOIN_RULES = [
  { pattern: 'bitcoinjs-lib', value: 'bitcoin-ts' },
  { pattern: '@scure/btc-signer', value: 'bitcoin-ts' },
  { pattern: '"bip32"', value: 'bitcoin-ts' },
  { pattern: '"bip39"', value: 'bitcoin-ts' },
  { pattern: '@mempool/mempool.js', value: 'bitcoin-mempool-js' },
  { pattern: '"bolt11"', value: 'bitcoin-lightning-ts' },
  { pattern: 'light-bolt11-decoder', value: 'bitcoin-lightning-ts' },
  { pattern: 'lightning-encoder', value: 'bitcoin-lightning-ts' },
  { pattern: '@cashu/cashu-ts', value: 'bitcoin-cashu' },
  { pattern: '@nostr-wallet-connect', value: 'bitcoin-nwc' },
  { pattern: 'webln', value: 'bitcoin-webln' },
  { pattern: '@getalby/bitcoin-connect', value: 'bitcoin-webln' },
  { pattern: '@stacks/transactions', value: 'bitcoin-stacks' },
  { pattern: '@rsksmart/', value: 'bitcoin-rsk' },
] as const;

// requirements.txt / pyproject.toml → Python Bitcoin tech
const PYTHON_BITCOIN_RULES = [
  { pattern: 'python-bitcoinlib', value: 'bitcoin-python' },
  { pattern: 'embit', value: 'bitcoin-embit' },
  { pattern: 'bdkpython', value: 'bitcoin-bdk' },
  { pattern: 'bitcoinlib', value: 'bitcoin-python' },
  { pattern: 'hdwallet', value: 'bitcoin-python' },
  { pattern: 'cashu', value: 'bitcoin-cashu' },
  { pattern: 'pyln-client', value: 'bitcoin-cln' },
] as const;

// go.mod → Go Bitcoin tech
const GO_BITCOIN_RULES = [
  { pattern: 'btcsuite/btcd', value: 'bitcoin-go' },
  { pattern: 'lightningnetwork/lnd', value: 'bitcoin-lnd' },
  { pattern: 'lightninglabs/taproot-assets', value: 'bitcoin-taproot-assets' },
  { pattern: 'lightninglabs/loop', value: 'bitcoin-lnd' },
  { pattern: 'btcsuite/btcutil', value: 'bitcoin-go' },
] as const;

// pom.xml / build.gradle → JVM Bitcoin tech
const JVM_BITCOIN_RULES = [
  { pattern: 'org.bitcoinj', value: 'bitcoinj' },
  { pattern: 'bitcoinj-core', value: 'bitcoinj' },
  { pattern: 'bdk-jvm', value: 'bitcoin-bdk' },
  { pattern: 'bdk-android', value: 'bitcoin-bdk' },
  { pattern: 'org.bitcoindevkit', value: 'bitcoin-bdk' },
] as const;

// .csproj → .NET Bitcoin tech
const DOTNET_BITCOIN_RULES = [
  { pattern: 'NBitcoin', value: 'bitcoin-nbitcoin' },
  { pattern: 'BTCPayServer', value: 'bitcoin-btcpay' },
] as const;

// Operational config files → operations tech
const OPS_FILE_SIGNALS: Array<{ file: string; tech: string }> = [
  { file: 'bitcoin.conf', tech: 'bitcoin-core' },
  { file: 'lnd.conf', tech: 'bitcoin-lnd' },
  { file: 'eclair.conf', tech: 'bitcoin-eclair' },
  { file: 'electrs.toml', tech: 'bitcoin-electrs' },
  { file: 'fulcrum.conf', tech: 'bitcoin-fulcrum' },
  { file: 'tapd.conf', tech: 'bitcoin-taproot-assets' },
  { file: 'arkd.conf', tech: 'bitcoin-ark' },
  { file: 'phoenix.conf', tech: 'bitcoin-phoenixd' },
];

// Docker compose images → tech
const COMPOSE_IMAGE_RULES = [
  { pattern: 'lncm/bitcoind', value: 'bitcoin-core' },
  { pattern: 'btcpayserver/bitcoin', value: 'bitcoin-core' },
  { pattern: 'lightninglabs/lnd', value: 'bitcoin-lnd' },
  { pattern: 'lightninglabs/tapd', value: 'bitcoin-taproot-assets' },
  { pattern: 'elementsproject/lightningd', value: 'bitcoin-cln' },
  { pattern: 'cashubtc/nutshell', value: 'bitcoin-cashu' },
  { pattern: 'fedimint/fedimintd', value: 'bitcoin-fedimint' },
  { pattern: 'btcpayserver/btcpayserver', value: 'bitcoin-btcpay' },
  { pattern: 'getumbrel/electrs', value: 'bitcoin-electrs' },
  { pattern: 'mempool/backend', value: 'bitcoin-mempool-space' },
  { pattern: 'mempool/frontend', value: 'bitcoin-mempool-space' },
  { pattern: 'arkade/arkd', value: 'bitcoin-ark' },
  { pattern: 'blockstream/esplora', value: 'bitcoin-esplora' },
] as const;

export class BitcoinDetectionService {
  /**
   * Detect Bitcoin technologies for the given project root and append
   * matching tags to the DetectionResult's `additionalTechnologies` set
   * via the supplied addTechnology callback.
   */
  detect(
    checkPath: string,
    result: DetectionResult,
    addTechnology: (result: DetectionResult, tech: string) => void,
  ): boolean {
    let detected = false;
    const safeRead = (p: string): string | null => {
      try {
        const full = path.join(checkPath, p);
        if (!fs.existsSync(full)) return null;
        return fs.readFileSync(full, 'utf-8');
      } catch {
        return null;
      }
    };

    // Cargo.toml
    const cargoToml = safeRead('Cargo.toml');
    if (cargoToml) {
      for (const rule of CARGO_BITCOIN_RULES) {
        if (cargoToml.includes(rule.pattern)) {
          addTechnology(result, rule.value);
          detected = true;
        }
      }
    }

    // package.json
    const pkgJson = safeRead('package.json');
    if (pkgJson) {
      for (const rule of NPM_BITCOIN_RULES) {
        if (pkgJson.includes(rule.pattern)) {
          addTechnology(result, rule.value);
          detected = true;
        }
      }
    }

    // requirements.txt + pyproject.toml
    const reqTxt = safeRead('requirements.txt');
    const pyproject = safeRead('pyproject.toml');
    const pythonContent = (reqTxt ?? '') + '\n' + (pyproject ?? '');
    if (pythonContent.trim().length > 0) {
      for (const rule of PYTHON_BITCOIN_RULES) {
        if (pythonContent.includes(rule.pattern)) {
          addTechnology(result, rule.value);
          detected = true;
        }
      }
    }

    // go.mod
    const goMod = safeRead('go.mod');
    if (goMod) {
      for (const rule of GO_BITCOIN_RULES) {
        if (goMod.includes(rule.pattern)) {
          addTechnology(result, rule.value);
          detected = true;
        }
      }
    }

    // pom.xml or any *.gradle / *.gradle.kts via simple read of common names
    const pomXml = safeRead('pom.xml');
    const gradle = safeRead('build.gradle') ?? safeRead('build.gradle.kts');
    const jvmContent = (pomXml ?? '') + '\n' + (gradle ?? '');
    if (jvmContent.trim().length > 0) {
      for (const rule of JVM_BITCOIN_RULES) {
        if (jvmContent.includes(rule.pattern)) {
          addTechnology(result, rule.value);
          detected = true;
        }
      }
    }

    // .csproj — best-effort scan first matching file
    try {
      const entries = fs.readdirSync(checkPath, { withFileTypes: true });
      const csprojs = entries
        .filter((e) => e.isFile() && e.name.endsWith('.csproj'))
        .map((e) => e.name);
      for (const f of csprojs) {
        const content = safeRead(f);
        if (!content) continue;
        for (const rule of DOTNET_BITCOIN_RULES) {
          if (content.includes(rule.pattern)) {
            addTechnology(result, rule.value);
            detected = true;
          }
        }
      }
    } catch {
      // ignore — directory not readable is not fatal
    }

    // Operational config files
    for (const sig of OPS_FILE_SIGNALS) {
      if (fileExists(checkPath, sig.file)) {
        addTechnology(result, sig.tech);
        detected = true;
      }
    }

    // Docker compose
    const composeFiles = ['docker-compose.yml', 'docker-compose.yaml'];
    for (const composeFile of composeFiles) {
      if (fileExists(checkPath, composeFile)) {
        for (const rule of COMPOSE_IMAGE_RULES) {
          if (fileContains(checkPath, composeFile, rule.pattern)) {
            addTechnology(result, rule.value);
            detected = true;
          }
        }
      }
    }

    // Ordinals / Runes / Inscriptions presence (low-confidence signal)
    if (
      fileExists(checkPath, 'inscriptions') ||
      fileExists(checkPath, 'runes.json') ||
      fileExists(checkPath, 'ord.yaml')
    ) {
      addTechnology(result, 'bitcoin-metaprotocols');
      detected = true;
    }

    if (detected) {
      result.confidence += 10;
    }

    return detected;
  }
}
