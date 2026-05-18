/**
 * Vision Tagger — uses GPT-4o Mini Vision to analyze jewelry images
 * and extract structured tags automatically.
 *
 * Images are always resized + compressed before the API call.
 * See imageProcessor.js for the resize logic.
 */

import OpenAI from 'openai';
import { config } from './config.js';
import { prepareImageForAPI } from './imageProcessor.js';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

// ─── The Prompt ────────────────────────────────────────────────────────────────
// Structured output prompt for GPT-4o Mini.
// Add new fields here — no other files need changing.
const JEWELRY_ANALYSIS_PROMPT = `You are an expert jewelry cataloger. Analyze this jewelry image carefully and extract structured tags.

Return ONLY a valid JSON object with these exact keys. Use null for anything not visible or not applicable.

{
  "category": "Ring | Bangle | Necklace | Pendant | Earring | Bracelet | Set | Nose Pin | Component | Cufflink | Tie Tac | Brooch | Anklet | null",

  "subCategory": "Fashion | Bridal | Engagement | Gemstone | Solitaire | Stud | Hoop | Drop | Dangle | Tennis | Eternity | Cluster | Infinity | null",

  "stoneType": ["White", "Color Stone", "Black Stones"],

  "stoneShapes": ["ASCHER","BAGUETTE","Brilliant TRAPEZOIDS","BULLET","MOON-STONE","TRAP BAGUETTE","Cardiac","CRISS CUT","OCTAGONAL","DROP","PEAR","ELONGTED STEP BAGUETTE","ELONGTED BAGUETTE","ELONGATED EMERALD","ELONGATED PEAR","ELONGATE HEXAGONE","EMERALD","ELONGATED MARQUISE","ELONGATED OVAL","EPAULETTE","PEAR ROSE CUT","ELONGATED RADIANT","ELONGTED CUSHION","FANCY CUT DIAMOND","HEART","HALF MOON","HEXAGON","KITE","LEAF","Long Hexa French marquise","LONG HEXAGONE","LONG CUSHION","MARQUISE","MIX","NERU STRAIGHT BAGUETTE","OVAL","OCTOGON","CUSHION-OLD-Mined CUT","OVAL ROSE CUT","OTNZNITE",,"PRINCESS","PERIDOT","PERDOT","PIE CUT","PEARL","ROUND","RADIANT","ROUND CABOCHON","ROSECUT ROUND","ROUGH","ROUND-OLD-Mined cut","ROUND RoseCut","RECTANGLE TAPPER BAGUETTE","STRAIGHT BAGUETTE","Shield","SUGER LOAF","Stepped Marquise","Stepped Oval","SPEER","SP RADIANT","SQUARE EMERALD","SQUARE RADIANT","STEP CUT TRAPEZOIDS","Triangle","TAPPER BAGUETTE","TILED CUT","Trillion","TRAPEZOIDS","CUSHION"],

  "metalColor": "Yellow Gold | White Gold | Rose Gold | Two Tone | Tri Color | Platinum | Sterling Silver | null",

  "prong": "4 Prong | 6 Prong | V Prong | Bezel | Half Bezel | Channel | Pave | Bar Set | Burnish | Tension | Shared Prong | Double Prong | Flat Prong | Claw Prong | Bead Set | Common Prong | Fishtail | Scalloped | Micro-Pave | French Set | null",

  "shank": "Plain | Split Shank | Twisted | Knife Edge | Milgrain | Comfort Fit | Wide Band | Tapered | Bypass | Infinity | Cathedral | Euro-Shank | Square | Interlocking | Flat | Half-Round | Criss-Cross | Open | Fluted | Floral | null",

  "diamondColor": "White | Yellow | Champagne | Black | Pink | Blue | Green | Orange | Brown | Purple | Red | Gray | Salt and Pepper | Cognac | Canary | Chameleon | null",

  "gemstone": "Ruby | Sapphire | Emerald | Topaz | Amethyst | Citrine | Garnet | Peridot | Tanzanite | Morganite | Aquamarine | Opal | Agate | Alexandrite | Almandine | Amazonite | Amber | Ametrine | Ammolite | Andalusite | Apatite | Aventurine | Axinite | Azurite | Benitoite | Beryl | Bloodstone | Carnelian | Cassiterite | Celestite | Chalcedony | Chrome Diopside | Chrysoberyl | Chrysocolla | Chrysoprase | Coral | Danburite | Diamond | Diopside | Dumortierite | Enstatite | Epidote | Fluorite | Goshenite | Hematite | Hemimorphite | Hessonite | Hiddenite | Howlite | Iolite | Jadeite | Jasper | Jet | Kornerupine | Kunzite | Kyanite | Labradorite | Lapis Lazuli | Larimar | Lepidolite | Malachite | Moldavite | Moonstone | Nephrite | Obsidian | Onyx | Orthoclase | Padparadscha | Pearl | Petalite | Pietersite | Prehnite | Pyrite | Pyrope | Quartz | Rhodochrosite | Rhodonite | Rutile | Scapolite | Serpentine | Sodalite | Spessartite | Sphalerite | Sphene | Spinel | Spodumene | Sunstone | Tiger's Eye | Tourmaline | Tsavorite | Turquoise | Variscitite | Vesuvianite | Zircon | Zoisite | null",

  "cut": "Brilliant | Rose Cut | Single Cut | Old Mine | Old European | Special | Mixed | Princess | Step | Emerald | Asscher | Cushion | Radiant | Oval | Pear | Marquise | Heart | Trillion | Baguette | Tapered Baguette | Cabochon | Briolette | Shield | Kite | Lozenge | Portrait | Hexagon | Octagon | Bullet | Trapezoid | Calf's Head | Crisscut | Jubilee | Flanders | Portuguese | Concave | Checkerboard | null",

  "component": ["BACK","POST","PUSH","LEVER BACK","SOUTH SCREW","REVERSE SOUTH","LEAVER","BACK POST","FRICTION NUTS","GUARDIAN POST","THREADED POST","HEART SHAPE PUSH","HEAVY PUSH","TRIGER POST","OMEGA","CHAIN","ROPE","ROLO","CABLE","BOX CHAIN","VENET BOX","CURB","HERRINGBONE","PAPER CLIP","MANGAL SUTRA","BOLO CHAIN","SNAKE","ANCHOR","STAMPING CHAIN","BALL CHAIN","MESH","LINK","4 PRONG ROUND BASKET","4 PRONG PRINCESS BASKET","6PRONG ROUND","V-PRONG","4PR OVAL","5PR PEAR","BEZEL","COLLETS","R415HEAD","AVTAR ROUND","COMBO CLUSTER","ILLUSSION","24 CUTS","12 CUTS","DAZ 0.50","LOCK","LOB","LOBSTER LOCK","SPRING LOCK","SAFETY CATCH","FISH LOCK","ITALIAN LOBSTER","MAGNET","CUFF LINK","TUBING","BEARING","FLATE","FANCY BORDER","DAZ","CRIMPS","DIA STRUCK","WIP","RING 2.5 MM","TEXTURE 3.0 MM","BEADALON","GB","PART"],

  "hasRhodium": true,

  "settingStyle": "Solitaire | Halo | Double Halo | Pave | Side Stone | Three-Stone | Bezel | Tension | Channel | Bar | Flush | Gypsy | Cluster | Cathedral | Basket | Peg | Tiffany | Vintage | Milgrain | Filigree | Shank/Split-Shank | Bypass | Infinity | Toi et Moi | Eternity | Half-Eternity | Pavé (Micro-pavé) | Hidden Halo | Scalloped | Trellis | Compass | Shared-Prong | Double-Prong | V-Prong | Flat-Prong | Bead | Illusion | Mabe | Open-Back | Closed-Back | null",

  "occasion": "Engagement | Wedding | Anniversary | Fashion | Everyday | Statement | null",

  "estimatedStoneCount": 1,

  "description": "A precise 2-3 sentence description of this jewelry piece covering its key visual features, style, and notable design elements."
}

Rules:
- For any field requiring multiple values, provide the data in an array format
- stoneShapes should be an array of values, or null
- component should be an array of values, or null
- estimatedStoneCount is a number (1, 2, 5, etc.)
- hasRhodium is boolean or null
- Return ONLY the JSON. No markdown, no explanation, no code fences.`;

