/**
 * Jewelry Search
 *
 * Accuracy strategy:
 *   1. Query expansion    — short terms like "round" or "pear" are expanded into
 *                           full jewelry phrases before embedding, so the vector
 *                           is rich enough to score well against stored items.
 *
 *   2. Metadata filters   — stone shapes, metal color, category, gemstone are
 *                           extracted from the query and applied as HARD Pinecone
 *                           filters BEFORE vector scoring. This means:
 *                             "pear"      → stoneShapes $in ["PEAR"] (exact match)
 *                             "rose gold" → metalColor $eq "Rose Gold" (exact match)
 *                             "earring"   → category $eq "Earring" (exact match)
 *                           None of these can ever return wrong-metal or wrong-shape results.
 *
 *   3. $in for arrays     — stoneShapes is stored as an array ["ROUND", "PEAR"].
 *                           Pinecone requires $in (not $eq) to query array fields.
 *                           $eq silently fails on arrays, which was the core bug.
 *
 *   4. Adaptive threshold — short queries (1-2 words) get a lower threshold (0.30)
 *                           because their embeddings are less specific. Long descriptive
 *                           queries keep the stricter threshold (0.45).
 *
 *   5. Category lock      — findSimilar and image search are constrained to the
 *                           same jewelry category as the source item.
 */

import { getPineconeIndex } from './pineconeClient.js';
import { embedText }        from './embedder.js';
import { autoTagImage, buildSearchableText } from './visionTagger.js';

// ─── Score thresholds ─────────────────────────────────────────────────────────
const SCORE = {
  TEXT_SHORT:  0.30,  // 1–2 word queries ("round", "pear diamond")
  TEXT_LONG:   0.45,  // 3+ word descriptive queries
  IMAGE:       0.60,  // image search — visual similarity must be clear
  SIMILAR:     0.65,  // find similar — must genuinely match source
};

export const POOL_SIZE = 10000;

// ─── Stone shape vocabulary ───────────────────────────────────────────────────
// Maps every user-facing term → the uppercase value stored in Pinecone stoneShapes[]
// Ordered longest-first so "elongated pear" matches before "pear"
const STONE_SHAPE_MAP = [
  ['elongated marquise',   'ELONGATED MARQUISE'],
  ['elongated pear',       'ELONGATED PEAR'],
  ['elongated oval',       'ELONGATED OVAL'],
  ['elongated emerald',    'ELONGATED EMERALD'],
  ['elongated radiant',    'ELONGATED RADIANT'],
  ['elongated cushion',    'ELONGTED CUSHION'],
  ['elongated baguette',   'ELONGTED BAGUETTE'],
  ['step baguette',        'ELONGTED STEP BAGUETTE'],
  ['half moon',            'HALF MOON'],
  ['old mine',             'CUSHION-OLD-Mined CUT'],
  ['old mined',            'CUSHION-OLD-Mined CUT'],
  ['rose cut round',       'ROSECUT ROUND'],
  ['round rose cut',       'ROUND RoseCut'],
  ['pear rose cut',        'PEAR ROSE CUT'],
  ['oval rose cut',        'OVAL ROSE CUT'],
  ['rose cut',             'PEAR ROSE CUT'],    // generic rose cut → pear rose cut fallback
  ['round cabochon',       'ROUND CABOCHON'],
  ['square emerald',       'SQUARE EMERALD'],
  ['square radiant',       'SQUARE RADIANT'],
  ['fancy cut',            'FANCY CUT DIAMOND'],
  ['trap baguette',        'TRAP BAGUETTE'],
  ['taper baguette',       'TAPPER BAGUETTE'],
  ['tapered baguette',     'TAPPER BAGUETTE'],
  ['straight baguette',    'STRAIGHT BAGUETTE'],
  ['long cushion',         'LONG CUSHION'],
  ['long hexagon',         'LONG HEXAGONE'],
  ['step trapezoid',       'STEP CUT TRAPEZOIDS'],
  ['trillion',             'Trillion'],
  ['trapezoid',            'TRAPEZOIDS'],
  ['asscher',              'ASCHER'],
  ['baguette',             'BAGUETTE'],
  ['bullet',               'BULLET'],
  ['cushion',              'CUSHION'],
  ['emerald cut',          'EMERALD'],
  ['emerald',              'EMERALD'],
  ['heart',                'HEART'],
  ['hexagon',              'HEXAGON'],
  ['kite',                 'KITE'],
  ['leaf',                 'LEAF'],
  ['marquise',             'MARQUISE'],
  ['moon',                 'MOON-STONE'],
  ['octagon',              'OCTAGONAL'],
  ['oval',                 'OVAL'],
  ['pear',                 'PEAR'],
  ['princess',             'PRINCESS'],
  ['radiant',              'RADIANT'],
  ['round',                'ROUND'],
  ['rough',                'ROUGH'],
  ['shield',               'Shield'],
  ['square',               'SQUARE EMERALD'],  // "square" alone → square emerald
  ['triangle',             'Triangle'],
  ['mixed',                'MIX'],
  ['mix',                  'MIX'],
];

