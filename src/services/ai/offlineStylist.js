/**
 * offlineStylist.js - 100% Offline Rule-Based Fashion Stylist Engine
 * Generates cohesive 2-3 outfit recommendations based on:
 * - Clean status (strictly excludes 'to_wash')
 * - Active Season (includes activeSeason + 'all-season')
 * - Occasion ('everyday', 'gym', 'dress-up')
 * - Anchor Garment pinning (guaranteed inclusion in 100% of outfits)
 * - Weather adaptation (adds outerwear for cold/rain, avoids outerwear in heat)
 */

const NEUTRAL_KEYWORDS = ['white', 'black', 'grey', 'gray', 'navy', 'beige', 'cream', 'camel', 'charcoal', 'khaki', 'denim', 'indigo', 'brown', 'tan', 'ivory'];

function hasNeutralTone(garment) {
  const text = `${garment.name || ''} ${garment.visualDescription || ''}`.toLowerCase();
  if (garment.colorGroup === 'whites') return true;
  return NEUTRAL_KEYWORDS.some((kw) => text.includes(kw));
}

function scorePairHarmony(itemA, itemB, occasion) {
  let score = 50;
  if (!itemA || !itemB) return score;

  // Occasion match bonus
  if (itemA.type === occasion) score += 20;
  if (itemB.type === occasion) score += 20;

  // Color harmony: whites + coloured or neutral + statement
  if (itemA.colorGroup !== itemB.colorGroup) {
    score += 15;
  } else if (hasNeutralTone(itemA) || hasNeutralTone(itemB)) {
    score += 12;
  }

  // Texture / delicate balance
  if (itemA.delicate && itemB.delicate && occasion === 'dress-up') {
    score += 10;
  }

  return score;
}

function shouldIncludeOuterwear(weatherData, activeSeason) {
  if (weatherData && typeof weatherData === 'object') {
    const tempMax = typeof weatherData.tempMax === 'number' ? weatherData.tempMax : null;
    const tempMin = typeof weatherData.tempMin === 'number' ? weatherData.tempMin : null;
    const rainProb = typeof weatherData.rainProb === 'number' ? weatherData.rainProb : 0;
    const cond = String(weatherData.condition || '').toLowerCase();

    // Hot weather (> 25°C max or > 22°C min) -> strictly avoid heavy outerwear
    if ((tempMax !== null && tempMax >= 26) || (tempMin !== null && tempMin >= 22) || /hot|heat|scorching/i.test(cond)) {
      return { needOuterwear: false, forbidOuterwear: true };
    }

    // Cold (< 15°C) or rainy (>= 50%)
    if (
      (tempMax !== null && tempMax <= 15) ||
      (tempMin !== null && tempMin <= 10) ||
      rainProb >= 50 ||
      /rain|shower|storm|snow|cold|chilly|freezing|wind/i.test(cond)
    ) {
      return { needOuterwear: true, forbidOuterwear: false };
    }
  }

  // Default by season
  if (activeSeason === 'winter') {
    return { needOuterwear: true, forbidOuterwear: false };
  }
  return { needOuterwear: false, forbidOuterwear: false };
}

function buildLayeringTip(weatherData, activeSeason, hasOuterwear, garmentsInOutfit) {
  const names = garmentsInOutfit.map((g) => g.name).join(', ');
  if (weatherData && typeof weatherData === 'object') {
    const rainProb = weatherData.rainProb || 0;
    const tempMax = weatherData.tempMax;
    if (rainProb >= 50) {
      return `Tomorrow has a ${rainProb}% chance of rain (${weatherData.condition || 'wet conditions'}). Keep your outer layer handy and protect delicate fabrics over ${names}.`;
    }
    if (typeof tempMax === 'number' && tempMax <= 12) {
      return `Chilly temperatures ahead (up to ${tempMax}°C). Layer closely for warmth and structure.`;
    }
    if (typeof tempMax === 'number' && tempMax >= 26) {
      return `Warm conditions (${tempMax}°C). Wear breathable single layers and skip heavy jackets.`;
    }
  }
  if (hasOuterwear) {
    return `Drape or layer the outerwear piece over your base combination for effortless ${activeSeason} transitions.`;
  }
  return `Tuck or cuff the silhouette cleanly to highlight the contrast between your pieces.`;
}