// ─── Main Exports ──────────────────────────────────────────────────────────────

/**
 * Analyze a jewelry image using GPT-4o Mini and return structured tags.
 * Image is automatically resized + compressed before the API call.
 *
 * @param {string} imagePath - Local file path to the image
 * @returns {object} Structured jewelry tags
 */
export async function autoTagImage(fileBuffer, fileName) {
  // Step 1: Resize + compress (no full-res images sent to OpenAI)
  console.log('  [Vision] Resizing image...');
  const { base64, mediaType } = await prepareImageForAPI(fileBuffer, fileName);

  // Step 2: Send compressed image to GPT-4o Mini
  console.log(`  [Vision] Sending to ${config.openai.visionModel}...`);
  const response = await openai.chat.completions.create({
    model: config.openai.visionModel,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mediaType};base64,${base64}`,
              detail: 'low', // 'low' = always 1 tile (85 tokens flat) — perfect for 512px images
            },
          },
          {
            type: 'text',
            text: JEWELRY_ANALYSIS_PROMPT,
          },
        ],
      },
    ],
  });

  const raw = response.choices[0].message.content.trim();
  try {
    const jsonText = raw.replace(/```json\n?|```\n?/g, '').trim();
    const tags = JSON.parse(jsonText);
    console.log('  [Vision] Tags extracted successfully.');
    return tags;
  } catch (err) {
    console.warn('  [Vision] Failed to parse JSON — storing raw description only.');
    return { description: raw.slice(0, 500) };
  }
}

/**
 * Convert structured jewelry tags into a rich searchable text string.
 * The richer this text, the better semantic search works.
 * @param {object} tags
 * @returns {string}
 */
export function buildSearchableText(tags) {
  const parts = [];

  // Helper to safely add array/string values
  const addValue = (value, suffix = "") => {
    if (!value) return;

    if (Array.isArray(value)) {
      const cleaned = [...new Set(value.filter(Boolean))];
      if (cleaned.length) {
        parts.push(`${cleaned.join(" ")}${suffix}`);
      }
    } else {
      parts.push(`${value}${suffix}`);
    }
  };

  addValue(tags.category);
  addValue(tags.subCategory);

  if (tags.settingStyle) {
    parts.push(`${tags.settingStyle} setting`);
  }

  if (tags.centerStone) {
    parts.push(`${tags.centerStone} center stone`);
  }

  if (tags.sideStones?.length) {
    const unique = [...new Set(tags.sideStones.filter(Boolean))];
    parts.push(`${unique.join(" and ")} side stones`);
  }

  addValue(tags.stoneType);
  addValue(tags.stoneShapes, " stone shape");

  addValue(tags.metalColor);

  if (tags.prong) {
    parts.push(`${tags.prong} prong`);
  }

  if (tags.shank) {
    parts.push(`${tags.shank} shank`);
  }

  if (tags.diamondColor) {
    parts.push(`${tags.diamondColor} diamond`);
  }

  addValue(tags.gemstone);

  if (tags.cut) {
    parts.push(`${tags.cut} cut`);
  }

  addValue(tags.component);

  if (tags.hasRhodium === true) {
    parts.push("rhodium plated");
  }

  if (tags.occasion) {
    parts.push(`${tags.occasion} jewelry`);
  }

  if (
    tags.estimatedStoneCount !== null &&
    tags.estimatedStoneCount !== undefined
  ) {
    parts.push(`${tags.estimatedStoneCount} stones`);
  }

  if (tags.description) {
    parts.push(tags.description);
  }

  return parts.join(". ").replace(/\s+/g, " ").trim();
}