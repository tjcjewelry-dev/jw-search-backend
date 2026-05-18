/**
 * Example: Searching the Jewelry Catalog
 * 
 * Demonstrates all search modes:
 *   1. Natural language text search
 *   2. Search by image (visual similarity)
 *   3. Find similar items
 *   4. Filtered browse
 * 
 * Usage: node examples/search.js
 */

import { searchByText, searchByImage, findSimilar, browseByFilter, printResults } from '../src/jewelrySearch.js';

// ─── Example 1: Natural Language Search ───────────────────────────────────────

async function example_textSearch() {
  console.log('\n══ Natural Language Search ══\n');

  // These work even if your data was tagged differently
  const queries = [
    'marquise center stone with princess side stones',
    'rose gold halo engagement ring',
    'yellow gold ruby pendant',
    'stud earrings with round diamonds',
    'vintage style three stone ring 18K',
    '4 prong solitaire white gold',
  ];

  for (const query of queries) {
    const results = await searchByText(query, { topK: 3 });
    printResults(results);
  }
}

// ─── Example 2: Search by Image ───────────────────────────────────────────────

async function example_imageSearch() {
  console.log('\n══ Search by Image ══\n');

  // Claude reads the query image and finds similar pieces
  const results = await searchByImage('./images/query_ring.jpg', { topK: 5 });
  printResults(results);
}

// ─── Example 3: Find Similar Items ────────────────────────────────────────────

async function example_findSimilar() {
  console.log('\n══ Find Similar Items ══\n');

  // Replace with an actual ID from your database
  const referenceId = 'RING-001';
  const results = await findSimilar(referenceId, 5);
  printResults(results);
}

// ─── Example 4: Filtered Browse ───────────────────────────────────────────────

async function example_filteredBrowse() {
  console.log('\n══ Filtered Browse ══\n');

  // All rose gold earrings
  const rosGoldEarrings = await browseByFilter({
    category: 'Earring',
    metalType: 'Rose Gold',
  });
  printResults(rosGoldEarrings);

  // All rings with gemstones (ruby or sapphire)
  const gemstonerings = await searchByText('ring with gemstone', {
    topK: 5,
    filter: { category: 'Ring' },
  });
  printResults(gemstonerings);

  // All rhodium-plated items
  const rhodiumItems = await browseByFilter({ hasRhodium: true });
  printResults(rhodiumItems);
}

// ─── Example 5: Combined text + filter ────────────────────────────────────────

async function example_combined() {
  console.log('\n══ Text Search + Filter ══\n');

  // "Find rings that have a marquise stone" — text handles semantics, filter handles category
  const results = await searchByText('marquise cut elegant design', {
    topK: 5,
    filter: { category: 'Ring' },
    minScore: 0.3, // Only return results with decent similarity
  });
  printResults(results);
}

// ─── Run ───────────────────────────────────────────────────────────────────────

// Uncomment whichever example you want to run:

await example_textSearch();
// await example_imageSearch();
// await example_findSimilar();
// await example_filteredBrowse();
// await example_combined();
