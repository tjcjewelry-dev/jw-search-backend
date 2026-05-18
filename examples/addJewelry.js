/**
 * Example: Adding Jewelry Images
 * 
 * Shows all three ways to add jewelry:
 *   1. Full manual tags (you provide everything)
 *   2. Partial manual tags + Claude fills the rest
 *   3. Fully auto-tagged by Claude Vision (just drop the image)
 * 
 * Usage: node examples/addJewelry.js
 */

import { addJewelryImage, addBatch } from '../src/jewelryStore.js';
import { getIndexStats } from '../src/pineconeClient.js';

// ─── Example 1: Full manual tags ──────────────────────────────────────────────
// Use this when you know exactly what the piece is.
// Claude Vision is still called to get the description, but your tags win.

async function example_fullManualTags() {
  console.log('\n══ Example 1: Full Manual Tags ══\n');

  await addJewelryImage({
    imagePath: './images/ring_001.jpg',
    imageUrl: 'https://your-cdn.com/images/ring_001.jpg',
    sku: 'RING-001',
    tags: {
      category: 'Ring',
      subCategory: 'Solitaire',
      centerStone: 'Marquise',
      sideStones: ['Round', 'Round'],
      metalType: 'Yellow Gold',
      metalKarat: '18K',
      prong: '4 Prong',
      shank: 'Split Shank',
      settingStyle: 'Three Stone',
      hasRhodium: false,
      occasion: 'Engagement',
    },
  });
}

// ─── Example 2: Partial tags (hybrid) ─────────────────────────────────────────
// You specify the fields you care about.
// Claude fills in what you didn't specify.

async function example_partialTags() {
  console.log('\n══ Example 2: Partial Tags + Auto-fill ══\n');

  await addJewelryImage({
    imagePath: './images/earring_001.jpg',
    imageUrl: 'https://your-cdn.com/images/earring_001.jpg',
    sku: 'EARR-001',
    tags: {
      // You only know these two things — Claude figures out the rest
      category: 'Earring',
      metalType: 'Rose Gold',
    },
  });
}

// ─── Example 3: Fully auto-tagged ────────────────────────────────────────────
// Just give the image. Claude does everything.

async function example_fullyAuto() {
  console.log('\n══ Example 3: Fully Auto-tagged ══\n');

  await addJewelryImage({ 
    imagePath: './images/flexi-bangle.jpg',
    imageUrl: 'http://localhost:7792/images/flexi-bangle.jpg',
    sku: 'BG1642-100',
    // No tags provided — Claude reads the image
  });
}

// ─── Example 4: Batch import ──────────────────────────────────────────────────
// Add many images at once. Mix of manual/auto.

async function example_batch() {
  console.log('\n══ Example 4: Batch Import ══\n');

  const items = [
    {
      imagePath: './images/ring_002.jpg',
      imageUrl: 'https://your-cdn.com/images/ring_002.jpg',
      sku: 'RING-002',
      tags: { centerStone: 'Princess', metalType: 'White Gold', hasRhodium: true },
    },
    {
      imagePath: './images/ring_003.jpg',
      imageUrl: 'https://your-cdn.com/images/ring_003.jpg',
      sku: 'RING-003',
      // Fully auto
    },
    {
      imagePath: './images/bracelet_001.jpg',
      imageUrl: 'https://your-cdn.com/images/bracelet_001.jpg',
      sku: 'BRAC-001',
      tags: { category: 'Bracelet', gemstone: 'Ruby' },
    },
  ];

  const results = await addBatch(items);

  console.log('\nBatch Summary:');
  results.forEach((r) => {
    const status = r.success ? '✓' : '✗';
    console.log(`  ${status} ${r.imagePath || r.id}`);
  });
}

// ─── Run ───────────────────────────────────────────────────────────────────────

// Modify this to run whichever example you need:
// await example_fullManualTags();
// await example_partialTags();
await example_fullyAuto();
// await example_batch();

// Show total count after adding
const stats = await getIndexStats();
console.log(`\n📦 Total jewelry in database: ${stats.totalRecordCount}`);
