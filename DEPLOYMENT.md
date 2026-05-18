# Deployment Guide

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  cPanel (yourdomain.com)                                │
│  Static files: dist/ → public_html/                    │
│  React app — no server needed                          │
└────────────────────┬────────────────────────────────────┘
                     │  HTTPS API calls to Railway
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Railway (your-app.up.railway.app)                      │
│  Node.js — node backend/server.js                      │
│  Connects to: Pinecone + OpenAI                        │
└─────────────────────────────────────────────────────────┘
```

---

## Part 1: Deploy Backend to Railway

### Step 1 — Push code to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOU/jewelry-search.git
git push -u origin main
```

### Step 2 — Create Railway project
1. Go to https://railway.app → New Project → Deploy from GitHub repo
2. Select your repository
3. Railway auto-detects Node.js and runs `npm install`

### Step 3 — Set environment variables in Railway dashboard
Go to your service → Variables tab → add these:

```
NODE_ENV=production
PORT=3001

PINECONE_API_KEY=your_pinecone_key
PINECONE_INDEX_NAME=jewelry-search

OPENAI_API_KEY=your_openai_key
OPENAI_VISION_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Your FTP settings (if using FTP uploader)
FTP_HOST=your_ftp_host
FTP_USER=your_ftp_user
FTP_PASS=your_ftp_password
FTP_BASE_URL=https://yourdomain.com/uploads
```

### Step 4 — Get your Railway URL
After deploy: Settings → Domains → copy the URL
e.g. `https://jewelry-search-production.up.railway.app`

### Step 5 — Verify backend is live
```
https://your-app.up.railway.app/api/health
```
Should return: `{"status":"ok","port":3001}`

---

## Part 2: Build & Deploy Frontend to cPanel

### Step 1 — Set your Railway URL in the frontend env
Edit `frontend/.env.production`:
```
VITE_API_URL=https://your-app.up.railway.app
```

### Step 2 — Build the frontend
```bash
cd frontend
npm install
npm run build
```
This creates `frontend/dist/` — a folder of pure static HTML/CSS/JS.

### Step 3 — Upload to cPanel
**Option A — File Manager (simple)**
1. cPanel → File Manager → public_html (or a subfolder like public_html/jewelry)
2. Upload all contents of `frontend/dist/` directly
3. Done — visit your domain

**Option B — FTP (faster for many files)**
```bash
# Using any FTP client (FileZilla, etc.)
# Upload contents of frontend/dist/ to public_html/
```

### Step 4 — Add .htaccess for React Router
React Router needs all URLs to serve `index.html`.
Create `public_html/.htaccess`:
```apache
Options -MultiViews
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^ index.html [QSA,L]
```
If .htaccess already exists, add those 4 lines inside it.

### Step 5 — Verify
Visit `https://yourdomain.com` — the app should load and search should work.

---

## Updating Later

### Backend update (push to GitHub → Railway auto-deploys):
```bash
git add .
git commit -m "Fix: search accuracy"
git push
```
Railway rebuilds automatically in ~1 minute.

### Frontend update:
```bash
cd frontend
npm run build
# Re-upload dist/ to cPanel (overwrite existing files)
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| API calls fail in production | VITE_API_URL not set | Edit `.env.production`, rebuild |
| CORS error in browser | Railway ALLOWED_ORIGINS wrong | Add your domain to Railway env var |
| Page refreshes give 404 | Missing .htaccess | Add the RewriteRule above |
| Railway deploy fails | Missing env vars | Check all vars are set in Railway dashboard |
| Upload works but image URL broken | FTP_BASE_URL wrong | Check FTP settings in Railway env |

---

## Cost

| Service | Cost |
|---|---|
| Railway Starter | $5/month (includes 512MB RAM, 1GB disk) |
| cPanel hosting | Your existing plan |
| Pinecone Enterprise Trial | $0 ($300 credits) |
| OpenAI (GPT-4o Mini + embeddings) | ~$0.001–0.01 per image |
