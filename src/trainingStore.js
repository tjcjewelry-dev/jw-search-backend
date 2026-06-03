/**
 * Training Store — persists "lessons" that teach the AI how to tag images.
 *
 * A lesson = one example image + its correct tags + a human-readable name.
 * When tagging any new image, all lessons are passed to GPT-4o Mini as
 * few-shot examples so it learns your specific visual vocabulary:
 *   "this setting style is Miracle Plate"
 *   "this metal is Rose Gold even though it looks like Two Tone"
 *   "these tiny channel-set stones mean hasRhodium = true"
 *
 * Storage: ./training-data/lessons.json
 *   - lessons array, each with compressed base64 image (512px WebP, ~10-30KB)
 *   - stored locally, committed to git or backed up manually
 *   - on Railway: lives on the persistent disk volume
 *
 * Lesson shape:
 * {
 *   id:          string    — UUID
 *   name:        string    — your label, e.g. "Miracle Plate Setting"
 *   description: string    — what visual feature this teaches, e.g. "small stones flush-set..."
 *   imageUrl:    string    — public URL (FTP/CDN) for display in the UI
 *   imageBase64: string    — compressed base64 included in GPT-4o Mini prompts
 *   mediaType:   string    — "image/webp" | "image/jpeg"
 *   tags:        object    — the correct tags for this image (same schema as normal tags)
 *   createdAt:   string    — ISO timestamp
 *   updatedAt:   string    — ISO timestamp
 * }
 */

import fs   from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath }  from 'url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR    = path.join(__dirname, '..', 'training-data');
const LESSONS_FILE = path.join(DATA_DIR, 'lessons.json');

// Maximum lessons sent to GPT-4o Mini per tagging call.
// Each lesson = ~85 tokens (image detail:low) + ~150 tokens (name + tags JSON).
// 6 lessons ≈ 1,400 extra input tokens per call — negligible cost.
export const MAX_LESSONS_IN_PROMPT = 6;

// ─── Persistence helpers ───────────────────────────────────────────────────

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAll() {
  ensureDir();
  if (!fs.existsSync(LESSONS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(LESSONS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeAll(lessons) {
  ensureDir();
  fs.writeFileSync(LESSONS_FILE, JSON.stringify(lessons, null, 2));
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Return all lessons, optionally without base64 (for list views).
 * @param {boolean} withBase64 — include imageBase64 field (default false for list)
 */
export function getAllLessons(withBase64 = false) {
  const lessons = readAll();
  if (withBase64) return lessons;
  // Strip base64 from list view — it's large and not needed for display
  return lessons.map(({ imageBase64, ...rest }) => rest);
}

/**
 * Return a single lesson including its base64.
 */
export function getLessonById(id) {
  const lesson = readAll().find((l) => l.id === id);
  if (!lesson) throw new Error(`Lesson not found: ${id}`);
  return lesson;
}

/**
 * Create a new lesson.
 * @param {object} data
 * @param {string} data.name         — human label, e.g. "Miracle Plate Setting"
 * @param {string} data.description  — what visual feature this teaches (optional)
 * @param {string} data.imageUrl     — public URL for display
 * @param {string} data.imageBase64  — compressed base64 for GPT prompts
 * @param {string} data.mediaType    — "image/webp" | "image/jpeg"
 * @param {object} data.tags         — correct jewelry tags for this image
 */
export function createLesson({ name, description = '', imageUrl, imageBase64, mediaType, tags = {} }) {
  if (!name?.trim())       throw new Error('name is required');
  if (!imageBase64)        throw new Error('imageBase64 is required');
  if (!imageUrl)           throw new Error('imageUrl is required');

  const lessons = readAll();
  const lesson = {
    id:          uuidv4(),
    name:        name.trim(),
    description: description.trim(),
    imageUrl,
    imageBase64,
    mediaType:   mediaType || 'image/webp',
    tags,
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  };
  lessons.push(lesson);
  writeAll(lessons);

  // Return without base64 for the API response
  const { imageBase64: _, ...publicLesson } = lesson;
  return publicLesson;
}

/**
 * Update lesson name, description, or tags.
 * imageBase64 can be updated too (if re-uploading the training image).
 */
export function updateLesson(id, patch) {
  const lessons = readAll();
  const idx = lessons.findIndex((l) => l.id === id);
  if (idx === -1) throw new Error(`Lesson not found: ${id}`);

  lessons[idx] = {
    ...lessons[idx],
    ...patch,
    id,                              // never allow ID change
    updatedAt: new Date().toISOString(),
  };
  writeAll(lessons);

  const { imageBase64: _, ...publicLesson } = lessons[idx];
  return publicLesson;
}

/**
 * Delete a lesson by ID.
 */
export function deleteLesson(id) {
  const lessons = readAll();
  const filtered = lessons.filter((l) => l.id !== id);
  if (filtered.length === lessons.length) throw new Error(`Lesson not found: ${id}`);
  writeAll(filtered);
}

/**
 * Return the lessons to include in a GPT-4o Mini tagging prompt.
 * Always returns the most recent MAX_LESSONS_IN_PROMPT lessons, with base64 included.
 *
 * Future improvement: filter by category/style similarity to the image being tagged.
 */
export function getLessonsForPrompt() {
  const all = readAll(); // includes base64
  // Most recent first, cap at MAX_LESSONS_IN_PROMPT
  return all
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, MAX_LESSONS_IN_PROMPT);
}
