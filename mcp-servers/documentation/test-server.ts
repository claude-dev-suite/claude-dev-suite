/**
 * Simple test script for the documentation server
 * Run with: npx tsx test-server.ts
 */

import { docsIndex, SUPPORTED_TECHNOLOGIES } from "./src/docs-index.js";
import { loadLocalDocs, searchLocalDocs } from "./src/sources/local-loader.js";

async function runTests() {
  console.log("=".repeat(60));
  console.log("Documentation Server Tests");
  console.log("=".repeat(60));

  let passed = 0;
  let failed = 0;

  // Test 1: Check SUPPORTED_TECHNOLOGIES count
  console.log("\n[TEST 1] SUPPORTED_TECHNOLOGIES count");
  const techCount = SUPPORTED_TECHNOLOGIES.length;
  if (techCount >= 60) {
    console.log(`  ✓ PASSED: ${techCount} technologies supported`);
    passed++;
  } else {
    console.log(`  ✗ FAILED: Only ${techCount} technologies (expected >= 60)`);
    failed++;
  }

  // Test 2: Check docsIndex entries
  console.log("\n[TEST 2] docsIndex entries");
  const indexedTechs = Object.keys(docsIndex);
  if (indexedTechs.length >= 30) {
    console.log(`  ✓ PASSED: ${indexedTechs.length} technologies have doc entries`);
    passed++;
  } else {
    console.log(`  ✗ FAILED: Only ${indexedTechs.length} technologies indexed (expected >= 30)`);
    failed++;
  }

  // Test 3: Load local docs - existing file
  console.log("\n[TEST 3] Load local docs - react/hooks.md");
  try {
    const content = await loadLocalDocs("react/hooks.md");
    if (content && content.length > 100) {
      console.log(`  ✓ PASSED: Loaded ${content.length} chars`);
      passed++;
    } else {
      console.log(`  ✗ FAILED: Content too short or empty`);
      failed++;
    }
  } catch (e) {
    console.log(`  ✗ FAILED: ${e}`);
    failed++;
  }

  // Test 4: Load local docs - another file
  console.log("\n[TEST 4] Load local docs - prisma/schema.md");
  try {
    const content = await loadLocalDocs("prisma/schema.md");
    if (content && content.length > 100) {
      console.log(`  ✓ PASSED: Loaded ${content.length} chars`);
      passed++;
    } else {
      console.log(`  ✗ FAILED: Content too short or empty`);
      failed++;
    }
  } catch (e) {
    console.log(`  ✗ FAILED: ${e}`);
    failed++;
  }

  // Test 5: Check new technologies in docsIndex
  console.log("\n[TEST 5] New technologies in docsIndex");
  const newTechs = ["mongodb", "mysql", "redis", "jest", "cypress", "kubernetes", "jwt", "graphql"];
  const missingTechs = newTechs.filter((t) => !docsIndex[t]);
  if (missingTechs.length === 0) {
    console.log(`  ✓ PASSED: All new technologies indexed: ${newTechs.join(", ")}`);
    passed++;
  } else {
    console.log(`  ✗ FAILED: Missing technologies: ${missingTechs.join(", ")}`);
    failed++;
  }

  // Test 6: Check topics for new technologies
  console.log("\n[TEST 6] Topics for new technologies");
  const topicChecks = [
    { tech: "mongodb", topics: ["queries", "indexes"] },
    { tech: "jwt", topics: ["implementation", "security"] },
    { tech: "kubernetes", topics: ["resources", "kubectl"] },
  ];
  let topicsPassed = true;
  for (const { tech, topics } of topicChecks) {
    const availableTopics = Object.keys(docsIndex[tech] || {});
    const missing = topics.filter((t) => !availableTopics.includes(t));
    if (missing.length > 0) {
      console.log(`  ✗ ${tech} missing topics: ${missing.join(", ")}`);
      topicsPassed = false;
    }
  }
  if (topicsPassed) {
    console.log(`  ✓ PASSED: All expected topics present`);
    passed++;
  } else {
    failed++;
  }

  // Test 7: Search functionality
  console.log("\n[TEST 7] Search docs - 'hooks'");
  try {
    const results = await searchLocalDocs("hooks", undefined, 3);
    if (results.length > 0) {
      console.log(`  ✓ PASSED: Found ${results.length} results`);
      results.forEach((r) => console.log(`    - ${r.technology}/${r.topic} (score: ${r.score.toFixed(3)})`));
      passed++;
    } else {
      console.log(`  ✗ FAILED: No results found`);
      failed++;
    }
  } catch (e) {
    console.log(`  ✗ FAILED: ${e}`);
    failed++;
  }

  // Test 8: List topics for a technology
  console.log("\n[TEST 8] List topics for 'nextjs'");
  const nextjsTopics = Object.keys(docsIndex["nextjs"] || {});
  if (nextjsTopics.length >= 5) {
    console.log(`  ✓ PASSED: ${nextjsTopics.length} topics: ${nextjsTopics.join(", ")}`);
    passed++;
  } else {
    console.log(`  ✗ FAILED: Only ${nextjsTopics.length} topics`);
    failed++;
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Test runner error:", e);
  process.exit(1);
});
