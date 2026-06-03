/**
 * Express Server
 *
 * CORS is set via ALLOWED_ORIGINS env var (comma-separated).
 * Set this in Railway to your cPanel domain(s).
 */

import 'dotenv/config';
import express    from 'express';
import cors       from 'cors';
import path       from 'path';
import { fileURLToPath } from 'url';
import fs         from 'fs';
import { validateConfig } from '../src/config.js';
import jewelryRoutes  from './routes/jewelry.routes.js';
import trainingRoutes from './routes/training.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT      = process.env.PORT || 3001;

// ── Ensure required directories exist ─────────────────────────────────────────
const uploadsDir     = path.join(__dirname, '..', 'uploads');
const trainingDir    = path.join(__dirname, '..', 'training-data');
[uploadsDir, trainingDir].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── Config validation ─────────────────────────────────────────────────────────
try {
  validateConfig();
} catch (err) {
  console.error('❌  Config error:', err.message);
  process.exit(1);
}

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : ['http://localhost:5173', 'http://localhost:3000', 'https://tjc.me', 'https://tjceternity.com'];

console.log('[CORS] Allowed origins:', allowedOrigins);

const app = express();

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/jewelry',  jewelryRoutes);
app.use('/api/training', trainingRoutes);

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const lessonCount = (() => {
    const f = path.join(__dirname, '..', 'training-data', 'lessons.json');
    try { return JSON.parse(fs.readFileSync(f, 'utf8')).length; } catch { return 0; }
  })();
  res.json({ status: 'ok', port: PORT, origins: allowedOrigins, trainingLessons: lessonCount });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n💎  Jewelry API → ${process.env.HOST_URL || `http://localhost:${PORT}`}`);
  console.log(`   Uploads     → ${process.env.HOST_URL || `http://localhost:${PORT}`}/uploads`);
  console.log(`   Health      → ${process.env.HOST_URL || `http://localhost:${PORT}`}/api/health\n`);
});