// ─── Query Expander ───────────────────────────────────────────────────────────
/**
 * Expand a short query into a richer phrase for better embedding quality.
 *
 * "round"        → "round cut diamond stone jewelry"
 * "pear"         → "pear shaped diamond stone jewelry"
 * "pear diamond" → "pear shaped diamond stone jewelry"
 * "rose gold"    → "rose gold jewelry metal" (already meaningful, lighter expansion)
 * "marquise ring yellow gold" → unchanged (already descriptive enough)
 *
 * @param {string} query
 * @returns {string} expanded query
 */
function expandQuery(query) {
  const q    = query.toLowerCase().trim();
  const words = q.split(/\s+/);

  // Only expand short queries — long ones are already descriptive
  if (words.length >= 4) return query;

  // Stone shape only → expand aggressively
  const shapeOnly = STONE_SHAPE_MAP.some(([term]) => q === term);
  if (shapeOnly) {
    return `${query} cut shaped diamond stone jewelry`;
  }

  // Stone shape + one other word (e.g. "pear diamond", "round ring")
  const hasShape = STONE_SHAPE_MAP.some(([term]) => q.includes(term));
  if (hasShape && words.length <= 2) {
    return `${query} cut shaped diamond stone jewelry`;
  }

  // Metal only
  const metalTerms = ['rose gold','pink gold','yellow gold','white gold','platinum','silver','two tone'];
  if (metalTerms.some((t) => q === t)) {
    return `${query} jewelry metal color`;
  }

  return query;
}

// ─── Filter Extractor ─────────────────────────────────────────────────────────
/**
 * Parse a free-text query and return hard Pinecone metadata filters.
 *
 * IMPORTANT — array vs scalar fields:
 *   Scalar fields (metalColor, category, gemstone):   use $eq
 *   Array fields  (stoneShapes, component, stoneType): use $in
 *
 * @param {string} query
 * @returns {object} raw filter map, e.g. { stoneShapes: ['ROUND'], metalColor: 'Rose Gold' }
 */
