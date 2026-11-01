/**
 * geminiService.js - Google Gemini 2.5 Flash Multimodal Vision & AI Fashion Stylist Service
 * Provides:
 * - AUTO_TAG_SCHEMA & analyzeGarmentPhoto(imageBlob, apiKey)
 * - suggestTomorrowOutfits({ garments, occasion, activeSeason, anchorGarmentId, weatherNote, weatherData, apiKey })
 * - Automatic resilience fallback to offlineStylist on missing API key or HTTP/network errors.
 */

import { optimizeImageForGemini } from './imageOptimizer.js';
import { generateOfflineOutfits } from './offlineStylist.js';

export const GEMINI_MODEL = 'gemini-2.5-flash';
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const AUTO_TAG_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: {
      type: 'STRING',
      description: 'Concise, descriptive title of the garment (e.g., "Navy Cable-Knit Crewneck")'
    },
    category: {
      type: 'STRING',
      enum: ['top', 'bottom', 'outerwear', 'one-piece', 'shoes', 'accessory'],
      description: 'Wardrobe slot category'
    },
    season: {
      type: 'STRING',
      enum: ['winter', 'summer', 'all-season'],
      description: 'Best season for wearing this garment'
    },
    colorGroup: {
      type: 'STRING',
      enum: ['whites', 'coloured'],
      description: 'Laundry sorting color group: whites (pure white/ivory/cream) vs coloured'
    },
    delicate: {
      type: 'BOOLEAN',
      description: 'True if fabric appears delicate (wool, silk, cashmere, lace, knit, linen, tailored)'
    },
    type: {
      type: 'STRING',
      enum: ['everyday', 'gym', 'dress-up'],
      description: 'Primary occasion usage'
    },
    visualDescription: {
      type: 'STRING',
      description: 'Detailed visual description of exact colors, fabric texture, cut, and styling vibe'
    }
  },
  required: ['name', 'category', 'season', 'colorGroup', 'delicate', 'type', 'visualDescription']
};

export const OUTFIT_SUGGESTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    outfits: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          garmentIds: {
            type: 'ARRAY',
            items: { type: 'STRING' }
          },
          explanation: { type: 'STRING' },
          layeringTips: { type: 'STRING' }
        },
        required: ['title', 'garmentIds', 'explanation', 'layeringTips']
      }
    }
  },
  required: ['outfits']
};

/**
 * Clean markdown code fences (```json ... ```) from LLM text output and parse JSON
 * @param {string|Object} rawOutput
 * @returns {Object}
 */
export function cleanJsonOutput(rawOutput) {
  if (!rawOutput) {
    throw new Error('Empty LLM response');
  }
  if (typeof rawOutput === 'object') {
    return rawOutput;
  }

  let text = String(rawOutput).trim();
  // Remove leading ```json or ``` and trailing ```
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // If surrounded by extra prose, extract first JSON object
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(text);
}

/**
 * Analyze a garment photo with Gemini 2.5 Flash Vision to auto-populate attributes
 * Falls back to a local heuristic analyzer if no API key is set.
 * @param {Blob|File} imageBlob
 * @param {string} [apiKey='']
 * @returns {Promise<Object>}
 */
