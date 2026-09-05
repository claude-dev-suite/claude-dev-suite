// SPDX-License-Identifier: MIT
/**
 * API and HTTP client documentation
 * Includes: GraphQL, tRPC, REST API, OpenAPI, Axios, ky, ofetch, code generation
 */

import type { DocsRecord } from "./types.js";

export const API_TECHNOLOGIES = [
  // API styles
  "graphql",
  "trpc",
  "rest-api",
  "openapi",
  // HTTP Clients
  "axios",
  "ky",
  "ofetch",
  // Data Fetching
  "swr",
  // Code Generation
  "openapi-generator",
  "graphql-codegen",
  "trpc-openapi",
] as const;

export const apiDocs: DocsRecord = {
  graphql: {
    basics: {
      local: "graphql/basics.md",
      url: "https://graphql.org/learn/",
    },
    schema: {
      local: "graphql/schema.md",
      url: "https://graphql.org/learn/schema/",
    },
    resolvers: {
      local: "graphql/resolvers.md",
      url: "https://graphql.org/learn/execution/",
    },
    // The KB file is "GraphQL Serving over HTTP" — kept keyed to its file
    // stem for consistency with the rest of the index.
    controllers: {
      local: "graphql/controllers.md",
      url: "https://graphql.org/learn/serving-over-http/",
    },
    "data-fetching": {
      local: "graphql/data-fetching.md",
      url: "https://graphql.org/learn/queries/",
    },
  },

  trpc: {
    routers: {
      local: "trpc/routers.md",
      url: "https://trpc.io/docs/server/routers",
    },
    client: {
      local: "trpc/client.md",
      url: "https://trpc.io/docs/client/react",
    },
  },

  "rest-api": {
    conventions: {
      url: "https://restfulapi.net/resource-naming/",
    },
    "error-handling": {
      url: "https://restfulapi.net/http-status-codes/",
    },
  },

  openapi: {
    specification: {
      url: "https://spec.openapis.org/oas/latest.html",
    },
    tools: {
      url: "https://openapi.tools/",
    },
  },

  // HTTP Clients
  axios: {
    basics: {
      local: "axios/basics.md",
      url: "https://axios-http.com/docs/intro",
    },
    interceptors: {
      local: "axios/interceptors.md",
      url: "https://axios-http.com/docs/interceptors",
    },
  },

  ky: {
    basics: {
      local: "ky/basics.md",
      url: "https://github.com/sindresorhus/ky",
    },
  },

  ofetch: {
    basics: {
      local: "ofetch/basics.md",
      url: "https://github.com/unjs/ofetch",
    },
  },

  // Data Fetching
  swr: {
    basics: {
      local: "swr/basics.md",
      url: "https://swr.vercel.app/docs/getting-started",
    },
    mutations: {
      local: "swr/mutations.md",
      url: "https://swr.vercel.app/docs/mutation",
    },
  },

  // Code Generation
  "openapi-generator": {
    basics: {
      local: "openapi-generator/basics.md",
      url: "https://openapi-generator.tech/docs/generators",
    },
    typescript: {
      local: "openapi-generator/typescript.md",
      url: "https://openapi-generator.tech/docs/generators/typescript-fetch",
    },
  },

  "graphql-codegen": {
    basics: {
      local: "graphql-codegen/basics.md",
      url: "https://the-guild.dev/graphql/codegen/docs/getting-started",
    },
    "react-query": {
      local: "graphql-codegen/react-query.md",
      url: "https://the-guild.dev/graphql/codegen/plugins/typescript/typescript-react-query",
    },
  },

  "trpc-openapi": {
    basics: {
      local: "trpc-openapi/basics.md",
      url: "https://github.com/jlalmes/trpc-openapi",
    },
  },
};