/**
 * Generate 1-3 rule-based outfits synchronously (100% offline capable)
 * @param {Object} params
 * @param {Array<Object>} params.garments
 * @param {string} [params.occasion='everyday']
 * @param {string} [params.activeSeason='winter']
 * @param {string|null} [params.anchorGarmentId=null]
 * @param {Object|null} [params.weatherData=null]
 * @returns {{ engine: 'offline', outfits: Array<Object>, message?: string }}
 */
export function generateOfflineOutfits({
  garments = [],
  occasion = 'everyday',
  activeSeason = 'winter',
  anchorGarmentId = null,
  weatherData = null
} = {}) {
  if (!Array.isArray(garments) || garments.length === 0) {
    return {
      engine: 'offline',
      outfits: [],
      message: 'Your wardrobe is currently empty. Add garments in the + tab to get outfit recommendations!'
    };
  }

  // 1. Strictly filter to CLEAN garments only
  const cleanGarments = garments.filter((g) => g && g.status === 'clean');
  if (cleanGarments.length === 0) {
    return {
      engine: 'offline',
      outfits: [],
      message: 'All garments are currently marked "To Wash". Complete a laundry load to unlock clean outfit suggestions!'
    };
  }

  // 2. Filter by Active Season (activeSeason + 'all-season')
  const inSeasonGarments = cleanGarments.filter(
    (g) => !g.season || g.season === activeSeason || g.season === 'all-season'
  );

  // Locate anchor piece if requested (must be clean)
  const anchorItem = anchorGarmentId
    ? cleanGarments.find((g) => g.id === anchorGarmentId) || null
    : null;

  // Candidate pool: prefer matching occasion first, fallback to broader in-season pool for missing categories
  const filterByCategory = (cat, strictOccasion = true) => {
    const exactMatches = inSeasonGarments.filter(
      (g) => g.category === cat && (!strictOccasion || g.type === occasion)
    );
    if (exactMatches.length > 0) return exactMatches;
    return inSeasonGarments.filter((g) => g.category === cat);
  };

  const tops = filterByCategory('top', true);
  const bottoms = filterByCategory('bottom', true);
  const onePieces = inSeasonGarments.filter(
    (g) => g.category === 'one-piece' && (g.type === occasion || occasion === 'dress-up')
  );
  const outerwearList = filterByCategory('outerwear', false);
  const shoesList = filterByCategory('shoes', true);
  const accessories = filterByCategory('accessory', false);

  const { needOuterwear, forbidOuterwear } = shouldIncludeOuterwear(weatherData, activeSeason);

  const candidateCombinations = [];

  // Helper to finalize a combination of garment objects
  const addCombo = (items, baseScore, styleLabel) => {
    const uniqueItems = [];
    const seenIds = new Set();

    // If anchorItem exists, ensure it's included and replaces its own category slot (unless accessory)
    if (anchorItem) {
      uniqueItems.push(anchorItem);
      seenIds.add(anchorItem.id);
    }

    for (const it of items) {
      if (!it || seenIds.has(it.id)) continue;
      if (forbidOuterwear && it.category === 'outerwear' && (!anchorItem || anchorItem.id !== it.id)) {
        continue;
      }
      // Avoid two tops or two bottoms if anchorItem already occupies that category
      if (
        anchorItem &&
        it.category === anchorItem.category &&
        ['top', 'bottom', 'one-piece', 'shoes', 'outerwear'].includes(it.category)
      ) {
        continue;
      }
      uniqueItems.push(it);
      seenIds.add(it.id);
    }

    // Must have at least 2 garments to form an outfit
    if (uniqueItems.length < 2) return;

    const key = uniqueItems
      .map((g) => g.id)
      .sort()
      .join('|');
    if (candidateCombinations.some((c) => c.key === key)) return;

    candidateCombinations.push({
      key,
      items: uniqueItems,
      score: baseScore,
      styleLabel
    });
  };

  // Strategy A: One-piece outfits (especially for dress-up or if anchor is one-piece)
  const effectiveOnePieces =
    anchorItem && anchorItem.category === 'one-piece' ? [anchorItem] : onePieces;

  for (const dress of effectiveOnePieces) {
    const shoe = shoesList[0] || null;
    const coat = !forbidOuterwear && needOuterwear && outerwearList.length > 0 ? outerwearList[0] : null;
    const acc = accessories[0] || null;
    const comboItems = [dress, shoe, coat, acc].filter(Boolean);
    const score = 85 + (dress.type === occasion ? 20 : 0);
    addCombo(comboItems, score, 'Refined Silhouette');
  }

  // Strategy B: Top + Bottom combinations
  const candidateTops = anchorItem && anchorItem.category === 'top' ? [anchorItem] : tops;
  const candidateBottoms = anchorItem && anchorItem.category === 'bottom' ? [anchorItem] : bottoms;

  for (let tIdx = 0; tIdx < candidateTops.length; tIdx++) {
    const top = candidateTops[tIdx];
    for (let bIdx = 0; bIdx < candidateBottoms.length; bIdx++) {
      const bottom = candidateBottoms[bIdx];
      let score = scorePairHarmony(top, bottom, occasion);

      const shoe = shoesList.length > 0 ? shoesList[(tIdx + bIdx) % shoesList.length] : null;
      let coat = null;
      if (!forbidOuterwear && outerwearList.length > 0) {
        if (needOuterwear || tIdx === 0) {
          coat = outerwearList[(tIdx + bIdx) % outerwearList.length];
          if (needOuterwear) score += 15;
        }
      }

      const acc = accessories.length > 0 && tIdx % 2 === 0 ? accessories[0] : null;
      const items = [top, bottom, coat, shoe, acc].filter(Boolean);
      const label =
        occasion === 'gym'
          ? 'Active Training Set'
          : occasion === 'dress-up'
            ? 'Elevated Evening Edit'
            : coat
              ? `Layered ${activeSeason.charAt(0).toUpperCase() + activeSeason.slice(1)} Look`
              : 'Smart Everyday Essentials';

      addCombo(items, score, label);
    }
  }

  // Sort by highest harmony score and pick up to 3 diverse outfits
  candidateCombinations.sort((a, b) => b.score - a.score);
  const topOutfits = candidateCombinations.slice(0, 3);

  if (topOutfits.length === 0) {
    return {
      engine: 'offline',
      outfits: [],
      message: `Not enough matching clean ${activeSeason} garments (e.g. both a top and a bottom) to build a complete ${occasion} outfit.`
    };
  }

  const TITLES_BY_OCCASION = {
    everyday: ['Effortless Daily Edit', 'Modern Casual Balance', 'Polished Street Layering'],
    gym: ['High-Output Training Kit', 'Breathable Athletic Flow', 'Dynamic Workout Pair'],
    'dress-up': ['Tailored Evening Statement', 'Refined Formal Ensemble', 'Sleek Occasion Look']
  };

  const titles = TITLES_BY_OCCASION[occasion] || TITLES_BY_OCCASION.everyday;

  const formattedOutfits = topOutfits.map((combo, idx) => {
    const names = combo.items.map((g) => g.name);
    const hasCoat = combo.items.some((g) => g.category === 'outerwear');
    const title = titles[idx] || `${combo.styleLabel} #${idx + 1}`;

    const weatherClause =
      weatherData && weatherData.condition
        ? ` Tailored for tomorrow's forecast (${weatherData.condition}, ${weatherData.tempMin ?? ''}°C–${weatherData.tempMax ?? ''}°C).`
        : '';

    const anchorClause = anchorItem
      ? ` Built directly around your pinned ${anchorItem.name}.`
      : '';

    const explanation = `Combines ${names.join(' + ')} for a cohesive ${activeSeason} ${occasion} look with balanced color harmony and clean proportions.${anchorClause}${weatherClause}`;

    const layeringTips = buildLayeringTip(weatherData, activeSeason, hasCoat, combo.items);

    return {
      id: `offline_outfit_${idx + 1}_${Date.now()}`,
      title,
      garmentIds: combo.items.map((g) => g.id),
      explanation,
      layeringTips,
      occasion,
      season: activeSeason
    };
  });

  return {
    engine: 'offline',
    outfits: formattedOutfits,
    message: `Generated ${formattedOutfits.length} outfit recommendation(s) using the offline stylist.`
  };
}

export default {
  generateOfflineOutfits
};
