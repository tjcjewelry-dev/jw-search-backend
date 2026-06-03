/**
 * Jewelry API Routes
 *
 * POST   /api/jewelry/upload        Upload image → auto-tag → embed → Pinecone
 * POST   /api/jewelry/search        Text search (returns full pool, frontend paginates)
 * POST   /api/jewelry/search-image  Search by uploaded reference image
 * GET    /api/jewelry/similar/:id   Find similar to existing item
 * GET    /api/jewelry/stats         Index stats
 * DELETE /api/jewelry/:id           Remove by ID
 */

import { Router } from "express";
import { upload } from "../middleware/upload.js";
import { localUpload } from "../middleware/local-upload.js";
import { addJewelryImage } from "../../src/jewelryStore.js";
import { uploadToFTP } from "../util/ftp-uploader.js";
import {
  searchByText,
  searchByImage,
  findSimilar,
  POOL_SIZE,
  editProductTag,
  bulkEditProductTags,
} from "../../src/jewelrySearch.js";
import { getIndexStats, deleteJewelry } from "../../src/pineconeClient.js";
import { extractPublicImages } from "../util/api-functions.js";

const router = Router();

// ─── Upload ───────────────────────────────────────────────────────────────────
router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "No image file provided." });

    const { sku, imageUrl, autoTag, tags: rawTags } = req.body;
    let tags = {};
    try {
      tags = rawTags ? JSON.parse(rawTags) : {};
    } catch {}

    const ftpResult = await uploadToFTP(req.file);
    const finalImageUrl = imageUrl || ftpResult.publicUrl;

    const result = await addJewelryImage({
      imageUrl: ftpResult.publicUrl,
      fileName: ftpResult.filename,
      fileBuffer: req.file.buffer,
      sku: sku || undefined,
      tags,
      autoTag: autoTag !== "false",
    });

    return res.json({
      success: true,
      id: result.id,
      originalFileName: req.file.originalname,
      uploadedFileName: ftpResult.filename,
      imageUrl: finalImageUrl,
      tags: result.tags,
      searchableText: result.searchableText,
    });
  } catch (err) {
    console.error("[Upload Error]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Text Search ──────────────────────────────────────────────────────────────
// Returns the full pool of results. Frontend slices it for pagination.
// Supports: { query, filter, minScore }
// filter keys must match stored metadata: metalColor, category, gemstone
router.post("/search", async (req, res) => {
  const { query, filter, minScore } = req.body;

  if (!query?.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    const results = await searchByText(query, {
      topK: POOL_SIZE,
      filter: filter || {},
      minScore: minScore != null ? Number(minScore) : undefined,
    });

    return res.json({
      results,
      total: results.length,
    });
  } catch (err) {
    console.error("[Search Error]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Image Search ─────────────────────────────────────────────────────────────
router.post("/search-image", localUpload.single("image"), async (req, res) => {
  if (!req.file)
    return res.status(400).json({ error: "No image file provided." });

  try {
    const results = await searchByImage(
      req.file.buffer,
      req.file.originalname,
      { topK: POOL_SIZE },
    );

    return res.json({ results, total: results.length });
  } catch (err) {
    console.error("[Image Search Error]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Find Similar ─────────────────────────────────────────────────────────────
router.get("/similar/:id", async (req, res) => {
  try {
    const results = await findSimilar(
      req.params.id,
      POOL_SIZE,
      true, // lockCategory — stays within same jewelry type
    );
    res.json({ results, total: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stats ────────────────────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const stats = await getIndexStats();
    res.json({
      totalVectors: stats.totalRecordCount ?? 0,
      indexName: process.env.PINECONE_INDEX_NAME || "jewelry-search",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Edit single item ─────────────────────────────────────────────────────────
// PUT /api/jewelry/edit/:id  { userPrompt }
router.put("/edit/:id", async (req, res) => {
  try {
    const { userPrompt } = req.body;
    if (!req.params.id || !userPrompt?.trim()) {
      return res.status(400).json({ error: "userPrompt is required" });
    }
    const result = await editProductTag(req.params.id, userPrompt.trim());
    return res.json({ success: true, result });
  } catch (err) {
    console.error("[Edit Error]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Bulk edit multiple items ──────────────────────────────────────────────────
// PUT /api/jewelry/bulk-edit  { ids: string[], userPrompt: string }
router.put("/bulk-edit", async (req, res) => {
  try {
    const { ids, userPrompt } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array is required" });
    }
    if (!userPrompt?.trim()) {
      return res.status(400).json({ error: "userPrompt is required" });
    }
    if (ids.length > 50) {
      return res.status(400).json({ error: "Maximum 50 items per bulk edit" });
    }
    const results = await bulkEditProductTags(ids, userPrompt.trim());
    return res.json({
      results,
      succeeded: results.filter((r) => r.success).length,
      failed:    results.filter((r) => !r.success).length,
    });
  } catch (err) {
    console.error("[Bulk Edit Error]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Delete ───────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    await deleteJewelry(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// extract images
router.post("/extract-images", async (req, res) => {
  try {
    const results = await extractPublicImages(req.body.urls);
    res.json({ success: true, results });
  } catch(err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
