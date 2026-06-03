/**
 * Jewelry Store — main service for adding jewelry images to Pinecone.
 *
 * Pipeline per image:
 *   1. Load training lessons (if any exist)
 *   2. Resize + compress image
 *   3. Auto-tag via GPT-4o Mini (few-shot if lessons exist, standard otherwise)
 *   4. Merge with any manual tags provided (manual tags always win)
 *   5. Build rich searchable text from all tags
 *   6. Embed text → vector
 *   7. Upsert to Pinecone
 */

import { v4 as uuidv4 }            from 'uuid';
import { getPineconeIndex }         from './pineconeClient.js';
import { embedText }                from './embedder.js';
import { autoTagImage, buildSearchableText } from './visionTagger.js';
import { getLessonsForPrompt }      from './trainingStore.js';

// ─── Add a single image ────────────────────────────────────────────────────

/**
 * @param {object} options
 * @param {string}       options.imageUrl    — public CDN URL (stored for display)
 * @param {string}       options.fileName    — original filename
 * @param {Buffer}       options.fileBuffer  — image file buffer for vision
 * @param {string}       [options.sku]       — your product ID
 * @param {object}       [options.tags]      — manual tags (override auto-tags)
 * @param {boolean}      [options.autoTag]   — false to skip vision entirely
 * @param {object|null}  [options.editableData] — existing tags for refinement mode
 * @param {string|null}  [options.userPrompt]   — correction text for refinement mode
 */
export async function addJewelryImage({
  imageUrl,
  fileName,
  fileBuffer,
  sku,
  tags: manualTags = {},
  autoTag          = true,
  editableData     = null,
  userPrompt       = null,
}) {
  console.log(`\n━━━ Adding: ${fileName} ━━━`);

  let autoTags = {};

  if (autoTag) {
    console.log('  → Auto-tagging with GPT-4o Mini...');

    // Load training lessons — passed to visionTagger for few-shot learning
    // Only use lessons for fresh tagging, NOT for refinement (editableData = correction)
    const lessons = (editableData === null && userPrompt === null)
      ? getLessonsForPrompt()
      : [];

    if (lessons.length > 0) {
      console.log(`  → Using ${lessons.length} training lesson${lessons.length !== 1 ? 's' : ''} for few-shot tagging`);
    }

    autoTags = await autoTagImage(fileBuffer, fileName, editableData, userPrompt, lessons);
    console.log('  → Tags:', JSON.stringify(autoTags, null, 4));
  }

  // Manual tags override auto-tags field by field
  const finalTags = mergeDeep(autoTags, manualTags);

  const searchableText = buildSearchableText(finalTags);
  console.log('  → Searchable text:', searchableText);

  console.log('  → Generating embedding...');
  const embedding = await embedText(searchableText);

  const id = sku || uuidv4();
  const metadata = {
    id,
    imageUrl,
    fileName,
    sku:           sku || id,
    searchableText,
    addedAt:       new Date().toISOString(),
    ...flattenForPinecone(finalTags),
  };

  const index = await getPineconeIndex();
  await index.upsert([{ id, values: embedding, metadata }]);

  console.log(`  ✓ Stored in Pinecone → ID: ${id}`);
  return { id, tags: finalTags, searchableText };
}

// ─── Batch add ────────────────────────────────────────────────────────────

export async function addBatch(items) {
  const results = [];
  for (const item of items) {
    try {
      results.push({ success: true, ...(await addJewelryImage(item)) });
    } catch (err) {
      console.error(`  ✗ Failed: ${item.fileName}: ${err.message}`);
      results.push({ success: false, fileName: item.fileName, error: err.message });
    }
  }
  return results;
}

// ─── Update tags ──────────────────────────────────────────────────────────

export async function updateJewelryTags(id, updatedTags) {
  const index = await getPineconeIndex();
  const fetched = await index.fetch([id]);
  const existing = fetched.vectors?.[id] ?? fetched.records?.[id];
  if (!existing) throw new Error(`No jewelry found with ID: ${id}`);

  const newMeta = { ...(existing.metadata || {}), ...flattenForPinecone(updatedTags) };
  newMeta.searchableText = buildSearchableText(newMeta);

  const newEmbedding = await embedText(newMeta.searchableText);
  await index.upsert([{ id, values: newEmbedding, metadata: newMeta }]);

  console.log(`[Store] Updated tags for: ${id}`);
  return { id, metadata: newMeta };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function flattenForPinecone(tags) {
  const flat = {};
  for (const [key, val] of Object.entries(tags)) {
    if (val === null || val === undefined) continue;
    if (Array.isArray(val)) {
      flat[key] = val.filter(Boolean).map(String);
    } else if (typeof val === 'object') {
      // skip nested objects
    } else {
      flat[key] = val;
    }
  }
  return flat;
}

function mergeDeep(base, override) {
  const result = { ...base };
  for (const [key, val] of Object.entries(override)) {
    if (val !== null && val !== undefined && val !== '') result[key] = val;
  }
  return result;
}
