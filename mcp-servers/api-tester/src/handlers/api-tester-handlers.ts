// SPDX-License-Identifier: MIT
/**
 * API Tester tool handlers
 */

import { importPostmanCollection, toBatchFormat as postmanToBatch } from "../importers/postman.js";
import { importInsomniaWorkspace, toBatchFormat as insomniaToBatch } from "../importers/insomnia.js";
import { generateTests, generateTestCode, toBatchFormat as testsToBatch } from "../generators/test-generator.js";
import { startMockServer, stopMockServer, listMockServers } from "../mock/server.js";
import fs from "fs/promises";
import {
  HttpRequestSchema,
  HealthCheckSchema,
  BatchRequestSchema,
  ImportCollectionSchema,
  GenerateTestsSchema,
  MockServerSchema,
  makeRequest,
  jsonResponse,
  type Handler,
  type HandlerResult,
} from "./types.js";

export const handleHttpRequest: Handler = async (args): Promise<HandlerResult> => {
  const { method, url, headers, body, timeout } = HttpRequestSchema.parse(args);

  const result = await makeRequest({ method, url, headers, body, timeout });

  return jsonResponse({
    request: { method, url },
    response: result,
  });
};

export const handleHealthCheck: Handler = async (args): Promise<HandlerResult> => {
  const { url, endpoints } = HealthCheckSchema.parse(args);

  const defaultEndpoints = ["/health", "/healthz", "/api/health", "/status", "/ping", "/"];
  const endpointsToCheck = endpoints || defaultEndpoints;

  const results = await Promise.all(
    endpointsToCheck.map(async (endpoint) => {
      const fullUrl = `${url.replace(/\/$/, "")}${endpoint}`;
      try {
        const result = await makeRequest({
          method: "GET",
          url: fullUrl,
          timeout: 5000,
        });
        return {
          endpoint,
          status: result.status,
          statusText: result.statusText,
          timing: result.timing,
          healthy: result.status >= 200 && result.status < 300,
        };
      } catch (error) {
        return {
          endpoint,
          status: 0,
          statusText: error instanceof Error ? error.message : "Request failed",
          timing: 0,
          healthy: false,
        };
      }
    })
  );

  const healthyEndpoints = results.filter((r) => r.healthy);

  return jsonResponse({
    baseUrl: url,
    results,
    summary: {
      total: results.length,
      healthy: healthyEndpoints.length,
      unhealthy: results.length - healthyEndpoints.length,
      avgResponseTime:
        healthyEndpoints.length > 0
          ? Math.round(
              healthyEndpoints.reduce((sum, r) => sum + r.timing, 0) /
                healthyEndpoints.length
            )
          : 0,
    },
  });
};

export const handleBatchRequest: Handler = async (args): Promise<HandlerResult> => {
  const { requests, sequential } = BatchRequestSchema.parse(args);

  const executeRequest = async (req: (typeof requests)[0]) => {
    try {
      const result = await makeRequest({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
      });
      return {
        name: req.name,
        success: result.status >= 200 && result.status < 300,
        status: result.status,
        timing: result.timing,
        body: result.body,
      };
    } catch (error) {
      return {
        name: req.name,
        success: false,
        status: 0,
        timing: 0,
        error: error instanceof Error ? error.message : "Request failed",
      };
    }
  };

  let results;
  if (sequential) {
    results = [];
    for (const req of requests) {
      results.push(await executeRequest(req));
    }
  } else {
    results = await Promise.all(requests.map(executeRequest));
  }

  return jsonResponse({
    mode: sequential ? "sequential" : "parallel",
    results,
    summary: {
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    },
  });
};

export const handleImportCollection: Handler = async (args): Promise<HandlerResult> => {
  const { filePath, format, variables } = ImportCollectionSchema.parse(args);

  // Auto-detect format if not specified
  let detectedFormat = format;
  if (!detectedFormat) {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    // Postman collections have an "info" object with a "schema" field
    if (parsed.info?.schema?.includes("postman")) {
      detectedFormat = "postman";
    } else if (parsed._type === "export" || parsed.__export_format) {
      detectedFormat = "insomnia";
    } else {
      throw new Error(
        "Could not auto-detect collection format. Please specify format: 'postman' or 'insomnia'."
      );
    }
  }

  if (detectedFormat === "postman") {
    const result = await importPostmanCollection(filePath, variables);
    const batchRequests = postmanToBatch(result.requests);
    return jsonResponse({
      format: "postman",
      collection: result.collectionName,
      description: result.description,
      totalRequests: result.totalRequests,
      folders: result.folders,
      variables: result.variables,
      batchRequests,
    });
  } else {
    const result = await importInsomniaWorkspace(filePath);
    if (variables) {
      Object.assign(result.variables, variables);
    }
    const batchRequests = insomniaToBatch(result.requests);
    return jsonResponse({
      format: "insomnia",
      workspace: result.workspaceName,
      description: result.description,
      totalRequests: result.totalRequests,
      folders: result.folders,
      variables: result.variables,
      batchRequests,
    });
  }
};

export const handleGenerateTests: Handler = async (args): Promise<HandlerResult> => {
  const { specPath, baseUrl, outputFormat, filterTags, includeNegativeTests } = GenerateTestsSchema.parse(args);

  const result = await generateTests(specPath, {
    baseUrl,
    filterTags,
    includeNegativeTests,
  });

  let output: object;
  if (outputFormat && outputFormat !== 'json') {
    output = {
      apiName: result.apiName,
      apiVersion: result.apiVersion,
      baseUrl: result.baseUrl,
      totalEndpoints: result.totalEndpoints,
      totalTests: result.totalTests,
      coverage: result.coverage,
      code: generateTestCode(result.tests, outputFormat),
    };
  } else {
    output = {
      ...result,
      batchRequests: testsToBatch(result.tests),
    };
  }

  return jsonResponse(output);
};

export const handleMockServer: Handler = async (args): Promise<HandlerResult> => {
  const { action, specPath, port, delay } = MockServerSchema.parse(args);

  switch (action) {
    case 'start': {
      if (!specPath) {
        throw new Error('specPath is required for start action');
      }
      const result = await startMockServer(specPath, { port, delay });
      return jsonResponse({
        action: 'started',
        ...result,
      });
    }

    case 'stop': {
      if (!port) {
        throw new Error('port is required for stop action');
      }
      const stopped = await stopMockServer(port);
      return jsonResponse({
        action: 'stopped',
        port,
        success: stopped,
      });
    }

    case 'list': {
      const servers = listMockServers();
      return jsonResponse({
        action: 'list',
        servers,
        count: servers.length,
      });
    }

    default:
      throw new Error(`Unknown mock_server action: ${action}`);
  }
};
