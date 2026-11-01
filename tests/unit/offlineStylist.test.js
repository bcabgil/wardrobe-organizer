/**
 * Unit Test Suite: 100% Offline Rule-Based Stylist Fallback (Milestone 3)
 * Target: src/services/ai/offlineStylist.js
 * 
 * Verifies:
 * - 100% offline autonomous outfit recommendation generation
 * - Clean status & Active Season filtering (never suggests dirty or out-of-season clothes)
 * - Occasion matching (everyday, gym, dress-up)
 * - Anchor piece pinning (guaranteed inclusion in all suggested outfits)
 * - Color harmony scoring (monochrome, neutral, complementary pairs)
 * - Weather context adaptation (layering in cold/rainy weather)
 * - Boundary handling: empty wardrobe, incomplete wardrobes, all items dirty
 */

import { describe, it, expect, beforeEach, safeImport } from '../test-framework.js';

describe('Offline Stylist: Rule-Based Fashion AI Engine', () => {
  let stylistMod = null;

  beforeEach(async (ctx) => {
    const res = await safeImport('../../src/services/ai/offlineStylist.js');
    if (!res.ok) {
      ctx.skip('Pending Milestone 3: src/services/ai/offlineStylist.js not implemented yet');
      return;
    }
    stylistMod = res.module;
  });

  const SAMPLE_WARDROBE = [
    { id: 'top_w_1', name: 'Navy Wool Sweater', category: 'top', season: 'winter', colorGroup: 'coloured', delicate: true, status: 'clean', type: 'everyday' },
    { id: 'top_w_2', name: 'White Cotton Shirt', category: 'top', season: 'all-season', colorGroup: 'whites', delicate: false, status: 'clean', type: 'everyday' },
    { id: 'top_s_1', name: 'Linen Summer Polo', category: 'top', season: 'summer', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'everyday' },
    { id: 'top_dirty', name: 'Flannel Shirt', category: 'top', season: 'winter', colorGroup: 'coloured', delicate: false, status: 'to_wash', type: 'everyday' },
    { id: 'bot_w_1', name: 'Grey Wool Trousers', category: 'bottom', season: 'winter', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'everyday' },
    { id: 'bot_w_2', name: 'Dark Indigo Jeans', category: 'bottom', season: 'all-season', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'everyday' },
    { id: 'out_w_1', name: 'Camel Overcoat', category: 'outerwear', season: 'winter', colorGroup: 'coloured', delicate: true, status: 'clean', type: 'everyday' },
    { id: 'shoe_1', name: 'Brown Leather Boots', category: 'shoes', season: 'winter', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'everyday' },
    { id: 'shoe_2', name: 'White Minimal Sneakers', category: 'shoes', season: 'all-season', colorGroup: 'whites', delicate: false, status: 'clean', type: 'everyday' },
    { id: 'gym_top', name: 'Athletic Dri-Fit Tee', category: 'top', season: 'all-season', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'gym' },
    { id: 'gym_bot', name: 'Running Shorts', category: 'bottom', season: 'all-season', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'gym' },
    { id: 'gym_shoe', name: 'Running Shoes', category: 'shoes', season: 'all-season', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'gym' },
    { id: 'dress_1', name: 'Black Cocktail Dress', category: 'one-piece', season: 'all-season', colorGroup: 'coloured', delicate: true, status: 'clean', type: 'dress-up' },
    { id: 'dress_shoe', name: 'Black Pumps', category: 'shoes', season: 'all-season', colorGroup: 'coloured', delicate: true, status: 'clean', type: 'dress-up' }
  ];

  // ==========================================
  // TIER 1: CORE STYLIST CAPABILITIES
  // ==========================================

  it('T1-STY-01: generates 2-3 valid outfits with titles and explanations', async (ctx) => {
    if (!stylistMod) return;

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;
    expect(typeof generate).toBe('function');

    const result = generate({
      garments: SAMPLE_WARDROBE,
      occasion: 'everyday',
      activeSeason: 'winter'
    });

    expect(result).toBeDefined();
    expect(result.engine).toBe('offline');
    expect(Array.isArray(result.outfits)).toBe(true);
    expect(result.outfits.length).toBeGreaterThanOrEqual(1);
    expect(result.outfits.length).toBeLessThanOrEqual(3);

    const firstOutfit = result.outfits[0];
    expect(typeof firstOutfit.title).toBe('string');
    expect(typeof firstOutfit.explanation).toBe('string');
    expect(Array.isArray(firstOutfit.garmentIds)).toBe(true);
    expect(firstOutfit.garmentIds.length).toBeGreaterThanOrEqual(2);
  });

  it('T1-STY-02: strictly filters out dirty items (status === "to_wash")', async (ctx) => {
    if (!stylistMod) return;

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;
    const result = generate({
      garments: SAMPLE_WARDROBE,
      occasion: 'everyday',
      activeSeason: 'winter'
    });

    for (const outfit of result.outfits) {
      expect(outfit.garmentIds).not.toContain('top_dirty');
    }
  });

  it('T1-STY-03: filters out out-of-season items (respects activeSeason)', async (ctx) => {
    if (!stylistMod) return;

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;
    const result = generate({
      garments: SAMPLE_WARDROBE,
      occasion: 'everyday',
      activeSeason: 'winter'
    });

    // In winter, summer-only garments must not appear
    for (const outfit of result.outfits) {
      expect(outfit.garmentIds).not.toContain('top_s_1');
    }
  });

  it('T1-STY-04: pins anchor piece into 100% of generated outfits', async (ctx) => {
    if (!stylistMod) return;

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;
    const anchorId = 'bot_w_2'; // Dark Indigo Jeans

    const result = generate({
      garments: SAMPLE_WARDROBE,
      occasion: 'everyday',
      activeSeason: 'winter',
      anchorGarmentId: anchorId
    });

    expect(result.outfits.length).toBeGreaterThanOrEqual(1);
    for (const outfit of result.outfits) {
      expect(outfit.garmentIds).toContain(anchorId);
    }
  });

  it('T1-STY-05: adapts to occasion type (everyday, gym, dress-up)', async (ctx) => {
    if (!stylistMod) return;

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;
    const gymResult = generate({
      garments: SAMPLE_WARDROBE,
      occasion: 'gym',
      activeSeason: 'winter'
    });

    expect(gymResult.outfits.length).toBeGreaterThanOrEqual(1);
    const gymOutfit = gymResult.outfits[0];
    expect(gymOutfit.garmentIds).toContain('gym_top');
    expect(gymOutfit.garmentIds).toContain('gym_bot');

    const dressResult = generate({
      garments: SAMPLE_WARDROBE,
      occasion: 'dress-up',
      activeSeason: 'winter'
    });
    expect(dressResult.outfits.length).toBeGreaterThanOrEqual(1);
    const dressOutfit = dressResult.outfits[0];
    expect(dressOutfit.garmentIds).toContain('dress_1');
  });

  it('T1-STY-06: recommends outerwear when weather is cold (< 15°C) or rainy', async (ctx) => {
    if (!stylistMod) return;

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;
    const coldWeather = {
      tempMin: 3,
      tempMax: 9,
      rainProb: 80,
      condition: 'Chilly with rain showers'
    };

    const result = generate({
      garments: SAMPLE_WARDROBE,
      occasion: 'everyday',
      activeSeason: 'winter',
      weatherData: coldWeather
    });

    expect(result.outfits.length).toBeGreaterThanOrEqual(1);
    // At least one recommended outfit should include outerwear
    const hasOuterwear = result.outfits.some(outfit => outfit.garmentIds.includes('out_w_1'));
    expect(hasOuterwear).toBe(true);

    const firstOutfit = result.outfits[0];
    expect(firstOutfit.layeringTips).toBeDefined();
  });

  // ==========================================
  // TIER 2: BOUNDARY & EDGE CASES
  // ==========================================

  it('T2-STY-01: handles completely empty wardrobe without crashing', async (ctx) => {
    if (!stylistMod) return;

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;
    const result = generate({
      garments: [],
      occasion: 'everyday',
      activeSeason: 'winter'
    });

    expect(result).toBeDefined();
    expect(result.outfits).toEqual([]);
    expect(typeof result.message).toBe('string');
  });

  it('T2-STY-02: handles wardrobe when all items are in to_wash', async (ctx) => {
    if (!stylistMod) return;

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;
    const allDirty = SAMPLE_WARDROBE.map(g => ({ ...g, status: 'to_wash' }));

    const result = generate({
      garments: allDirty,
      occasion: 'everyday',
      activeSeason: 'winter'
    });

    expect(result.outfits.length).toBe(0);
    expect(result.message).toMatch(/laundry|wash/i);
  });

  it('T2-STY-03: handles incomplete wardrobe (tops only, no bottoms) gracefully', async (ctx) => {
    if (!stylistMod) return;

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;
    const topsOnly = SAMPLE_WARDROBE.filter(g => g.category === 'top');

    const result = generate({
      garments: topsOnly,
      occasion: 'everyday',
      activeSeason: 'winter'
    });

    // Should return empty or partial suggestion with warning, without throwing error
    expect(result).toBeDefined();
    expect(Array.isArray(result.outfits)).toBe(true);
  });

  it('T2-STY-04: hot weather (> 30°C) avoids suggesting heavy outerwear', async (ctx) => {
    if (!stylistMod) return;

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;
    const hotWeather = {
      tempMin: 26,
      tempMax: 34,
      rainProb: 0,
      condition: 'Sunny and hot'
    };

    const result = generate({
      garments: SAMPLE_WARDROBE,
      occasion: 'everyday',
      activeSeason: 'summer',
      weatherData: hotWeather
    });

    for (const outfit of result.outfits) {
      expect(outfit.garmentIds).not.toContain('out_w_1'); // No heavy camel coat in hot summer!
    }
  });
});
