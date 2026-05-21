/**
 * Vision Tagger — GPT-4o Mini Vision → structured jewelry tags
 *
 * Two modes:
 *   autoTagImage(buffer, name)                    → fresh tag from image
 *   autoTagImage(buffer, name, existing, prompt)  → targeted patch of existing tags
 */

import OpenAI from 'openai';
import { config } from './config.js';
import { prepareImageForAPI } from './imageProcessor.js';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

// ─── Schema prompt (used for fresh tagging only) ───────────────────────────
const JEWELRY_ANALYSIS_PROMPT = `You are an expert jewelry cataloger. Analyze this jewelry image carefully and extract structured tags.

Return ONLY a valid JSON object with these exact keys. Use null for anything not visible or not applicable.

{
  "category": "Ring | Bangle | Necklace | Pendant | Earring | Bracelet | Set | Nose Pin | Component | Cufflink | Tie Tac | Brooch | Anklet | null",
  "subCategory": "Fashion | Bridal | Engagement | Gemstone | Solitaire | Stud | Hoop | Drop | Dangle | Tennis | Eternity | Cluster | Infinity | null",
  "stoneType": ["White", "Color Stone", "Black Stones"],
  "stoneShapes": ["ROUND","PEAR","OVAL","MARQUISE","PRINCESS","CUSHION","EMERALD","RADIANT","HEART","BAGUETTE","ASCHER","HEXAGON","KITE","Trillion","HALF MOON","ELONGATED PEAR","ELONGATED MARQUISE","ELONGATED OVAL","ELONGATED EMERALD","ELONGATED RADIANT","ELONGTED CUSHION","ELONGTED BAGUETTE","ELONGTED STEP BAGUETTE","FANCY CUT DIAMOND","PEAR ROSE CUT","OVAL ROSE CUT","ROSECUT ROUND","ROUND RoseCut","ROUND CABOCHON","SQUARE EMERALD","SQUARE RADIANT","STRAIGHT BAGUETTE","TAPPER BAGUETTE","TRAP BAGUETTE","BULLET","MOON-STONE","Triangle","TRAPEZOIDS","Shield","MIX","ROUGH","null"],
  "metalColor": "Yellow Gold | White Gold | Rose Gold | Two Tone | Tri Color | Platinum | Sterling Silver | null",
  "prong": "4 Prong | 6 Prong | V Prong | Bezel | Half Bezel | Channel | Pave | Bar Set | Burnish | Tension | Shared Prong | Double Prong | Flat Prong | Claw Prong | Bead Set | Common Prong | Fishtail | Scalloped | Micro-Pave | French Set | null",
  "shank": "Plain | Split Shank | Twisted | Knife Edge | Milgrain | Comfort Fit | Wide Band | Tapered | Bypass | Infinity | Cathedral | Euro-Shank | Square | Interlocking | Flat | Half-Round | Criss-Cross | Open | Fluted | Floral | null",
  "diamondColor": "White | Yellow | Champagne | Black | Pink | Blue | Green | Orange | Brown | Purple | Red | Gray | Salt and Pepper | Cognac | Canary | Chameleon | null",
  "gemstone": "Ruby | Sapphire | Emerald | Topaz | Amethyst | Citrine | Garnet | Peridot | Tanzanite | Morganite | Aquamarine | Opal | Diamond | Pearl | Turquoise | Spinel | Tourmaline | Moonstone | Alexandrite | null",
  "cut": "Brilliant | Rose Cut | Single Cut | Old Mine | Old European | Special | Mixed | Princess | Step | Emerald | Asscher | Cushion | Radiant | Oval | Pear | Marquise | Heart | Trillion | Baguette | Tapered Baguette | Cabochon | null",
  "component": ["CHAIN","ROPE","ROLO","CABLE","BOX CHAIN","SNAKE","LOBSTER LOCK","SPRING LOCK","POST","PUSH","LEVER BACK","OMEGA","null"],
  "hasRhodium": true,
  "settingStyle": "Solitaire | Halo | Double Halo | Pave | Side Stone | Three-Stone | Bezel | Tension | Channel | Bar | Flush | Cluster | Cathedral | Basket | Vintage | Milgrain | Filigree | Bypass | Infinity | Eternity | Half-Eternity | Hidden Halo | Scalloped | Trellis | Shared-Prong | Illusion | null",
  "occasion": "Engagement | Wedding | Anniversary | Fashion | Everyday | Statement | null",
  "estimatedStoneCount": 1,
  "description": "A precise 2-3 sentence description of this jewelry piece covering its key visual features, style, and notable design elements."
}

Rules:
- stoneShapes and component must be arrays, or null
- estimatedStoneCount is a number
- hasRhodium is boolean or null
- Return ONLY the JSON. No markdown. No explanation. No code fences.`;

