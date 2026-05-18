/**
 * Pinecone Client — connection, index creation, and dimension validation.
 *
 * Dimension is always sourced from getEmbeddingDimension() (live probe of the
 * actual model) rather than a hardcoded config value. This means:
 *
 *   - Switch from text-embedding-3-small (1536D) to text-embedding-3-large (3072D)?
 *     → Update OPENAI_EMBEDDING_MODEL in .env, run `npm run reset`. Done.
 *   - Future 8192D model? Same two steps.
 *   - Dimension mismatch between index and model? Detected immediately at
 *     startup with a clear error pointing to `npm run reset`.
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { config } from './config.js';
import { getEmbeddingDimension } from './embedder.js';

let pineconeInstance = null;
let indexInstance = null;

function getPinecone() {
  if (!pineconeInstance) {
    pineconeInstance = new Pinecone({ apiKey: config.pinecone.apiKey });
  }
  return pineconeInstance;
}

/**
 * Get (or create) the Pinecone index.
 *
 * On every cold start:
 *   1. Probes the embedding model to get the actual dimension
 *   2. If index exists  → validates its dimension matches; errors clearly if not
 *   3. If index missing → creates it with the correct dimension
 */
export async function getPineconeIndex() {
  if (indexInstance) return indexInstance;

  const pc  = getPinecone();
  const dim = await getEmbeddingDimension(); // actual dimension from the live model

  const { indexes = [] } = await pc.listIndexes();
  const existing = indexes.find((i) => i.name === config.pinecone.indexName);

  if (existing) {
    const indexDim = existing.dimension;

    if (indexDim !== dim) {
      throw new Error(
        `\n\n❌  Dimension mismatch!\n` +
        `    Index "${config.pinecone.indexName}" has ${indexDim}D vectors.\n` +
        `    Model "${config.openai.embeddingModel}" outputs ${dim}D vectors.\n\n` +
        `    Fix → delete and recreate the index:\n` +
        `      npm run reset\n\n` +
        `    ⚠️  This deletes all stored vectors. Re-add images afterwards.\n`
      );
    }

    console.log(
      `[Pinecone] Index "${config.pinecone.indexName}" ready ` +
      `(${indexDim}D ✓  model: ${config.openai.embeddingModel})`
    );
  } else {
    console.log(`\n[Pinecone] Creating index "${config.pinecone.indexName}" (${dim}D)...`);
    await pc.createIndex({
      name:      config.pinecone.indexName,
      dimension: dim,
      metric:    config.pinecone.metric,
      spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
    });

    await waitUntilReady(pc);
    console.log('[Pinecone] Index ready!');
  }

  indexInstance = pc.index(config.pinecone.indexName);
  return indexInstance;
}

/**
 * Delete the index and recreate it using the current model's dimension.
 * Called by src/resetIndex.js
 */
export async function resetIndex() {
  const pc  = getPinecone();
  const dim = await getEmbeddingDimension();

  const { indexes = [] } = await pc.listIndexes();
  const exists = indexes.some((i) => i.name === config.pinecone.indexName);

  if (exists) {
    console.log(`[Pinecone] Deleting "${config.pinecone.indexName}"...`);
    await pc.deleteIndex(config.pinecone.indexName);
    await waitUntilGone(pc);
    console.log('[Pinecone] Deleted.');
  } else {
    console.log(`[Pinecone] Index not found — will create fresh.`);
  }

  indexInstance = null; // clear cache

  console.log(`[Pinecone] Creating fresh index (${dim}D, model: ${config.openai.embeddingModel})...`);
  await pc.createIndex({
    name:      config.pinecone.indexName,
    dimension: dim,
    metric:    config.pinecone.metric,
    spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
  });

  await waitUntilReady(pc);
  console.log('[Pinecone] Fresh index ready!');

  indexInstance = pc.index(config.pinecone.indexName);
  return indexInstance;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function waitUntilReady(pc) {
  let ready = false;
  while (!ready) {
    const info = await pc.describeIndex(config.pinecone.indexName);
    ready = info.status?.ready === true;
    if (!ready) { process.stdout.write('.'); await sleep(2000); }
  }
}

async function waitUntilGone(pc) {
  let gone = false;
  while (!gone) {
    const { indexes = [] } = await pc.listIndexes();
    gone = !indexes.some((i) => i.name === config.pinecone.indexName);
    if (!gone) { process.stdout.write('.'); await sleep(2000); }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Exports ──────────────────────────────────────────────────────────────────

export async function getIndexStats() {
  const idx = await getPineconeIndex();
  return idx.describeIndexStats();
}

export async function deleteJewelry(id) {
  const idx = await getPineconeIndex();
  await idx.deleteOne(id);
  console.log(`[Pinecone] Deleted: ${id}`);
}

export async function clearIndex() {
  const idx = await getPineconeIndex();
  await idx.deleteAll();
  console.log('[Pinecone] All vectors cleared.');
}
