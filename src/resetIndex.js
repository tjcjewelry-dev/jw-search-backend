/**
 * Reset Index — deletes the existing Pinecone index and recreates it
 * with the correct dimension for text-embedding-3-small (1536D).
 *
 * Run this when you see:
 *   "Vector dimension 1536 does not match the dimension of the index 512"
 *
 * Usage:
 *   node src/resetIndex.js
 *
 * ⚠️  WARNING: This permanently deletes ALL stored jewelry vectors.
 *    You will need to re-add your images with: node examples/addJewelry.js
 */

import { validateConfig, config } from './config.js';
import { resetIndex, getIndexStats } from './pineconeClient.js';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Pinecone Index Reset');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  Index name : ${config.pinecone.indexName}`);
console.log(`  New dim    : ${config.pinecone.dimension}D  (text-embedding-3-small)`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('⚠️  All existing vectors will be deleted.\n');

try {
  validateConfig();
  await resetIndex();

  const stats = await getIndexStats();
  console.log('\n✓ Index reset complete.');
  console.log(`  Vectors: ${stats.totalRecordCount ?? 0}`);
  console.log('\nNext step → re-add your images:');
  console.log('  node examples/addJewelry.js');
} catch (err) {
  console.error('\n✗ Reset failed:', err.message);
  process.exit(1);
}