export function extractFiltersFromQuery(query) {
  const q     = query.toLowerCase().trim();
  const words = q.split(/[\s,.\-/]+/);
  const filters = {};

  // ── Stone shape (array field → will use $in) ───────────────────────────────
  // Try longest match first to handle "elongated pear" before "pear"
  for (const [term, storedValue] of STONE_SHAPE_MAP) {
    if (q.includes(term)) {
      filters.stoneShapes = [storedValue]; // stored as array; $in handles it
      break;
    }
  }

  // ── Metal color (scalar → $eq) ─────────────────────────────────────────────
  const metalTerms = [
    ['rose gold',       'Rose Gold'],
    ['pink gold',       'Rose Gold'],
    ['yellow gold',     'Yellow Gold'],
    ['white gold',      'White Gold'],
    ['two tone',        'Two Tone'],
    ['tri color',       'Tri Color'],
    ['platinum',        'Platinum'],
    ['sterling silver', 'Sterling Silver'],
    ['silver',          'Sterling Silver'],
  ];
  for (const [term, value] of metalTerms) {
    if (q.includes(term)) { filters.metalColor = value; break; }
  }

  // ── Category (scalar → $eq) ───────────────────────────────────────────────
  // Use word-boundary matching to prevent "ring" matching inside "earring"
  const categoryTerms = [
    [['earring', 'earrings', 'stud', 'studs', 'hoop', 'hoops'],  'Earring'],
    [['ring', 'rings', 'band', 'bands', 'solitaire'],             'Ring'],
    [['pendant', 'pendants', 'charm'],                             'Pendant'],
    [['bracelet', 'bracelets'],                                    'Bracelet'],
    [['bangle', 'bangles'],                                        'Bangle'],
    [['necklace', 'necklaces', 'chain'],                          'Necklace'],
    [['brooch'],                                                    'Brooch'],
    [['anklet', 'anklets'],                                        'Anklet'],
    [['nose pin', 'nose ring'],                                    'Nose Pin'],
  ];
  for (const [terms, value] of categoryTerms) {
    if (terms.some((t) => words.includes(t))) {
      filters.category = value;
      break;
    }
  }

  // ── Gemstone (scalar → $eq) ───────────────────────────────────────────────
  const gemstoneTerms = [
    'ruby','sapphire','emerald','topaz','amethyst','citrine','garnet',
    'peridot','tanzanite','morganite','aquamarine','opal','diamond',
    'pearl','turquoise','spinel','tourmaline','moonstone','alexandrite',
  ];
  for (const gem of gemstoneTerms) {
    if (q.includes(gem)) {
      filters.gemstone = gem.charAt(0).toUpperCase() + gem.slice(1);
      break;
    }
  }

  return filters;
}

// ─── Filter Builder ───────────────────────────────────────────────────────────
/**
 * Build a Pinecone filter object from raw filter map + UI filters.
 *
 * Array fields → $in   (stoneShapes, stoneType, component)
 * Scalar fields → $eq  (everything else)
 *
 * UI filters take priority over query-extracted filters.
 */
const ARRAY_FIELDS = new Set(['stoneShapes', 'stoneType', 'component']);

function buildPineconeFilter(queryFilters, uiFilters = {}) {
  const merged = { ...queryFilters };

  // UI filters override query-extracted ones field by field
  for (const [key, val] of Object.entries(uiFilters)) {
    if (val !== undefined && val !== null && val !== '') merged[key] = val;
  }

  if (!Object.keys(merged).length) return null;

  const pineFilter = {};
  for (const [key, val] of Object.entries(merged)) {
    if (!val) continue;

    if (ARRAY_FIELDS.has(key)) {
      // Array metadata field — use $in so Pinecone checks if the stored
      // array contains any of our target values
      const targets = Array.isArray(val) ? val : [val];
      pineFilter[key] = { $in: targets };
    } else {
      // Scalar metadata field — exact match
      pineFilter[key] = { $eq: val };
    }
  }

  return Object.keys(pineFilter).length ? pineFilter : null;
}

// ─── 1. Text Search ───────────────────────────────────────────────────────────
export async function searchByText(query, { topK = POOL_SIZE, filter = {}, minScore } = {}) {
  console.log(`\n🔍 Searching: "${query}"`);

  // Expand short/vague queries before embedding
  const expandedQuery  = expandQuery(query);
  if (expandedQuery !== query) {
    console.log(`  → Expanded: "${expandedQuery}"`);
  }

  // Adaptive threshold — shorter original queries get more lenient cutoff
  const wordCount      = query.trim().split(/\s+/).length;
  const defaultThreshold = wordCount <= 2 ? SCORE.TEXT_SHORT : SCORE.TEXT_LONG;
  const threshold      = minScore ?? defaultThreshold;

  const queryFilters   = extractFiltersFromQuery(query);
  const pineconeFilter = buildPineconeFilter(queryFilters, filter);

  console.log(`  → Threshold: ${threshold} | Filters: ${JSON.stringify(pineconeFilter)}`);

  const queryEmbedding = await embedText(expandedQuery);
  const index          = await getPineconeIndex();

  const params = { vector: queryEmbedding, topK, includeMetadata: true };
  if (pineconeFilter) params.filter = pineconeFilter;

  const { matches } = await index.query(params);

  const results = matches
    .filter((m) => m.score >= threshold)
    .map(formatResult);

  console.log(`  → ${results.length} result(s)`);
  return results;
}

