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
    expect(result.outfits.length).toBeLessThanOrEqual(10);

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

  it('T1-STY-05: adapts to occasion type (everyday, gym, dress-up) and keeps wardrobes strictly independent', async (ctx) => {
    if (!stylistMod) return;

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;
    const byId = Object.fromEntries(SAMPLE_WARDROBE.map((g) => [g.id, g]));

    const everydayResult = generate({
      garments: SAMPLE_WARDROBE,
      occasion: 'everyday',
      activeSeason: 'winter'
    });
    expect(everydayResult.outfits.length).toBeGreaterThanOrEqual(1);
    for (const outfit of everydayResult.outfits) {
      for (const id of outfit.garmentIds) {
        expect(byId[id].type).toBe('everyday');
      }
    }

    const gymResult = generate({
      garments: SAMPLE_WARDROBE,
      occasion: 'gym',
      activeSeason: 'winter'
    });

    expect(gymResult.outfits.length).toBeGreaterThanOrEqual(1);
    const gymOutfit = gymResult.outfits[0];
    expect(gymOutfit.garmentIds).toContain('gym_top');
    expect(gymOutfit.garmentIds).toContain('gym_bot');
    for (const outfit of gymResult.outfits) {
      for (const id of outfit.garmentIds) {
        expect(byId[id].type).toBe('gym');
      }
    }

    const dressResult = generate({
      garments: SAMPLE_WARDROBE,
      occasion: 'dress-up',
      activeSeason: 'winter'
    });
    expect(dressResult.outfits.length).toBeGreaterThanOrEqual(1);
    const dressOutfit = dressResult.outfits[0];
    expect(dressOutfit.garmentIds).toContain('dress_1');
    for (const outfit of dressResult.outfits) {
      for (const id of outfit.garmentIds) {
        expect(byId[id].type).toBe('dress-up');
      }
    }
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

  it('T1-STY-07: combines multi-layer tops (base t-shirt/shirt + mid jumper/sweater) in winter/cold weather', async (ctx) => {
    if (!stylistMod) return;

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;
    const coldWeather = {
      tempMin: 2,
      tempMax: 8,
      rainProb: 20,
      condition: 'Cold winter day'
    };

    const result = generate({
      garments: SAMPLE_WARDROBE,
      occasion: 'everyday',
      activeSeason: 'winter',
      weatherData: coldWeather
    });

    expect(result.outfits.length).toBeGreaterThanOrEqual(1);
    const firstOutfit = result.outfits[0];

    // Should include BOTH the base layer shirt ('top_w_2') AND the mid-layer wool sweater ('top_w_1')
    expect(firstOutfit.garmentIds).toContain('top_w_2');
    expect(firstOutfit.garmentIds).toContain('top_w_1');
  });

  it('T1-STY-08: filters and prioritizes garments according to tempSuitability metadata', async (ctx) => {
    if (!stylistMod) return;

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;
    const tempTaggedWardrobe = [
      { id: 'base_tee', name: 'Cotton Base Tee', category: 'top', season: 'all-season', layerRole: 'base', tempSuitability: 'all-temps', colorGroup: 'whites', delicate: false, status: 'clean', type: 'everyday' },
      { id: 'heavy_jumper', name: 'Alpine Chunky Jumper', category: 'top', season: 'all-season', layerRole: 'mid', tempSuitability: 'freezing', colorGroup: 'coloured', delicate: true, status: 'clean', type: 'everyday' },
      { id: 'tank_warm', name: 'Thin Beach Tank', category: 'top', season: 'all-season', layerRole: 'single', tempSuitability: 'warm', colorGroup: 'whites', delicate: false, status: 'clean', type: 'everyday' },
      { id: 'jeans_all', name: 'Straight Jeans', category: 'bottom', season: 'all-season', layerRole: 'single', tempSuitability: 'all-temps', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'everyday' }
    ];

    // In freezing weather (-2°C to 3°C), should include base_tee + heavy_jumper and exclude warm-only tank_warm
    const freezingRes = generate({
      garments: tempTaggedWardrobe,
      occasion: 'everyday',
      activeSeason: 'winter',
      weatherData: { tempMin: -2, tempMax: 3, rainProb: 10, condition: 'Freezing' }
    });

    expect(freezingRes.outfits.length).toBeGreaterThanOrEqual(1);
    expect(freezingRes.outfits[0].garmentIds).toContain('base_tee');
    expect(freezingRes.outfits[0].garmentIds).toContain('heavy_jumper');
    expect(freezingRes.outfits[0].garmentIds).not.toContain('tank_warm');

    // In hot weather (26°C to 33°C), should exclude heavy_jumper (tempSuitability: 'freezing')
    const hotRes = generate({
      garments: tempTaggedWardrobe,
      occasion: 'everyday',
      activeSeason: 'summer',
      weatherData: { tempMin: 26, tempMax: 33, rainProb: 0, condition: 'Hot and sunny' }
    });

    expect(hotRes.outfits.length).toBeGreaterThanOrEqual(1);
    for (const outfit of hotRes.outfits) {
      expect(outfit.garmentIds).not.toContain('heavy_jumper');
    }
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

  it('T1-STY-08: orders suggested outfits in descending order of wornCount preference', async () => {
    if (!stylistMod) return;

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;
    const buildKey = stylistMod.buildCombinationKey || stylistMod.default?.buildCombinationKey;

    // First generate baseline outfits with 0 wears
    const baseline = generate({
      garments: SAMPLE_WARDROBE,
      occasion: 'everyday',
      activeSeason: 'winter'
    });
    expect(baseline.outfits.length).toBeGreaterThanOrEqual(2);

    // Give the 2nd combination a wornCount of 5 and the 1st combination a wornCount of 1
    const firstKey = buildKey(baseline.outfits[0].garmentIds);
    const secondKey = buildKey(baseline.outfits[1].garmentIds);
    const wearCounts = {
      [firstKey]: 1,
      [secondKey]: 5
    };

    const reordered = generate({
      garments: SAMPLE_WARDROBE,
      occasion: 'everyday',
      activeSeason: 'winter',
      wearCounts
    });

    expect(reordered.outfits[0].combinationKey).toBe(secondKey);
    expect(reordered.outfits[0].wornCount).toBe(5);
    expect(reordered.outfits[0].wornCount).toBeGreaterThanOrEqual(reordered.outfits[1].wornCount);
  });

  it('T1-STY-09: omits jacket/outerwear when includeOuterwear is false (default in Tomorrow Stylist)', async () => {
    if (!stylistMod) return;

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;
    const coldWeather = {
      tempMin: 2,
      tempMax: 8,
      rainProb: 70,
      condition: 'Cold and rainy'
    };

    const resWithoutJacket = generate({
      garments: SAMPLE_WARDROBE,
      occasion: 'everyday',
      activeSeason: 'winter',
      weatherData: coldWeather,
      includeOuterwear: false
    });

    expect(resWithoutJacket.outfits.length).toBeGreaterThanOrEqual(1);
    for (const outfit of resWithoutJacket.outfits) {
      expect(outfit.garmentIds).not.toContain('out_w_1');
    }
  });

  it('T1-STY-10: layers gym outfits as sports bra + sports T-shirt + bottom trousers and supports up to 10 combinations', async () => {
    if (!stylistMod) return;

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;
    const gymWardrobe = [
      { id: 'bra_1', name: 'Black Sports Bra', category: 'top', season: 'summer', tempSuitability: 'warm', colorGroup: 'coloured', status: 'clean', type: 'gym' },
      { id: 'bra_2', name: 'Teal Support Sports Bra', category: 'top', season: 'summer', tempSuitability: 'warm', colorGroup: 'coloured', status: 'clean', type: 'gym' },
      { id: 'tee_1', name: 'White Breathable Sports T-Shirt', category: 'top', season: 'summer', tempSuitability: 'warm', colorGroup: 'whites', status: 'clean', type: 'gym' },
      { id: 'tee_2', name: 'Grey Mesh Gym Tee', category: 'top', season: 'all-season', colorGroup: 'coloured', status: 'clean', type: 'gym' },
      { id: 'trou_1', name: 'Black Training Trousers', category: 'bottom', season: 'winter', colorGroup: 'coloured', status: 'clean', type: 'gym' },
      { id: 'trou_2', name: 'Navy Gym Leggings', category: 'bottom', season: 'all-season', colorGroup: 'coloured', status: 'clean', type: 'gym' }
    ];

    const res = generate({
      garments: gymWardrobe,
      occasion: 'gym',
      activeSeason: 'winter',
      includeOuterwear: false
    });

    // 2 sports bras x 2 sports t-shirts x 2 bottom trousers = 8 combinations (<= 10 cap)
    expect(res.outfits.length).toBe(8);
    for (const outfit of res.outfits) {
      expect(outfit.garmentIds.length).toBe(3);
      const hasBra = outfit.garmentIds.includes('bra_1') || outfit.garmentIds.includes('bra_2');
      const hasTee = outfit.garmentIds.includes('tee_1') || outfit.garmentIds.includes('tee_2');
      const hasTrousers = outfit.garmentIds.includes('trou_1') || outfit.garmentIds.includes('trou_2');
      expect(hasBra).toBe(true);
      expect(hasTee).toBe(true);
      expect(hasTrousers).toBe(true);
    }
  });

  it('T1-STY-11: supports multi-select tempSuitability arrays on garments across multiple temperature bands', async () => {
    if (!stylistMod) return;

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;
    const isCompatible = stylistMod.isGarmentTempCompatible || stylistMod.default?.isGarmentTempCompatible;

    const multiTempJumper = {
      id: 'multi_jumper',
      name: 'Cotton-Merino Jumper',
      category: 'top',
      layerRole: 'mid',
      season: 'all-season',
      tempSuitability: ['cold', 'mild'],
      colorGroup: 'coloured',
      status: 'clean',
      type: 'everyday'
    };

    expect(isCompatible(multiTempJumper, 'cold')).toBe(true);
    expect(isCompatible(multiTempJumper, 'mild')).toBe(true);
    expect(isCompatible(multiTempJumper, 'warm')).toBe(false);

    const wardrobe = [
      multiTempJumper,
      { id: 'base_1', name: 'White Tee', category: 'top', layerRole: 'base', season: 'all-season', tempSuitability: ['cold', 'mild', 'warm'], colorGroup: 'whites', status: 'clean', type: 'everyday' },
      { id: 'bot_1', name: 'Blue Jeans', category: 'bottom', layerRole: 'single', season: 'all-season', tempSuitability: ['freezing', 'cold', 'mild'], colorGroup: 'coloured', status: 'clean', type: 'everyday' }
    ];

    const coldRes = generate({
      garments: wardrobe,
      occasion: 'everyday',
      activeSeason: 'winter',
      weatherData: { tempMin: 7, tempMax: 11, rainProb: 0, condition: 'Chilly' }
    });

    expect(coldRes.outfits.length).toBeGreaterThanOrEqual(1);
    expect(coldRes.outfits[0].garmentIds).toContain('multi_jumper');
  });
});
