/**
 * Embedder — OpenAI text embeddings with auto-detected dimensions.
 *
 * WHY AUTO-DETECT:
 *   Different models output different vector sizes:
 *     text-embedding-3-small → 1536D
 *     text-embedding-3-large → 3072D
 *     future models          → unknown
 *
 *   Instead of hardcoding the dimension in config, we embed a test string
 *   once at startup, measure the actual output length, and use that
 *   everywhere — including Pinecone index creation and validation.
 *
 *   Result: you can switch OPENAI_EMBEDDING_MODEL in .env and nothing breaks.
 */

import OpenAI from 'openai';
import { config } from './config.js';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

// Cached after first call — only one probe request ever made
let detectedDimension = null;

/**
 * Embed a string and return the vector.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedText(text) {
  const response = await openai.embeddings.create({
    model: config.openai.embeddingModel,
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * Get the actual output dimension of the configured embedding model.
 * Makes a single real API call on first use, then returns cached value.
 *
 * @returns {Promise<number>}
 */
export async function getEmbeddingDimension() {
  if (detectedDimension !== null) return detectedDimension;

  console.log(`[Embedder] Probing dimension of "${config.openai.embeddingModel}"...`);
  const probe = await embedText('dimension probe');
  detectedDimension = probe.length;
  console.log(`[Embedder] Detected dimension: ${detectedDimension}D`);
  return detectedDimension;
}