// ─── Refinement system prompt ──────────────────────────────────────────────
// Deliberately short — model only patches, never re-generates from scratch
const REFINEMENT_SYSTEM_PROMPT = `You are a jewelry tag editor. You will receive:
1. An image of a jewelry piece
2. Its current JSON tags
3. A user correction instruction

Your job: apply ONLY the correction to the JSON. Do NOT change any field that the correction does not explicitly mention. Do NOT re-analyze the image for fields already tagged correctly.

Return ONLY the corrected JSON object. Same structure. No markdown. No explanation.`;

// ─── Main Export ───────────────────────────────────────────────────────────
/**
 * @param {Buffer}      fileBuffer
 * @param {string}      fileName
 * @param {object|null} existingTags  — current metadata (for refinement mode)
 * @param {string|null} userPrompt    — correction instruction (for refinement mode)
 */
export async function autoTagImage(fileBuffer, fileName, existingTags = null, userPrompt = null) {
  console.log('  [Vision] Resizing image...');
  const { base64, mediaType } = await prepareImageForAPI(fileBuffer, fileName);

  const isRefinement = existingTags !== null && userPrompt !== null;
  console.log(`  [Vision] Mode: ${isRefinement ? 'refinement' : 'fresh tag'}`);

  let messages;

  if (isRefinement) {
    // ── Refinement: only patch what the user asked to change ────────────────
    // Strip null/undefined from existing tags to keep the message compact
    const cleanExisting = Object.fromEntries(
      Object.entries(existingTags).filter(([, v]) => v !== null && v !== undefined)
    );

    messages = [
      { role: 'system', content: REFINEMENT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mediaType};base64,${base64}`, detail: 'low' },
          },
          {
            type: 'text',
            text: [
              'Current tags:',
              JSON.stringify(cleanExisting, null, 2),
              '',
              'User correction:',
              userPrompt.trim(),
              '',
              'Return the full corrected JSON object.',
            ].join('\n'),
          },
        ],
      },
    ];
  } else {
    // ── Fresh tag: full analysis ────────────────────────────────────────────
    messages = [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mediaType};base64,${base64}`, detail: 'low' },
          },
          { type: 'text', text: JEWELRY_ANALYSIS_PROMPT },
        ],
      },
    ];
  }

  const response = await openai.chat.completions.create({
    model:      config.openai.visionModel,
    max_tokens: 1024,
    messages,
  });

  const raw = response.choices[0].message.content.trim();
  try {
    const jsonText = raw.replace(/```json\n?|```\n?/g, '').trim();
    const tags = JSON.parse(jsonText);
    console.log('  [Vision] Tags extracted successfully.');

    // In refinement mode, merge result back onto existing so no field is lost
    if (isRefinement) {
      return { ...existingTags, ...tags };
    }
    return tags;
  } catch (err) {
    console.warn('  [Vision] Failed to parse JSON — returning existing tags with description update.');
    if (isRefinement) return existingTags;
    return { description: raw.slice(0, 500) };
  }
}

// ─── Searchable text builder ───────────────────────────────────────────────
export function buildSearchableText(tags) {
  const parts = [];

  const addValue = (value, suffix = '') => {
    if (!value) return;
    if (Array.isArray(value)) {
      const cleaned = [...new Set(value.filter(Boolean))];
      if (cleaned.length) parts.push(`${cleaned.join(' ')}${suffix}`);
    } else {
      parts.push(`${value}${suffix}`);
    }
  };

  addValue(tags.category);
  addValue(tags.subCategory);
  if (tags.settingStyle)  parts.push(`${tags.settingStyle} setting`);
  if (tags.centerStone)   parts.push(`${tags.centerStone} center stone`);
  addValue(tags.stoneType);
  addValue(tags.stoneShapes, ' stone shape');
  addValue(tags.metalColor);
  if (tags.prong)         parts.push(`${tags.prong} prong`);
  if (tags.shank)         parts.push(`${tags.shank} shank`);
  if (tags.diamondColor)  parts.push(`${tags.diamondColor} diamond`);
  addValue(tags.gemstone);
  if (tags.cut)           parts.push(`${tags.cut} cut`);
  addValue(tags.component);
  if (tags.hasRhodium === true) parts.push('rhodium plated');
  if (tags.occasion)      parts.push(`${tags.occasion} jewelry`);
  if (tags.description)   parts.push(tags.description);

  return parts.join('. ');
}