// ─── 2. Search by Image ───────────────────────────────────────────────────────
export async function searchByImage(fileBuffer, fileName, opts = {}) {
  console.log(`\n🖼️  Searching by image: ${fileName}`);

  const tags      = await autoTagImage(fileBuffer, fileName);
  const queryText = buildSearchableText(tags);

  const imageFilters = {};
  if (tags.category) imageFilters.category = tags.category;
  // Also lock stone shapes if detected (using $in since it's an array field)
  if (tags.stoneShapes?.length) imageFilters.stoneShapes = tags.stoneShapes;

  console.log(`  → Query text: ${queryText}`);
  console.log(`  → Filters: ${JSON.stringify(imageFilters)}`);

  return searchByText(queryText, {
    topK:     opts.topK ?? POOL_SIZE,
    filter:   imageFilters,
    minScore: opts.minScore ?? SCORE.IMAGE,
  });
}

// ─── 3. Find Similar ─────────────────────────────────────────────────────────
export async function findSimilar(id, topK = POOL_SIZE, lockCategory = true) {
  console.log(`\n🔗 Finding similar to: ${id}`);

  const index   = await getPineconeIndex();
  const fetched = await index.fetch([id]);
  const item    = fetched.vectors?.[id];

  if (!item) throw new Error(`Item not found: ${id}`);

  const category   = item.metadata?.category;
  const stoneShapes = item.metadata?.stoneShapes;

  const params = {
    vector:          item.values,
    topK:            topK + 1,
    includeMetadata: true,
  };

  // Build similarity filter: lock category + optionally stone shapes
  if (lockCategory && category) {
    const simFilter = { category: { $eq: category } };
    // If source has specific stone shapes, constrain to those too
    if (stoneShapes?.length) {
      simFilter.stoneShapes = { $in: stoneShapes };
    }
    params.filter = simFilter;
    console.log(`  → Similarity filter: ${JSON.stringify(simFilter)}`);
  }

  const { matches } = await index.query(params);

  const results = matches
    .filter((m) => m.id !== id)
    .filter((m) => m.score >= SCORE.SIMILAR)
    .slice(0, topK)
    .map(formatResult);

  console.log(`  → ${results.length} similar item(s)`);
  return results;
}

// ─── 4. Browse by filter ──────────────────────────────────────────────────────
export async function browseByFilter(filter, topK = POOL_SIZE) {
  console.log(`\n📋 Browsing:`, filter);
  const pineconeFilter = buildPineconeFilter({}, filter);
  const index          = await getPineconeIndex();
  const embedding      = await embedText('jewelry');
  const params         = { vector: embedding, topK, includeMetadata: true };
  if (pineconeFilter) params.filter = pineconeFilter;
  const { matches }    = await index.query(params);
  return matches.map(formatResult);
}

// ─── Formatter ────────────────────────────────────────────────────────────────
function formatResult(match) {
  return {
    id:            match.id,
    score:         Math.round(match.score * 1000) / 1000,
    fileName:      match.metadata?.fileName,
    imageUrl:      match.metadata?.imageUrl,
    sku:           match.metadata?.sku,
    title:         match.metadata?.title,
    category:      match.metadata?.category,
    subCategory:   match.metadata?.subCategory,
    jewelryType:   match.metadata?.jewelryType,
    centerStone:   match.metadata?.centerStone,
    metalColor:    match.metadata?.metalColor,
    gemstone:      match.metadata?.gemstone,
    settingStyle:  match.metadata?.settingStyle,
    stoneShapes:   match.metadata?.stoneShapes,
    stoneType:     match.metadata?.stoneType,
    styleKeywords: match.metadata?.styleKeywords,
    description:   match.metadata?.description,
    metadata:      match.metadata,
  };
}

export function printResults(results) {
  if (!results.length) { console.log('  No results found.'); return; }
  console.log('\n┌─ Results ──────────────────────────────────────────');
  results.forEach((r, i) => {
    console.log(`│ ${i + 1}. [${r.score}] ${r.title || r.fileName || r.id}`);
    console.log(`│    Category: ${r.category || 'N/A'} | Metal: ${r.metalColor || 'N/A'} | Shapes: ${r.stoneShapes?.join(', ') || 'N/A'}`);
    if (r.description) console.log(`│    "${r.description}"`);
    console.log('│');
  });
  console.log('└────────────────────────────────────────────────────');
}
