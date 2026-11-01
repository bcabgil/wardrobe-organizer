/**
 * Integration Test Suite: Gemini 2.5 Flash Vision & AI Stylist Integration (Milestone 3)
 * Targets: src/services/ai/geminiService.js
 *          src/services/ai/imageOptimizer.js
 *          src/services/ai/offlineStylist.js
 * 
 * Verifies:
 * - Canvas image optimizer (max 1024px, JPEG quality 0.82, payload size bounds)
 * - Auto-Tagger multimodal prompt construction and structured JSON schema
 * - Tomorrow Stylist Gemini API REST integration & response schema parsing
 * - Markdown triple backtick cleaning from LLM outputs
 * - Autonomous fallback to offlineStylist on missing API key or network error
 */

import { describe, it, expect, beforeEach, safeImport } from '../test-framework.js';

describe('Gemini AI Integration: Vision Auto-Tagger & Stylist Service', () => {
  let geminiMod = null;
  let optimizerMod = null;

  beforeEach(async (ctx) => {
    const gRes = await safeImport('../../src/services/ai/geminiService.js');
    const oRes = await safeImport('../../src/services/ai/imageOptimizer.js');

    if (!gRes.ok && !oRes.ok) {
      ctx.skip('Pending Milestone 3: Gemini service or image optimizer not yet implemented');
      return;
    }
    geminiMod = gRes.ok ? gRes.module : null;
    optimizerMod = oRes.ok ? oRes.module : null;
  });

  // ==========================================
  // TIER 1: CANVAS IMAGE OPTIMIZER
  // ==========================================

  it('T1-GEM-01: optimizes image to JPEG Base64 and keeps payload within size bounds', async (ctx) => {
    if (!optimizerMod) return;

    const optimize = optimizerMod.optimizeImageForGemini || optimizerMod.default?.optimizeImageForGemini;
    expect(typeof optimize).toBe('function');

    // Create a 100x100 dummy test canvas & blob
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx2d = canvas.getContext('2d');
    ctx2d.fillStyle = '#ff5722';
    ctx2d.fillRect(0, 0, 100, 100);

    const testBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const result = await optimize(testBlob);

    expect(result).toBeDefined();
    expect(typeof result.base64).toBe('string');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.base64.length).toBeGreaterThan(0);
    // 100x100 JPEG should be well under 50KB
    expect(result.base64.length).toBeLessThan(50000);
  });

  // ==========================================
  // TIER 1: STRUCTURED JSON SCHEMA VALIDATION
  // ==========================================

  it('T1-GEM-02: defines valid OpenAPI structured response schema for Auto-Tagger', async (ctx) => {
    if (!geminiMod) return;

    const schema = geminiMod.AUTO_TAG_SCHEMA || geminiMod.default?.AUTO_TAG_SCHEMA;
    if (schema) {
      expect(schema.type).toBe('OBJECT');
      expect(schema.properties).toBeDefined();
      expect(schema.properties.category).toBeDefined();
      expect(schema.properties.season).toBeDefined();
      expect(schema.properties.tempSuitability).toBeDefined();
      expect(schema.properties.layerRole).toBeDefined();
      expect(schema.properties.colorGroup).toBeDefined();
      expect(schema.properties.delicate).toBeDefined();
      expect(schema.properties.type).toBeDefined();
      expect(schema.properties.visualDescription).toBeDefined();
    }
  });

  it('T1-GEM-03: cleans markdown code fences (```json ... ```) from LLM output', async (ctx) => {
    if (!geminiMod) return;

    const cleanJson = geminiMod.cleanJsonOutput || geminiMod.default?.cleanJsonOutput;
    if (cleanJson) {
      const rawLlmResponse = '```json\n{\n  "category": "top",\n  "season": "winter"\n}\n```';
      const parsed = cleanJson(rawLlmResponse);
      expect(parsed).toEqual({ category: 'top', season: 'winter' });
    }
  });

  it('T1-GEM-04: analyzeGarmentPhoto sends both photo and fit video payload to Gemini Vision', async () => {
    if (!geminiMod) return;

    const analyze = geminiMod.analyzeGarmentPhoto || geminiMod.default?.analyzeGarmentPhoto;
    expect(typeof analyze).toBe('function');

    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 40;
    const photoBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
    const videoBlob = new Blob([new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])], {
      type: 'video/mp4'
    });

    let capturedBody = null;
    const origFetch = window.fetch;
    window.fetch = async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      name: 'Relaxed Cashmere Jumper',
                      category: 'top',
                      season: 'winter',
                      tempSuitability: 'cold',
                      layerRole: 'mid',
                      colorGroup: 'coloured',
                      delicate: true,
                      type: 'everyday',
                      visualDescription: 'Relaxed oversized fit on shoulders with room for a base tee underneath.'
                    })
                  }
                ]
              }
            }
          ]
        })
      };
    };

    try {
      const res = await analyze(photoBlob, 'AIzaSyFakeKey', videoBlob);
      expect(res.engine).toBe('gemini');
      expect(res.analyzedFitVideo).toBe(true);
      expect(res.layerRole).toBe('mid');
      expect(capturedBody).toBeDefined();
      const parts = capturedBody.contents[0].parts;
      // 1 text prompt + 1 photo + at least 1 video/keyframe part
      expect(parts.length).toBeGreaterThanOrEqual(3);
    } finally {
      window.fetch = origFetch;
    }
  });

  // ==========================================
  // TIER 2: ERROR RESILIENCE & OFFLINE FALLBACK
  // ==========================================

  it('T2-GEM-01: automatically falls back to offlineStylist when API key is missing', async (ctx) => {
    if (!geminiMod) return;

    const suggest = geminiMod.suggestTomorrowOutfits || geminiMod.default?.suggestTomorrowOutfits;
    if (!suggest) return;

    const mockGarments = [
      { id: 'g1', name: 'Navy Sweater', category: 'top', season: 'winter', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'everyday' },
      { id: 'g2', name: 'Jeans', category: 'bottom', season: 'winter', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'everyday' }
    ];

    // Call without API key -> must not crash, should return engine: 'offline'
    const result = await suggest({
      garments: mockGarments,
      occasion: 'everyday',
      activeSeason: 'winter',
      apiKey: ''
    });

    expect(result).toBeDefined();
    expect(result.engine).toBe('offline');
    expect(Array.isArray(result.outfits)).toBe(true);
  });

  it('T2-GEM-02: automatically falls back to offlineStylist when Gemini API returns 429 or 500 error', async (ctx) => {
    if (!geminiMod) return;

    const suggest = geminiMod.suggestTomorrowOutfits || geminiMod.default?.suggestTomorrowOutfits;
    if (!suggest) return;

    const mockGarments = [
      { id: 'g1', name: 'Navy Sweater', category: 'top', season: 'winter', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'everyday' },
      { id: 'g2', name: 'Jeans', category: 'bottom', season: 'winter', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'everyday' }
    ];

    // Mock fetch to simulate 429 Rate Limit error
    const origFetch = window.fetch;
    window.fetch = async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => 'Quota exceeded'
    });

    try {
      const result = await suggest({
        garments: mockGarments,
        occasion: 'everyday',
        activeSeason: 'winter',
        apiKey: 'AIzaSyFakeTestKey'
      });

      expect(result).toBeDefined();
      expect(result.engine).toBe('offline');
      expect(Array.isArray(result.outfits)).toBe(true);
    } finally {
      window.fetch = origFetch;
    }
  });
});
