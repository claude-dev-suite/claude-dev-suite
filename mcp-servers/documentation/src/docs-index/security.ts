// SPDX-License-Identifier: MIT
/**
 * Security documentation
 * Includes: Cryptography, GDPR compliance
 */

import type { DocsRecord } from "./types.js";

export const SECURITY_TECHNOLOGIES = [
  "cryptography",
  "gdpr",
  "cpp-security",
] as const;

export const securityDocs: DocsRecord = {
  cryptography: {
    hashing: {
      local: "cryptography/hashing.md",
      url: "https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html",
    },
    encryption: {
      local: "cryptography/encryption.md",
      url: "https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html",
    },
    "key-management": {
      local: "cryptography/key-management.md",
      url: "https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html",
    },
    hmac: {
      local: "cryptography/hmac.md",
      url: "https://datatracker.ietf.org/doc/html/rfc2104",
    },
    signing: {
      local: "cryptography/signing.md",
      url: "https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html",
    },
  },

  gdpr: {
    "data-subject-rights": {
      local: "gdpr/data-subject-rights.md",
      url: "https://gdpr-info.eu/chapter-3/",
    },
    consent: {
      local: "gdpr/consent.md",
      url: "https://gdpr-info.eu/art-7-gdpr/",
    },
    "pii-handling": {
      local: "gdpr/pii-handling.md",
      url: "https://cheatsheetseries.owasp.org/cheatsheets/User_Privacy_Protection_Cheat_Sheet.html",
    },
    dpia: {
      local: "gdpr/dpia.md",
      url: "https://gdpr-info.eu/art-35-gdpr/",
    },
    anonymization: {
      local: "gdpr/anonymization.md",
      url: "https://edps.europa.eu/data-protection/our-work/subjects/anonymisation_en",
    },
  },

  "cpp-security": {
    asan: {
      local: "cpp-security/asan.md",
      url: "https://clang.llvm.org/docs/AddressSanitizer.html",
    },
    ubsan: {
      local: "cpp-security/ubsan.md",
      url: "https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html",
    },
    tsan: {
      local: "cpp-security/tsan.md",
      url: "https://clang.llvm.org/docs/ThreadSanitizer.html",
    },
    msan: {
      local: "cpp-security/msan.md",
      url: "https://clang.llvm.org/docs/MemorySanitizer.html",
    },
    "msvc-hardening": {
      local: "cpp-security/msvc-hardening.md",
      url: "https://learn.microsoft.com/cpp/build/reference/sdl-enable-additional-security-checks",
    },
    "control-flow-guard": {
      local: "cpp-security/control-flow-guard.md",
      url: "https://learn.microsoft.com/windows/win32/secbp/control-flow-guard",
    },
    "gcc-hardening": {
      local: "cpp-security/gcc-hardening.md",
      url: "https://wiki.gentoo.org/wiki/Hardened/Toolchain",
    },
    "cert-cpp": {
      local: "cpp-security/cert-cpp.md",
      url: "https://wiki.sei.cmu.edu/confluence/display/cplusplus/SEI+CERT+C%2B%2B+Coding+Standard",
    },
    "core-guidelines-safety": {
      local: "cpp-security/core-guidelines-safety.md",
      url: "https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-safety",
    },
    libfuzzer: {
      local: "cpp-security/libfuzzer.md",
      url: "https://llvm.org/docs/LibFuzzer.html",
    },
  },
};
