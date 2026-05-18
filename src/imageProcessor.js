/**
 * Image Processor — resize + compress jewelry images before sending to OpenAI.
 *
 * WHY THIS MATTERS:
 *   GPT-4o Vision charges by 512×512 "tiles". A 3000×2000 raw image = ~24 tiles.
 *   A 512×512 compressed image = 1 tile. Same tagging quality, 24× cheaper API call.
 *
 * Strategy:
 *   - Resize so the longest edge is ≤ maxSize (default 512px), preserving aspect ratio
 *   - Convert to WebP (better compression than JPEG at same quality)
 *   - Output as a Buffer — no temp file needed, goes straight to base64
 */

import sharp from "sharp";
import fs from "fs";
import path from "path";
import { config } from "./config.js";

/**
 * Resize + compress an image file and return as a base64 string.
 * The original file is never modified.
 *
 * @param {string} imagePath   - Path to the original image
 * @param {object} [opts]      - Override defaults from config
 * @param {number} [opts.maxSize]   - Longest edge in px (default: config.image.maxSize)
 * @param {string} [opts.format]    - 'webp' | 'jpeg'
 * @param {number} [opts.quality]   - 0–100
 * @returns {{ base64: string, mediaType: string, originalSize: number, compressedSize: number }}
 */
export async function prepareImageForAPI(
  fileBuffer,
  fileName = "image",
  opts = {},
) {
  const maxSize = opts.maxSize ?? config.image.maxSize;

  const format = opts.format ?? config.image.format;

  const quality = opts.quality ?? config.image.quality;

  const originalSize = fileBuffer.length;

  /**
   * Original metadata
   */
  const metadata = await sharp(fileBuffer).metadata();

  const { width, height } = metadata;

  /**
   * Resize only if needed
   */
  const longestEdge = Math.max(width, height);

  const needsResize = longestEdge > maxSize;

  let pipeline = sharp(fileBuffer).rotate();

  if (needsResize) {
    pipeline = pipeline.resize({
      width: width >= height ? maxSize : undefined,

      height: height > width ? maxSize : undefined,

      fit: "inside",

      withoutEnlargement: true,
    });
  }

  /**
   * Compress
   */
  if (format === "webp") {
    pipeline = pipeline.webp({
      quality,
    });
  } else {
    pipeline = pipeline.jpeg({
      quality,
      mozjpeg: true,
    });
  }

  const compressedBuffer = await pipeline.toBuffer();

  const compressedSize = compressedBuffer.length;

  /**
   * Final format
   */
  const mediaType = format === "webp" ? "image/webp" : "image/jpeg";

  const base64 = compressedBuffer.toString("base64");

  /**
   * Logging
   */
  const savedPct = (
    ((originalSize - compressedSize) / originalSize) *
    100
  ).toFixed(1);

  const origDims = `${width}×${height}`;

  const newMeta = await sharp(compressedBuffer).metadata();

  const newDims = `${newMeta.width}×${newMeta.height}`;

  console.log(
    `  [ImageProcessor] ${path.basename(fileName)}: ` +
      `${origDims} → ${newDims} | ` +
      `${(originalSize / 1024).toFixed(0)}KB → ` +
      `${(compressedSize / 1024).toFixed(0)}KB ` +
      `(saved ${savedPct}%)`,
  );

  return { base64, mediaType, originalSize, compressedSize, compressedBuffer };
}

/**
 * Quick helper: just get image dimensions without processing.
 * @param {string} imagePath
 * @returns {{ width, height }}
 */
export async function getImageDimensions(imagePath) {
  const meta = await sharp(imagePath).metadata();
  return { width: meta.width, height: meta.height };
}