export async function analyzeGarmentPhoto(imageBlob, apiKey = '') {
  if (!imageBlob) {
    throw new Error('analyzeGarmentPhoto: Image Blob is required');
  }

  const trimmedKey = String(apiKey || '').trim();
  if (!trimmedKey) {
    return fallbackHeuristicPhotoAnalysis(imageBlob);
  }

  try {
    const optimized = await optimizeImageForGemini(imageBlob);
    const endpoint = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(trimmedKey)}`;

    const prompt = [
      'You are an expert fashion archivist and laundry care specialist.',
      'Analyze this garment image and return a JSON object matching the schema:',
      '- name: short stylish title (e.g. "Charcoal Merino Sweater", "White Cotton Oxford")',
      '- category: one of "top", "bottom", "outerwear", "one-piece", "shoes", "accessory"',
      '- season: one of "winter", "summer", "all-season"',
      '- colorGroup: "whites" if predominantly white/cream/ivory for laundry sorting, otherwise "coloured"',
      '- delicate: true if knitwear, wool, silk, linen, cashmere, sheer, or tailored; false if durable cotton/denim/synthetics',
      '- type: one of "everyday", "gym", "dress-up"',
      '- visualDescription: concise description of colors, pattern, silhouette, and fabric for an AI outfit stylist.'
    ].join('\n');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: optimized.mimeType,
                  data: optimized.base64
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: AUTO_TAG_SCHEMA
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = cleanJsonOutput(rawText);

    return {
      name: parsed.name || 'Styled Garment',
      category: ['top', 'bottom', 'outerwear', 'one-piece', 'shoes', 'accessory'].includes(parsed.category)
        ? parsed.category
        : 'top',
      season: ['winter', 'summer', 'all-season'].includes(parsed.season)
        ? parsed.season
        : 'all-season',
      colorGroup: parsed.colorGroup === 'whites' ? 'whites' : 'coloured',
      delicate: Boolean(parsed.delicate),
      type: ['everyday', 'gym', 'dress-up'].includes(parsed.type) ? parsed.type : 'everyday',
      visualDescription: parsed.visualDescription || '',
      engine: 'gemini'
    };
  } catch (err) {
    return fallbackHeuristicPhotoAnalysis(imageBlob, err.message);
  }
}

async function fallbackHeuristicPhotoAnalysis(imageBlob, reason = '') {
  // Inspect filename or canvas brightness if available
  const fileName = (imageBlob && imageBlob.name) ? imageBlob.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') : '';
  const lower = fileName.toLowerCase();

  const isWhite = /white|ivory|cream|ecru/i.test(lower);
  const category = /pant|jean|trouser|short|skirt|chino/i.test(lower)
    ? 'bottom'
    : /coat|jacket|blazer|parka|cardigan|puffer/i.test(lower)
      ? 'outerwear'
      : /dress|jumpsuit|romper/i.test(lower)
        ? 'one-piece'
        : /shoe|boot|sneaker|loafer|heel/i.test(lower)
          ? 'shoes'
          : 'top';

  const season = /winter|wool|cashmere|knit|coat|sweater|puffer|boot/i.test(lower)
    ? 'winter'
    : /summer|linen|short|tank|sandal/i.test(lower)
      ? 'summer'
      : 'all-season';

  const delicate = /wool|silk|cashmere|delicate|lace|linen|knit/i.test(lower);
  const type = /gym|sport|run|athletic|workout/i.test(lower)
    ? 'gym'
    : /dress|suit|formal|silk|blazer|heel/i.test(lower)
      ? 'dress-up'
      : 'everyday';

  return {
    name: fileName ? fileName.charAt(0).toUpperCase() + fileName.slice(1) : 'New Wardrobe Piece',
    category,
    season,
    colorGroup: isWhite ? 'whites' : 'coloured',
    delicate,
    type,
    visualDescription: `Auto-detected ${season} ${category} (${isWhite ? 'light/white tones' : 'coloured palette'}).`,
    engine: 'offline',
    fallbackReason: reason || 'No Gemini API key configured'
  };
}

/**
 * Generate 2-3 curated outfit suggestions for tomorrow using Gemini 2.5 Flash
 * Automatically falls back to offlineStylist on missing API key or API/network failure.
 * @param {Object} params
 * @returns {Promise<{ outfits: Array<Object>, engine: 'gemini'|'offline', message?: string }>}
 */
export async function suggestTomorrowOutfits({
  garments = [],
  occasion = 'everyday',
  activeSeason = 'winter',
  anchorGarmentId = null,
  weatherNote = '',
  weatherData = null,
  apiKey = ''
} = {}) {
  const trimmedKey = String(apiKey || '').trim();

  // Pre-filter candidate pool to clean + in-season garments
  const cleanInSeason = (garments || []).filter(
    (g) =>
      g &&
      g.status === 'clean' &&
      (!g.season || g.season === activeSeason || g.season === 'all-season')
  );

  // If no API key or not enough items, run the deterministic offline stylist immediately
  if (!trimmedKey || cleanInSeason.length < 2) {
    return generateOfflineOutfits({
      garments,
      occasion,
      activeSeason,
      anchorGarmentId,
      weatherData
    });
  }

  try {
    const inventorySummary = cleanInSeason.map((g) => ({
      id: g.id,
      name: g.name,
      category: g.category,
      season: g.season,
      colorGroup: g.colorGroup,
      type: g.type,
      visualDescription: g.visualDescription || ''
    }));

    const anchorItem = anchorGarmentId
      ? cleanInSeason.find((g) => g.id === anchorGarmentId)
      : null;

    const weatherContextStr = weatherData
      ? `Tomorrow forecast: ${weatherData.condition || ''}, Min ${weatherData.tempMin}°C / Max ${weatherData.tempMax}°C, Rain chance: ${weatherData.rainProb || 0}%. ${weatherNote || ''}`
      : weatherNote || 'Standard seasonal weather';

    const prompt = [
      'You are a personal luxury fashion stylist.',
      `Create 2 to 3 complete, stylish outfit combinations for tomorrow from the user's CLEAN wardrobe inventory below.`,
      `Target Occasion: "${occasion}"`,
      `Active Season: "${activeSeason}"`,
      `Weather Context: "${weatherContextStr}"`,
      anchorItem
        ? `CRITICAL REQUIREMENT: Every single suggested outfit MUST include the anchor garment ID "${anchorItem.id}" (${anchorItem.name}).`
        : 'Combine tops + bottoms (or one-piece) + optional outerwear/shoes/accessories that harmonize in color and silhouette.',
      'Only use garment IDs that exist in the provided inventory JSON.',
      `Available Clean Inventory JSON:\n${JSON.stringify(inventorySummary, null, 2)}`
    ].join('\n\n');

    const endpoint = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(trimmedKey)}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
          responseMimeType: 'application/json',
          responseSchema: OUTFIT_SUGGESTION_SCHEMA
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = cleanJsonOutput(rawText);

    if (!parsed || !Array.isArray(parsed.outfits) || parsed.outfits.length === 0) {
      throw new Error('Gemini returned empty outfits array');
    }

    const validIds = new Set(cleanInSeason.map((g) => g.id));
    const sanitizedOutfits = parsed.outfits
      .map((o, idx) => {
        const filteredIds = (o.garmentIds || []).filter((id) => validIds.has(id));
        if (anchorItem && !filteredIds.includes(anchorItem.id)) {
          filteredIds.unshift(anchorItem.id);
        }
        return {
          id: `gemini_outfit_${idx + 1}_${Date.now()}`,
          title: o.title || `Curated Look #${idx + 1}`,
          garmentIds: filteredIds,
          explanation: o.explanation || 'Selected for color harmony and seasonal fit.',
          layeringTips: o.layeringTips || 'Wear with clean proportions.',
          occasion,
          season: activeSeason
        };
      })
      .filter((o) => o.garmentIds.length >= 1);

    if (sanitizedOutfits.length === 0) {
      throw new Error('No valid garment IDs in Gemini outfit response');
    }

    return {
      engine: 'gemini',
      outfits: sanitizedOutfits,
      message: `Styled ${sanitizedOutfits.length} look(s) with Google Gemini 2.5 Flash.`
    };
  } catch (err) {
    // Graceful fallback to 100% offline rule-based stylist
    const fallbackResult = generateOfflineOutfits({
      garments,
      occasion,
      activeSeason,
      anchorGarmentId,
      weatherData
    });
    return {
      ...fallbackResult,
      fallbackReason: err.message
    };
  }
}

export async function testGeminiApiKey(apiKey = '') {
  const trimmedKey = String(apiKey || '').trim();
  if (!trimmedKey) {
    throw new Error('Please paste a Gemini API key first.');
  }
  const endpoint = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(trimmedKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Reply with {"status":"ok"}' }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json'
      }
    })
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${errText.slice(0, 120) || response.statusText}`);
  }
  return { ok: true, model: GEMINI_MODEL };
}

export default {
  AUTO_TAG_SCHEMA,
  OUTFIT_SUGGESTION_SCHEMA,
  cleanJsonOutput,
  analyzeGarmentPhoto,
  suggestTomorrowOutfits,
  testGeminiApiKey
};
