/**
 * Setup Script — run this once to initialize the Pinecone index.
 * Usage: node src/setup.js
 */

import { validateConfig } from './config.js';
import { getPineconeIndex, getIndexStats } from './pineconeClient.js';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Jewelry Vector Search — Setup');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

try {
  validateConfig();
  console.log('✓ Config valid\n');

  await getPineconeIndex();
  const stats = await getIndexStats();
  console.log('\n✓ Pinecone index ready');
  console.log(`  Total vectors: ${stats.totalRecordCount || 0}`);
  console.log('\nSetup complete! You can now run:');
  console.log('  node examples/addJewelry.js   — to add images');
  console.log('  node examples/search.js        — to search');
} catch (err) {
  console.error('✗ Setup failed:', err.message);
  process.exit(1);
}
