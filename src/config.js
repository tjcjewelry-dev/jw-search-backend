/**
 * Config — all settings in one place.
 *
 * Embedding dimension is intentionally NOT set here.
 * It is auto-detected from the model at runtime by embedder.js → getEmbeddingDimension().
 * This means you can change OPENAI_EMBEDDING_MODEL and nothing else needs updating.
 */

import dotenv from 'dotenv';
dotenv.config();

export const config = {
  pinecone: {
    apiKey:    process.env.PINECONE_API_KEY,
    indexName: process.env.PINECONE_INDEX_NAME || 'jewelry-search',
    metric:    'cosine',
    // dimension is NOT here — fetched live from the embedding model
  },
  openai: {
    apiKey:         process.env.OPENAI_API_KEY,
    visionModel:    process.env.OPENAI_VISION_MODEL    || 'gpt-4o-mini',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  },
  image: {
    maxSize: 512,    // longest edge in px before sending to OpenAI
    format:  'webp', // webp | jpeg
    quality: 82,     // 0–100
  },
};

export function validateConfig() {
  const missing = [];
  if (!config.pinecone.apiKey) missing.push('PINECONE_API_KEY');
  if (!config.openai.apiKey)   missing.push('OPENAI_API_KEY');
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      `Please copy .env.example to .env and fill in your keys.`
    );
  }
}
