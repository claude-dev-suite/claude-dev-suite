// SPDX-License-Identifier: MIT
/**
 * Authentication and authorization documentation
 * Includes: JWT, OAuth2, NextAuth
 */

import type { DocsRecord } from "./types.js";

export const AUTH_TECHNOLOGIES = [
  "jwt",
  "oauth2",
  "nextauth",
] as const;

export const authDocs: DocsRecord = {
  jwt: {
    implementation: {
      local: "jwt/implementation.md",
      url: "https://jwt.io/introduction",
    },
    security: {
      local: "jwt/security.md",
      url: "https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html",
    },
  },

  oauth2: {
    flows: {
      local: "oauth2/flows.md",
      url: "https://oauth.net/2/",
    },
    providers: {
      local: "oauth2/providers.md",
      url: "https://oauth.net/code/",
    },
  },

  nextauth: {
    setup: {
      local: "nextauth/setup.md",
      url: "https://next-auth.js.org/getting-started/introduction",
    },
    callbacks: {
      local: "nextauth/callbacks.md",
      url: "https://next-auth.js.org/configuration/callbacks",
    },
  },
};
