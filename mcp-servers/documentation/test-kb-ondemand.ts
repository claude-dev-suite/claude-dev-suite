#!/usr/bin/env tsx
/**
 * Test script for on-demand KB fetcher
 * Usage: KB_REPO_URL=https://github.com/your-org/kb.git tsx test-kb-ondemand.ts
 */

import { KBCache } from './src/kb-cache.js';
import { KBFetcher } from './src/kb-fetcher.js';
import path from 'path';
import fs from 'fs/promises';

const KB_REPO_URL = process.env.KB_REPO_URL || '';
const KB_CACHE_PATH = './test-cache';
const KB_CACHE_TTL = 10; // 10s for testing

async function main() {
  console.log('=== On-Demand KB Fetcher Test ===\n');

  if (!KB_REPO_URL) {
    console.error('❌ KB_REPO_URL not set. Usage:');
    console.error('   KB_REPO_URL=https://github.com/org/kb.git tsx test-kb-ondemand.ts');
    process.exit(1);
  }

  console.log(`📦 KB Repository: ${KB_REPO_URL}`);
  console.log(`📁 Cache Path: ${KB_CACHE_PATH}`);
  console.log(`⏱️  Cache TTL: ${KB_CACHE_TTL}s\n`);

  // Clean up old cache
  try {
    await fs.rm(KB_CACHE_PATH, { recursive: true, force: true });
  } catch {}

  // Initialize cache and fetcher
  const cache = new KBCache({
    cachePath: KB_CACHE_PATH,
    ttl: KB_CACHE_TTL,
  });

  await cache.init();

  const fetcher = new KBFetcher({
    repoUrl: KB_REPO_URL,
    cache,
  });

  // Test 1: Check availability
  console.log('Test 1: Check Git availability');
  const availability = await fetcher.checkAvailability();
  console.log(`✓ Git available: ${availability.available}`);
  if (!availability.available) {
    console.error(`✗ Error: ${availability.error}`);
    process.exit(1);
  }
  console.log('');

  // Test 2: Fetch a technology (cache miss)
  console.log('Test 2: Fetch technology (cache miss)');
  const tech1 = 'react';
  console.time(`Fetch ${tech1}`);
  const files1 = await fetcher.fetch(tech1);
  console.timeEnd(`Fetch ${tech1}`);
  console.log(`✓ Files fetched: ${files1.length}`);
  console.log(`  ${files1.slice(0, 3).join(', ')}...`);
  console.log('');

  // Test 3: Fetch same technology (cache hit)
  console.log('Test 3: Fetch same technology (cache hit)');
  console.time(`Fetch ${tech1} again`);
  const files2 = await fetcher.fetch(tech1);
  console.timeEnd(`Fetch ${tech1} again`);
  console.log(`✓ Files fetched: ${files2.length} (from cache)`);
  console.log('');

  // Test 4: Get file content
  console.log('Test 4: Get file content');
  if (files1.length > 0) {
    const file = files1[0];
    const content = await fetcher.getFile(tech1, file);
    console.log(`✓ File: ${file}`);
    console.log(`✓ Content length: ${content.length} chars`);
    console.log(`✓ Preview: ${content.slice(0, 100)}...`);
  }
  console.log('');

  // Test 5: Cache freshness
  console.log('Test 5: Cache freshness check');
  const isFresh = await cache.isFresh(tech1);
  console.log(`✓ Cache is fresh: ${isFresh}`);
  console.log('');

  // Test 6: Cache stats
  console.log('Test 6: Cache statistics');
  const stats = await cache.getStats();
  console.log(`✓ Cached technologies: ${stats.technologies}`);
  console.log(`✓ Total files: ${stats.totalFiles}`);
  console.log(`✓ Oldest cache: ${stats.oldestCache ? new Date(stats.oldestCache).toISOString() : 'N/A'}`);
  console.log(`✓ Newest cache: ${stats.newestCache ? new Date(stats.newestCache).toISOString() : 'N/A'}`);
  console.log('');

  // Test 7: Force refresh
  console.log('Test 7: Force refresh');
  console.time('Force refresh');
  const files3 = await fetcher.fetch(tech1, true);
  console.timeEnd('Force refresh');
  console.log(`✓ Files refetched: ${files3.length}`);
  console.log('');

  // Test 8: Cache invalidation
  console.log('Test 8: Cache invalidation');
  await cache.invalidate(tech1);
  const isFreshAfterInvalidate = await cache.isFresh(tech1);
  console.log(`✓ Cache invalidated, fresh: ${isFreshAfterInvalidate}`);
  console.log('');

  // Test 9: Fetch another technology
  console.log('Test 9: Fetch another technology');
  const tech2 = 'spring-boot';
  console.time(`Fetch ${tech2}`);
  try {
    const files4 = await fetcher.fetch(tech2);
    console.timeEnd(`Fetch ${tech2}`);
    console.log(`✓ Files fetched: ${files4.length}`);
    console.log(`  ${files4.slice(0, 3).join(', ')}...`);
  } catch (error) {
    console.error(`✗ Failed to fetch ${tech2}:`, error);
  }
  console.log('');

  // Test 10: Find files by pattern
  console.log('Test 10: Find files by pattern');
  const pattern = 'security|auth';
  const matches = await fetcher.findFiles(tech2, pattern);
  console.log(`✓ Files matching "${pattern}": ${matches.length}`);
  console.log(`  ${matches.join(', ')}`);
  console.log('');

  // Final stats
  console.log('=== Final Cache Stats ===');
  const finalStats = await cache.getStats();
  console.log(`Technologies: ${finalStats.technologies}`);
  console.log(`Total files: ${finalStats.totalFiles}`);

  // Cleanup
  console.log('\nCleaning up test cache...');
  await cache.clear();
  console.log('✓ Test complete!');
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
