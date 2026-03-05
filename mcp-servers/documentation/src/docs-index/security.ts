// SPDX-License-Identifier: MIT
/**
 * Security documentation
 * Includes: Cryptography, GDPR compliance
 */

import type { DocsRecord } from "./types.js";

export const SECURITY_TECHNOLOGIES = [
  "cryptography",
  "gdpr",
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
      url: "https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html",
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
};
