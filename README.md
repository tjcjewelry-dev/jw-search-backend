# 💎 Jewelry Vector Search (OpenAI + Pinecone)

AI-powered semantic search for your jewelry catalog.  
**Stack:** GPT-4o Mini Vision · OpenAI Embeddings · Pinecone · sharp (image processing)

---

## Full Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  ADD IMAGE                                                      │
│                                                                 │
│  Image file                                                     │
│      │                                                          │
│      ▼                                                          │
│  sharp (resize to 512px, compress to WebP, ~10–30KB)           │
│      │  ← Never send full-res to OpenAI                        │
│      ▼                                                          │
│  GPT-4o Mini Vision (detail: "low" = 85 tokens flat)           │
│      │  Extracts:                                               │
│      │   title · category · jewelryType · metal                │
│      │   centerStone · stoneShape · gemstone · stoneColor      │
│      │   settingStyle · prong · shank · styleKeywords          │
│      │   hasRhodium · occasion · description                   │
│      ▼                                                          │
│  Merge with any manual tags you provide (yours win)            │
│      │                                                          │
│      ▼                                                          │
│  text-embedding-3-small → 1536D vector                         │
│      │                                                          │
│      ▼                                                          │
│  Pinecone upsert (vector + all metadata)                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  SEARCH                                                         │
│                                                                 │
│  "marquise yellow gold halo engagement ring"                    │
│      │                                                          │
│      ▼                                                          │
│  text-embedding-3-small → 1536D vector                         │
│      │                                                          │
│      ▼                                                          │
│  Pinecone similarity search → top N matches                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Setup

### 1. Install
```bash
npm install
```
> `sharp` installs native binaries automatically — no extra steps needed.

### 2. Configure
```bash
cp .env.example .env
```
Fill in two keys:
- `PINECONE_API_KEY` — from https://app.pinecone.io
- `OPENAI_API_KEY` — from https://platform.openai.com/api-keys

### 3. Initialize Pinecone index (once)
```bash
node src/setup.js
```

---

## Adding Jewelry Images

### Mode A — Fully auto-tagged
```js
import { addJewelryImage } from './src/jewelryStore.js';

await addJewelryImage({
  imagePath: './images/ring_001.jpg',
  imageUrl:  'https://your-cdn.com/images/ring_001.jpg',
  sku:       'RING-001',
  // GPT-4o Mini reads the (resized) image and tags everything
});
```

### Mode B — Partial manual tags + auto-fill
```js
await addJewelryImage({
  imagePath: './images/ring_002.jpg',
  imageUrl:  'https://your-cdn.com/images/ring_002.jpg',
  sku:       'RING-002',
  tags: {
    metal:       'Yellow Gold',  // you know this for sure
    centerStone: 'Marquise',     // and this
    // GPT-4o Mini fills in the rest
  },
});
```

### Mode C — Full manual control (skip Vision)
```js
await addJewelryImage({
  imagePath: './images/ring_003.jpg',
  imageUrl:  'https://your-cdn.com/images/ring_003.jpg',
  sku:       'RING-003',
  autoTag:   false, // skip GPT-4o Mini entirely
  tags: {
    title:        '18K Yellow Gold Marquise Solitaire',
    category:     'Ring',
    jewelryType:  'Engagement Ring',
    centerStone:  'Marquise',
    metal:        'Yellow Gold',
    metalKarat:   '18K',
    prong:        '4 Prong',
    shank:        'Split Shank',
    settingStyle: 'Solitaire',
    hasRhodium:   false,
    styleKeywords:['classic', 'elegant'],
    occasion:     'Engagement',
  },
});
```

---

## Searching

```js
import { searchByText, searchByImage, findSimilar, browseByFilter, printResults } from './src/jewelrySearch.js';

// Natural language
const r1 = await searchByText('marquise halo rose gold engagement ring');
printResults(r1);

// With filter (only search Rings)
const r2 = await searchByText('vintage art deco', { filter: { category: 'Ring' }, topK: 5 });

// Find by image — uploads a photo and finds similar catalog items
const r3 = await searchByImage('./reference_photo.jpg', { topK: 5 });

// Find similar to an existing SKU
const r4 = await findSimilar('RING-001', 5);

// Browse by metadata only
const r5 = await browseByFilter({ metal: 'Rose Gold', category: 'Earring' });
const r6 = await browseByFilter({ gemstone: 'Ruby' });
const r7 = await browseByFilter({ hasRhodium: true });
```

---

## Image Processing Settings

Edit `src/config.js` → `config.image`:

| Setting | Default | Notes |
|---|---|---|
| `maxSize` | `512` | Longest edge in px. Use `768` for more detail. |
| `format` | `'webp'` | `'webp'` or `'jpeg'` |
| `quality` | `82` | 0–100. 80–85 is the sweet spot. |

