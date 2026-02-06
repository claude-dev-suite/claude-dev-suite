/**
 * Test script for API Tester new tools
 */
import { importPostmanCollection, toBatchFormat as postmanToBatch } from '../dist/importers/postman.js';
import { importInsomniaWorkspace, toBatchFormat as insomniaToBatch } from '../dist/importers/insomnia.js';
import { generateTests, generateTestCode, toBatchFormat as testsToBatch } from '../dist/generators/test-generator.js';
import { startMockServer, stopMockServer, listMockServers } from '../dist/mock/server.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => {
        console.log(`  ✓ ${name}`);
        passed++;
      }).catch(err => {
        console.log(`  ✗ ${name}: ${err.message}`);
        failed++;
      });
    }
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n=== Testing import_postman ===\n');

  const postmanPath = join(__dirname, 'sample-postman.json');
  const postmanResult = await importPostmanCollection(postmanPath);

  await test('Postman: Collection name parsed', () => {
    if (postmanResult.collectionName !== 'Pet Store API') throw new Error(`Expected 'Pet Store API', got '${postmanResult.collectionName}'`);
  });

  await test('Postman: Extracts correct number of requests', () => {
    if (postmanResult.totalRequests !== 4) throw new Error(`Expected 4 requests, got ${postmanResult.totalRequests}`);
  });

  await test('Postman: Variables parsed correctly', () => {
    if (postmanResult.variables.baseUrl !== 'https://petstore.example.com/api/v1') {
      throw new Error(`baseUrl not parsed correctly: ${postmanResult.variables.baseUrl}`);
    }
  });

  await test('Postman: URLs have variables replaced', () => {
    const listPets = postmanResult.requests.find(r => r.name === 'List Pets');
    if (!listPets.url.includes('petstore.example.com')) {
      throw new Error(`URL variables not replaced: ${listPets.url}`);
    }
  });

  await test('Postman: Folder structure preserved', () => {
    const createPet = postmanResult.requests.find(r => r.name === 'Create Pet');
    if (createPet.folder !== 'Pets') throw new Error(`Expected folder 'Pets', got '${createPet.folder}'`);
  });

  await test('Postman: toBatchFormat works', () => {
    const batch = postmanToBatch(postmanResult.requests);
    if (batch.length !== 4) throw new Error(`Expected 4 batch requests, got ${batch.length}`);
  });

  await test('Postman: Variable overrides work', async () => {
    const overrideResult = await importPostmanCollection(postmanPath, { baseUrl: 'https://override.com' });
    const listPets = overrideResult.requests.find(r => r.name === 'List Pets');
    if (!listPets.url.includes('override.com')) {
      throw new Error(`Variable override not applied: ${listPets.url}`);
    }
  });

  console.log('\n=== Testing import_insomnia ===\n');

  const insomniaPath = join(__dirname, 'sample-insomnia.json');
  const insomniaResult = await importInsomniaWorkspace(insomniaPath);

  await test('Insomnia: Workspace name parsed', () => {
    if (insomniaResult.workspaceName !== 'User API Workspace') {
      throw new Error(`Expected 'User API Workspace', got '${insomniaResult.workspaceName}'`);
    }
  });

  await test('Insomnia: Extracts correct number of requests', () => {
    if (insomniaResult.totalRequests !== 3) throw new Error(`Expected 3 requests, got ${insomniaResult.totalRequests}`);
  });

  await test('Insomnia: Environment variables parsed', () => {
    if (insomniaResult.variables.baseUrl !== 'https://api.example.com') {
      throw new Error(`baseUrl not parsed: ${insomniaResult.variables.baseUrl}`);
    }
  });

  await test('Insomnia: URLs have variables replaced', () => {
    const listUsers = insomniaResult.requests.find(r => r.name === 'List Users');
    if (!listUsers.url.includes('api.example.com')) {
      throw new Error(`URL variables not replaced: ${listUsers.url}`);
    }
  });

  await test('Insomnia: Folder path built correctly', () => {
    const createUser = insomniaResult.requests.find(r => r.name === 'Create User');
    if (createUser.folder !== 'Users') throw new Error(`Expected folder 'Users', got '${createUser.folder}'`);
  });

  await test('Insomnia: toBatchFormat works', () => {
    const batch = insomniaToBatch(insomniaResult.requests);
    if (batch.length !== 3) throw new Error(`Expected 3 batch requests, got ${batch.length}`);
  });

  console.log('\n=== Testing generate_tests ===\n');

  const openapiPath = join(__dirname, 'sample-openapi.yaml');
  const testsResult = await generateTests(openapiPath);

  await test('OpenAPI: API name parsed', () => {
    if (testsResult.apiName !== 'Todo API') throw new Error(`Expected 'Todo API', got '${testsResult.apiName}'`);
  });

  await test('OpenAPI: Version parsed', () => {
    if (testsResult.apiVersion !== '1.0.0') throw new Error(`Expected '1.0.0', got '${testsResult.apiVersion}'`);
  });

  await test('OpenAPI: Base URL from servers', () => {
    if (testsResult.baseUrl !== 'https://api.todos.example.com/v1') {
      throw new Error(`Expected base URL from servers, got '${testsResult.baseUrl}'`);
    }
  });

  await test('OpenAPI: Correct number of endpoints', () => {
    // 7 operations: GET /todos, POST /todos, GET /todos/{id}, PUT /todos/{id}, DELETE /todos/{id}, GET /health
    if (testsResult.totalEndpoints !== 6) throw new Error(`Expected 6 endpoints, got ${testsResult.totalEndpoints}`);
  });

  await test('OpenAPI: Tests generated with negative cases', () => {
    // Main tests + negative tests for required params
    if (testsResult.totalTests < testsResult.totalEndpoints) {
      throw new Error(`Expected at least ${testsResult.totalEndpoints} tests, got ${testsResult.totalTests}`);
    }
  });

  await test('OpenAPI: Path parameters replaced', () => {
    const getTodo = testsResult.tests.find(t => t.name === 'getTodo' || t.path === '/todos/{id}' && t.method === 'GET');
    if (getTodo && getTodo.url.includes('{id}')) {
      throw new Error(`Path parameter not replaced in URL: ${getTodo.url}`);
    }
  });

  await test('OpenAPI: Filter by tags works', async () => {
    const filteredResult = await generateTests(openapiPath, { filterTags: ['system'] });
    if (filteredResult.totalEndpoints !== 1) {
      throw new Error(`Expected 1 endpoint with tag 'system', got ${filteredResult.totalEndpoints}`);
    }
  });

  await test('OpenAPI: Generate curl code', () => {
    const curlCode = generateTestCode(testsResult.tests.slice(0, 2), 'curl');
    if (!curlCode.includes('curl -X')) throw new Error('curl code not generated correctly');
  });

  await test('OpenAPI: Generate vitest code', () => {
    const vitestCode = generateTestCode(testsResult.tests.slice(0, 2), 'vitest');
    if (!vitestCode.includes("import { describe, it, expect } from 'vitest'")) {
      throw new Error('vitest code not generated correctly');
    }
  });

  await test('OpenAPI: toBatchFormat works', () => {
    const batch = testsToBatch(testsResult.tests);
    if (batch.length !== testsResult.tests.length) {
      throw new Error(`Batch length mismatch: ${batch.length} vs ${testsResult.tests.length}`);
    }
  });

  console.log('\n=== Testing mock_server ===\n');

  await test('Mock: Start server from OpenAPI', async () => {
    const result = await startMockServer(openapiPath, { port: 9999 });
    if (result.port !== 9999) throw new Error(`Expected port 9999, got ${result.port}`);
    if (result.routes < 1) throw new Error(`Expected routes > 0, got ${result.routes}`);
  });

  await test('Mock: List servers shows running server', () => {
    const servers = listMockServers();
    if (servers.length !== 1) throw new Error(`Expected 1 server, got ${servers.length}`);
    if (servers[0].port !== 9999) throw new Error(`Expected port 9999 in list`);
  });

  await test('Mock: Server responds to requests', async () => {
    const response = await fetch('http://localhost:9999/todos');
    if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error(`Expected array response`);
  });

  await test('Mock: Server handles path params', async () => {
    const response = await fetch('http://localhost:9999/todos/123');
    if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
  });

  await test('Mock: Server returns 404 for unknown routes', async () => {
    const response = await fetch('http://localhost:9999/unknown');
    if (response.status !== 404) throw new Error(`Expected 404, got ${response.status}`);
  });

  await test('Mock: Custom status via query param', async () => {
    const response = await fetch('http://localhost:9999/todos?_status=400');
    if (response.status !== 400) throw new Error(`Expected 400, got ${response.status}`);
  });

  await test('Mock: Stop server', async () => {
    const stopped = await stopMockServer(9999);
    if (!stopped) throw new Error('Server should have been stopped');
    const servers = listMockServers();
    if (servers.length !== 0) throw new Error('Server list should be empty');
  });

  console.log('\n' + '='.repeat(50));
  console.log(`\n  Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
