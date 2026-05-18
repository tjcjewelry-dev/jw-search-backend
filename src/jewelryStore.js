/**
 * Jewelry Store — main service for adding jewelry images to Pinecone.
 *
 * Pipeline per image:
 *   1. Resize + compress  (imageProcessor.js → sharp)
 *   2. Auto-tag           (visionTagger.js  → GPT-4o Mini)
 *   3. Merge manual tags  (your tags win over auto-tags)
 *   4. Build text         (rich searchable string from all tags)
 *   5. Embed text         (embedder.js → text-embedding-3-small)
 *   6. Upsert to Pinecone (vector + full metadata)
 */

import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import { getPineconeIndex } from "./pineconeClient.js";
import { embedText } from "./embedder.js";
import { autoTagImage, buildSearchableText } from "./visionTagger.js";

// ─── Add a Single Image ────────────────────────────────────────────────────────

/**
 * Add a jewelry image to Pinecone.
 *
 * @param {object} options
 * @param {string}  options.imagePath   - Local path to the image file
 * @param {string}  options.imageUrl    - Public CDN URL (stored in metadata for display)
 * @param {string}  [options.sku]       - Your product SKU / ID
 * @param {object}  [options.tags]      - Manual tags (override or supplement auto-tags)
 * @param {boolean} [options.autoTag]   - Set false to skip GPT-4o Vision entirely
 * @returns {{ id, tags, searchableText }}
 */
export async function addJewelryImage({
  imageUrl,
  fileName,
  fileBuffer,
  sku,
  tags: manualTags = {},
  autoTag = true,
}) {
  console.log(`\n━━━ Adding: ${fileName} ━━━`);
  /**
   * Step 1 + 2:
   * Auto-tag via GPT-4o Mini
   */
  let autoTags = {};

  if (autoTag) {
    console.log("  → Auto-tagging with GPT-4o Mini...");
    // now pass URL instead of local path
    autoTags = await autoTagImage(fileBuffer, fileName);
    console.log("  → Tags:", JSON.stringify(autoTags, null, 4));
  }

  /**
   * Step 3:
   * Merge tags
   */
  const finalTags = mergeDeep(autoTags, manualTags);

  /**
   * Step 4:
   * Searchable text
   */
  const searchableText = buildSearchableText(finalTags);

  console.log("  → Searchable text:", searchableText);

  /**
   * Step 5:
   * Generate embedding
   */
  console.log("  → Generating embedding...");

  const embedding = await embedText(searchableText);

  /**
   * Step 6:
   * Store in Pinecone
   */
  const id = sku || uuidv4();

  const metadata = {
    id,
    imageUrl,
    fileName,
    sku: sku || id,
    searchableText,
    addedAt: new Date().toISOString(),
    ...flattenForPinecone(finalTags),
  };

  const index = await getPineconeIndex();

  await index.upsert([
    {
      id,
      values: embedding,
      metadata,
    },
  ]);

  console.log(`  ✓ Stored in Pinecone → ID: ${id}`);

  return {
    id,
    tags: finalTags,
    searchableText,
  };
}

// ─── Batch Add ─────────────────────────────────────────────────────────────────

/**
 * Add multiple jewelry images at once.
 * @param {Array} items - Array of objects (same shape as addJewelryImage options)
 */
export async function addBatch(items) {
  const results = [];
  for (const item of items) {
    try {
      const result = await addJewelryImage(item);
      results.push({ success: true, ...result });
    } catch (err) {
      console.error(`  ✗ Failed: ${item.imagePath}: ${err.message}`);
      results.push({
        success: false,
        imagePath: item.imagePath,
        error: err.message,
      });
    }
  }
  return results;
}

// ─── Update Tags ───────────────────────────────────────────────────────────────

/**
 * Correct or enrich tags on an existing item. Re-embeds the updated text.
 * @param {string} id          - Pinecone vector ID / SKU
 * @param {object} updatedTags - Tag fields to update
 */
export async function updateJewelryTags(id, updatedTags) {
  const index = await getPineconeIndex();

  const fetched = await index.fetch([id]);
  const existing = fetched.vectors?.[id];
  if (!existing) throw new Error(`No jewelry found with ID: ${id}`);

  const currentMeta = existing.metadata || {};
  const newMeta = { ...currentMeta, ...flattenForPinecone(updatedTags) };
  const updatedText = buildSearchableText(newMeta);
  newMeta.searchableText = updatedText;

  const newEmbedding = await embedText(updatedText);
  await index.upsert([{ id, values: newEmbedding, metadata: newMeta }]);

  console.log(`[Store] Updated tags for: ${id}`);
  return { id, metadata: newMeta };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

// Pinecone metadata must be: string | number | boolean | string[]
function flattenForPinecone(tags) {
  const flat = {};
  for (const [key, val] of Object.entries(tags)) {
    if (val === null || val === undefined) continue;
    if (Array.isArray(val)) {
      flat[key] = val.filter(Boolean).map(String);
    } else if (typeof val === "object") {
      // Skip nested objects (shouldn't appear with current schema)
    } else {
      flat[key] = val;
    }
  }
  return flat;
}

function mergeDeep(base, override) {
  const result = { ...base };
  for (const [key, val] of Object.entries(override)) {
    if (val !== null && val !== undefined && val !== "") {
      result[key] = val;
    }
  }
  return result;
}
