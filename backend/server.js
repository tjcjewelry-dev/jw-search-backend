/**
 * Express Server
 *
 * CORS is set via ALLOWED_ORIGINS env var (comma-separated).
 * Set this in Railway to your cPanel domain(s).
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { validateConfig } from '../src/config.js';
import jewelryRoutes from './routes/jewelry.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT      = process.env.PORT || 3001;

// ── Uploads dir ───────────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── Config validation ─────────────────────────────────────────────────────────
try {
  validateConfig();
} catch (err) {
  console.error('❌  Config error:', err.message);
  process.exit(1);
}

// ── CORS ──────────────────────────────────────────────────────────────────────
// In Railway dashboard: set ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : ['http://localhost:5173', 'http://localhost:3000', 'https://tjc.me', 'https://tjceternity.com'];

console.log('[CORS] Allowed origins:', allowedOrigins);

const app = express();

app.use(cors({
  origin: (origin, cb) => {
    // Allow server-to-server (no origin) and listed origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.use('/api/jewelry', jewelryRoutes);

app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', port: PORT, origins: allowedOrigins })
);

app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n💎  Jewelry API → ${process.env.HOST_URL}`);
  console.log(`   Uploads     → ${process.env.HOST_URL}/uploads`);
  console.log(`   Health      → ${process.env.HOST_URL}/api/health\n`);
});
