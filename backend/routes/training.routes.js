/**
 * Training API Routes
 *
 * POST   /api/training/lessons          Create a lesson (upload image + correct tags)
 * GET    /api/training/lessons          List all lessons (no base64 — UI display only)
 * GET    /api/training/lessons/:id      Get single lesson (includes base64 for admin)
 * PUT    /api/training/lessons/:id      Update name / description / tags
 * DELETE /api/training/lessons/:id      Delete lesson
 * GET    /api/training/lessons/count    How many lessons are active
 *
 * A lesson = one training example that teaches the AI a visual pattern.
 * The more specific and descriptive the lessons, the better the tagging accuracy.
 *
 * Example use:
 *   - Upload 5 images of "Miracle Plate" rings with correct tags → AI learns the pattern
 *   - Upload 3 images of Two-Tone vs Rose Gold items → AI stops confusing them
 *   - Upload images with hasRhodium=true → AI reliably detects rhodium plating
 */

import { Router }         from 'express';
import { localUpload }    from '../middleware/local-upload.js';
import { uploadToFTP }    from '../util/ftp-uploader.js';
import { prepareImageForAPI } from '../../src/imageProcessor.js';
import {
  getAllLessons,
  getLessonById,
  createLesson,
  updateLesson,
  deleteLesson,
} from '../../src/trainingStore.js';

const router = Router();

// ─── List all lessons ──────────────────────────────────────────────────────
// Returns all lessons without base64 (safe for list views / UI)
router.get('/lessons', (req, res) => {
  try {
    const lessons = getAllLessons(false); // false = no base64
    res.json({ lessons, total: lessons.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Lesson count ──────────────────────────────────────────────────────────
router.get('/lessons/count', (req, res) => {
  try {
    const lessons = getAllLessons(false);
    res.json({ count: lessons.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get single lesson ─────────────────────────────────────────────────────
router.get('/lessons/:id', (req, res) => {
  try {
    const lesson = getLessonById(req.params.id);
    // Don't expose full base64 in API — large and not needed for display
    const { imageBase64, ...publicLesson } = lesson;
    res.json({ lesson: publicLesson });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ─── Create lesson ─────────────────────────────────────────────────────────
// multipart/form-data: image file + JSON fields
router.post('/lessons', localUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Training image is required.' });
    }

    const { name, description, tags: rawTags } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required (e.g. "Miracle Plate Setting")' });
    }

    let tags = {};
    try { tags = rawTags ? JSON.parse(rawTags) : {}; } catch {}

    // Upload the training image to FTP (for public URL / display in UI)
    const ftpResult = await uploadToFTP(req.file);

    // Compress the image to base64 — this is what gets stored and sent to GPT-4o Mini
    // in future few-shot prompts. Small (512px WebP, ~5-30KB base64).
    const { base64, mediaType } = await prepareImageForAPI(req.file.buffer, req.file.originalname);

    const lesson = createLesson({
      name,
      description: description || '',
      imageUrl:    ftpResult.publicUrl,
      imageBase64: base64,
      mediaType,
      tags,
    });

    return res.json({
      success: true,
      lesson,
      message: `Lesson "${name}" created. The AI will use this example when tagging future images.`,
    });
  } catch (err) {
    console.error('[Training Create Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Update lesson ─────────────────────────────────────────────────────────
// Can update: name, description, tags
// Can also update the training image by uploading a new one
router.put('/lessons/:id', localUpload.single('image'), async (req, res) => {
  try {
    const { name, description, tags: rawTags } = req.body;

    const patch = {};
    if (name?.trim())   patch.name        = name.trim();
    if (description != null) patch.description = description;

    let tags;
    try { tags = rawTags ? JSON.parse(rawTags) : null; } catch {}
    if (tags) patch.tags = tags;

    // If a new training image is uploaded, compress it and replace base64
    if (req.file) {
      const ftpResult = await uploadToFTP(req.file);
      const { base64, mediaType } = await prepareImageForAPI(req.file.buffer, req.file.originalname);
      patch.imageUrl    = ftpResult.publicUrl;
      patch.imageBase64 = base64;
      patch.mediaType   = mediaType;
    }

    const updated = updateLesson(req.params.id, patch);
    res.json({ success: true, lesson: updated });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

// ─── Delete lesson ─────────────────────────────────────────────────────────
router.delete('/lessons/:id', (req, res) => {
  try {
    deleteLesson(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

export default router;