**Why 512px + detail: "low"?**  
OpenAI Vision tiles images at 512×512. Sending a 512px image forces exactly 1 tile = **85 tokens flat**, regardless of content. A raw 3000×2000px image = ~24 tiles = ~4,080 tokens. Same tagging quality, ~48× cheaper per image.

---

## Supported Tag Fields

| Field | Example Values |
|---|---|
| `title` | "18K Yellow Gold Marquise Solitaire Ring" |
| `category` | Ring, Earring, Pendant, Bracelet, Necklace, Bangle |
| `subCategory` | Solitaire, Fashion, Stud, Hoop, Drop, Tennis, Eternity |
| `jewelryType` | Engagement Ring, Wedding Band, Cocktail Ring, Tennis Bracelet |
| `centerStone` | Round, Marquise, Princess, Oval, Pear, Cushion, Emerald |
| `sideStones` | Array: ["Round", "Baguette"] |
| `metal` | Yellow Gold, White Gold, Rose Gold, Two Tone, Platinum |
| `metalKarat` | 10K, 14K, 18K, 22K, 925 Silver |
| `stoneShape` | Round, Marquise, Princess, Oval, Baguette, Mixed |
| `gemstone` | Diamond, Ruby, Sapphire, Emerald, Topaz, Morganite, Opal |
| `stoneColor` | White, Yellow, Blue, Red, Green, Pink |
| `prong` | 4 Prong, 6 Prong, Bezel, Channel, Pave, Bar Set |
| `shank` | Plain, Split Shank, Twisted, Knife Edge, Milgrain |
| `settingStyle` | Solitaire, Halo, Double Halo, Three Stone, Vintage, Micropave |
| `component` | Rope Chain, Box Chain, Cable Chain |
| `hasRhodium` | true / false |
| `styleKeywords` | Array: ["vintage", "minimalist", "romantic", "geometric"] |
| `occasion` | Engagement, Wedding, Anniversary, Fashion, Statement |

---

## Adding New Fields

1. Add to the JSON schema inside `JEWELRY_ANALYSIS_PROMPT` in `src/visionTagger.js`
2. Add to `buildSearchableText()` in the same file
That's it — no other files need changing.

---

## Project Structure

```
src/
  config.js          → API keys, model names, image settings
  imageProcessor.js  → sharp: resize + compress before API call  ← NEW
  embedder.js        → text-embedding-3-small (1536D)
  visionTagger.js    → GPT-4o Mini Vision → structured tags
  pineconeClient.js  → Pinecone connection & index management
  jewelryStore.js    → Add/update pipeline (orchestrates above)
  jewelrySearch.js   → All 4 search modes
  setup.js           → One-time index initialization

examples/
  addJewelry.js      → How to add images (3 modes + batch)
  search.js          → How to search (5 examples)
```

---

## Cost Estimate

| Operation | Model | Cost |
|---|---|---|
| Auto-tag 1 image (512px, detail:low) | GPT-4o Mini | ~$0.0003–0.001 |
| Embed text (add) | text-embedding-3-small | ~$0.00002 |
| Search query | text-embedding-3-small | ~$0.00002 |
| **1,000 images auto-tagged** | — | **~$0.30–1.00 total** |

Compared to full-res GPT-4o: **~20–50× cheaper** with identical tagging quality.  
Pinecone Enterprise Trial: $0 (your $300 credits).

---

## Full-Stack App (Express + React)

### Quick Start

```bash
# 1. Install root (backend) dependencies
npm install

# 2. Install frontend dependencies
cd frontend && npm install && cd ..

# 3. Configure env
cp .env.example .env  # fill in PINECONE_API_KEY + OPENAI_API_KEY

# 4. Initialize Pinecone index (once)
npm run setup

# 5. Start both servers
npm run dev
```

- **Backend API**: http://localhost:3001
- **Frontend UI**: http://localhost:5173

---

### Architecture

```
jw-search-v2/
├── src/                     Core AI modules (Pinecone, Vision, Embedder)
├── backend/
│   ├── server.js            Express app (port 3001)
│   ├── routes/
│   │   └── jewelry.routes.js  API endpoints
│   └── middleware/
│       └── upload.js        Multer file handling
├── frontend/                React + Vite + Zustand + Tailwind
│   └── src/
│       ├── api/             Axios API client
│       ├── store/           Zustand global state
│       ├── components/      Reusable UI components
│       └── pages/           Upload + Search pages
└── uploads/                 Temp storage for uploaded images
```

### API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/jewelry/upload` | Upload one image + optional tags |
| POST | `/api/jewelry/search` | Text/natural language search |
| POST | `/api/jewelry/search-image` | Search by reference image |
| GET  | `/api/jewelry/similar/:id` | Find similar to existing item |
| GET  | `/api/jewelry/stats` | Index stats (total vectors) |
| DELETE | `/api/jewelry/:id` | Remove item by ID |
| GET  | `/uploads/:filename` | Serve uploaded images |
