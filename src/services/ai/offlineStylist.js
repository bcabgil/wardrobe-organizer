/**
 * offlineStylist.js - 100% Offline Rule-Based Fashion Stylist Engine
 * Generates cohesive 2-3 outfit recommendations based on:
 * - Clean status (strictly excludes 'to_wash')
 * - Active Season (includes activeSeason + 'all-season')
 * - Temperature Suitability ('freezing', 'cold', 'mild', 'warm', 'all-temps')
 * - Multi-Layering Role ('base' tee/shirt + 'mid' jumper/sweater/cardigan + 'outer' coat in cold/winter)
 * - Occasion ('everyday', 'gym', 'dress-up')
 * - Anchor Garment pinning (guaranteed inclusion in 100% of outfits)
 */

const NEUTRAL_KEYWORDS = ['white', 'black', 'grey', 'gray', 'navy', 'beige', 'cream', 'camel', 'charcoal', 'khaki', 'denim', 'indigo', 'brown', 'tan', 'ivory'];

export function inferLayerRole(garment = {}) {
  if (garment.layerRole && ['base', 'mid', 'outer', 'single'].includes(garment.layerRole)) {
    return garment.layerRole;
  }
  const cat = String(garment.category || 'top').toLowerCase();
  if (cat === 'outerwear') return 'outer';
  if (cat !== 'top') return 'single';

  const text = `${garment.name || ''} ${garment.visualDescription || ''}`.toLowerCase();
  if (/jumper|sweater|cardigan|hoodie|pullover|knit|fleece|sweatshirt|vest|turtleneck|quarter-zip/i.test(text)) {
    return 'mid';
  }
  return 'base';
}

export function inferTempSuitability(garment = {}) {
  if (
    garment.tempSuitability &&
    ['freezing', 'cold', 'mild', 'warm', 'all-temps'].includes(garment.tempSuitability)
  ) {
    return garment.tempSuitability;
  }
  if (garment.season === 'all-season') return 'all-temps';
  if (garment.season === 'winter') return 'cold';
  if (garment.season === 'summer') return 'warm';
  return 'all-temps';
}

export function isGarmentTempCompatible(garment, targetTempBand, role) {
  const suit = inferTempSuitability(garment);
  if (suit === 'all-temps' || !targetTempBand) return true;

  // Base layers (t-shirts, shirts) can be worn under jumpers even in cold/freezing weather
  if (role === 'base' && (targetTempBand === 'cold' || targetTempBand === 'freezing')) {
    return true;
  }

  if (targetTempBand === 'warm') {
    // In hot weather, avoid freezing/cold garments
    return suit === 'warm' || suit === 'mild';
  }
  if (targetTempBand === 'freezing') {
    return suit === 'freezing' || suit === 'cold' || suit === 'mild';
  }
  if (targetTempBand === 'cold') {
    return suit === 'cold' || suit === 'freezing' || suit === 'mild';
  }
  // mild
  return suit !== 'freezing';
}

function getTargetTempBand(weatherData, activeSeason) {
  if (weatherData && typeof weatherData === 'object') {
    const tempMax = typeof weatherData.tempMax === 'number' ? weatherData.tempMax : null;
    const tempMin = typeof weatherData.tempMin === 'number' ? weatherData.tempMin : null;
    if ((tempMax !== null && tempMax <= 5) || (tempMin !== null && tempMin <= 0)) return 'freezing';
    if ((tempMax !== null && tempMax <= 16) || (tempMin !== null && tempMin <= 10)) return 'cold';
    if ((tempMax !== null && tempMax >= 25) || (tempMin !== null && tempMin >= 20)) return 'warm';
    return 'mild';
  }
  return activeSeason === 'winter' ? 'cold' : 'warm';
}

function hasNeutralTone(garment) {
  const text = `${garment.name || ''} ${garment.visualDescription || ''}`.toLowerCase();
  if (garment.colorGroup === 'whites') return true;
  return NEUTRAL_KEYWORDS.some((kw) => text.includes(kw));
}

function getFitSilhouette(garment) {
  const text = `${garment?.name || ''} ${garment?.visualDescription || ''}`.toLowerCase();
  if (/oversized|relaxed|boxy|chunky|slouchy|wide|loose/i.test(text)) return 'relaxed';
  if (/slim|tailored|fitted|skinny|structured|tapered|cropped/i.test(text)) return 'fitted';
  return 'regular';
}

function scorePairHarmony(itemA, itemB, occasion, targetTempBand) {
  let score = 50;
  if (!itemA || !itemB) return score;

  if (itemA.type === occasion) score += 20;
  if (itemB.type === occasion) score += 20;

  if (itemA.colorGroup !== itemB.colorGroup) {
    score += 15;
  } else if (hasNeutralTone(itemA) || hasNeutralTone(itemB)) {
    score += 12;
  }

  // Temperature match bonus
  const suitA = inferTempSuitability(itemA);
  const suitB = inferTempSuitability(itemB);
  if (suitA === targetTempBand) score += 12;
  if (suitB === targetTempBand) score += 12;

  // Fit & body proportion balance bonus (from Fit Video / visualDescription)
  const fitA = getFitSilhouette(itemA);
  const fitB = getFitSilhouette(itemB);
  if ((fitA === 'relaxed' && fitB === 'fitted') || (fitA === 'fitted' && fitB === 'relaxed')) {
    score += 10;
  }

  return score;
}

function evaluateLayeringNeeds(weatherData, activeSeason) {
  const tempBand = getTargetTempBand(weatherData, activeSeason);

  if (weatherData && typeof weatherData === 'object') {
    const tempMax = typeof weatherData.tempMax === 'number' ? weatherData.tempMax : null;
    const tempMin = typeof weatherData.tempMin === 'number' ? weatherData.tempMin : null;
    const rainProb = typeof weatherData.rainProb === 'number' ? weatherData.rainProb : 0;
    const cond = String(weatherData.condition || '').toLowerCase();

    if ((tempMax !== null && tempMax >= 25) || (tempMin !== null && tempMin >= 21) || /hot|heat|scorching/i.test(cond)) {
      return {
        tempBand: 'warm',
        needMidLayer: false,
        needOuterwear: false,
        forbidOuterwear: true,
        forbidMidLayer: true
      };
    }

    const isChillyOrCold =
      (tempMax !== null && tempMax <= 16) ||
      (tempMin !== null && tempMin <= 11) ||
      /cold|chilly|freezing|snow|frost/i.test(cond) ||
      activeSeason === 'winter';

    const isWetOrCold =
      isChillyOrCold ||
      rainProb >= 50 ||
      /rain|shower|storm|wind/i.test(cond);

    return {
      tempBand,
      needMidLayer: isChillyOrCold,
      needOuterwear: isWetOrCold,
      forbidOuterwear: false,
      forbidMidLayer: false
    };
  }

  if (activeSeason === 'winter') {
    return {
      tempBand: 'cold',
      needMidLayer: true,
      needOuterwear: true,
      forbidOuterwear: false,
      forbidMidLayer: false
    };
  }

  return {
    tempBand: 'warm',
    needMidLayer: false,
    needOuterwear: false,
    forbidOuterwear: false,
    forbidMidLayer: false
  };
}

function buildLayeringTip(weatherData, activeSeason, hasMidLayer, hasOuterwear, garmentsInOutfit) {
  const basePiece = garmentsInOutfit.find((g) => g.category === 'top' && inferLayerRole(g) === 'base');
  const midPiece = garmentsInOutfit.find((g) => g.category === 'top' && inferLayerRole(g) === 'mid');

  if (hasMidLayer && basePiece && midPiece) {
    const collarHint = `Layer your ${midPiece.name} over the ${basePiece.name} for warmth—you can remove the ${midPiece.name} indoors if it's warm.`;
    if (weatherData && (weatherData.rainProb >= 50 || typeof weatherData.tempMax === 'number')) {
      return `${collarHint} Tomorrow's range (${weatherData.tempMin ?? ''}°C–${weatherData.tempMax ?? ''}°C) makes multi-layering ideal.`;
    }
    return collarHint;
  }

  if (weatherData && typeof weatherData === 'object') {
    const rainProb = weatherData.rainProb || 0;
    const tempMax = weatherData.tempMax;
    if (rainProb >= 50) {
      return `Tomorrow has a ${rainProb}% chance of rain (${weatherData.condition || 'wet conditions'}). Keep your outer layer handy.`;
    }
    if (typeof tempMax === 'number' && tempMax <= 12) {
      return `Chilly temperatures ahead (up to ${tempMax}°C). Layer closely for warmth and insulation.`;
    }
    if (typeof tempMax === 'number' && tempMax >= 26) {
      return `Warm conditions (${tempMax}°C). Wear a breathable single base layer and skip jumpers or heavy jackets.`;
    }
  }
  if (hasOuterwear) {
    return `Drape or layer the outerwear piece over your base combination for effortless ${activeSeason} transitions.`;
  }
  return `Tuck or cuff the silhouette cleanly to highlight the contrast between your pieces.`;
}

export function buildCombinationKey(garmentIds = []) {
  return Array.from(new Set((garmentIds || []).filter(Boolean)))
    .sort()
    .join('|');
}

export function sortOutfitsByWearPreference(outfits = [], wearCounts = {}) {
  if (!Array.isArray(outfits)) return [];
  const counts = wearCounts && typeof wearCounts === 'object' ? wearCounts : {};
  return outfits
    .map((outfit, originalIndex) => {
      const key = outfit.combinationKey || buildCombinationKey(outfit.garmentIds || []);
      const wornCount =
        typeof counts[key] === 'number'
          ? counts[key]
          : typeof outfit.wornCount === 'number'
            ? outfit.wornCount
            : 0;
      return {
        ...outfit,
        combinationKey: key,
        wornCount,
        _origIdx: originalIndex
      };
    })
    .sort((a, b) => {
      if (b.wornCount !== a.wornCount) {
        return b.wornCount - a.wornCount;
      }
      return a._origIdx - b._origIdx;
    })
    .map(({ _origIdx, ...rest }) => rest);
}

/**
 * Generate 1-3 rule-based outfits synchronously (100% offline capable)
 * Supports multi-layering (Base Tee/Shirt + Mid Jumper/Sweater + Outer Coat), temperature suitability,
 * and user wear-frequency preference ordering.
 */
export function generateOfflineOutfits({
  garments = [],
  occasion = 'everyday',
  activeSeason = 'winter',
  anchorGarmentId = null,
  weatherData = null,
  wearCounts = {},
  includeOuterwear = true
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

  // 2. Evaluate weather & layering needs
  const layeringEval = evaluateLayeringNeeds(weatherData, activeSeason);
  const { tempBand, needMidLayer, forbidMidLayer } = layeringEval;
  const needOuterwear = includeOuterwear ? layeringEval.needOuterwear : false;
  const forbidOuterwear = includeOuterwear ? layeringEval.forbidOuterwear : true;

  // 3. Filter by Active Season (activeSeason + 'all-season') and Temperature Compatibility
  const inSeasonGarments = cleanGarments.filter((g) => {
    const seasonOk = !g.season || g.season === activeSeason || g.season === 'all-season';
    if (!seasonOk) return false;
    const role = inferLayerRole(g);
    return isGarmentTempCompatible(g, tempBand, role);
  });

  // Locate anchor piece if requested (must be clean)
  const anchorItem = anchorGarmentId
    ? cleanGarments.find((g) => g.id === anchorGarmentId) || null
    : null;

  const filterByCategory = (cat, strictOccasion = true) => {
    const exactMatches = inSeasonGarments.filter(
      (g) => g.category === cat && (!strictOccasion || g.type === occasion)
    );
    if (exactMatches.length > 0) return exactMatches;
    return inSeasonGarments.filter((g) => g.category === cat);
  };

  const allTops = filterByCategory('top', true);
  // Partition tops into base layers (t-shirts, shirts) and mid layers (jumpers, sweaters, hoodies, cardigans)
  const baseTops = allTops.filter((g) => inferLayerRole(g) === 'base');
  const midTops = allTops.filter((g) => inferLayerRole(g) === 'mid');

  const bottoms = filterByCategory('bottom', true);
  const onePieces = inSeasonGarments.filter(
    (g) => g.category === 'one-piece' && (g.type === occasion || occasion === 'dress-up')
  );
  const outerwearList = includeOuterwear ? filterByCategory('outerwear', false) : [];
  const shoesList = filterByCategory('shoes', true);
  const accessories = filterByCategory('accessory', false);

  const candidateCombinations = [];

  const addCombo = (items, baseScore, styleLabel) => {
    const uniqueItems = [];
    const seenIds = new Set();

    if (anchorItem) {
      uniqueItems.push(anchorItem);
      seenIds.add(anchorItem.id);
    }

    const anchorRole = anchorItem ? inferLayerRole(anchorItem) : null;

    for (const it of items) {
      if (!it || seenIds.has(it.id)) continue;
      if (forbidOuterwear && it.category === 'outerwear' && (!anchorItem || anchorItem.id !== it.id)) {
        continue;
      }
      if (forbidMidLayer && it.category === 'top' && inferLayerRole(it) === 'mid' && (!anchorItem || anchorItem.id !== it.id)) {
        continue;
      }

      // If anchorItem is a non-top category (e.g. bottom, shoes, outerwear, one-piece), don't add a second item of the same category
      if (
        anchorItem &&
        it.category === anchorItem.category &&
        ['bottom', 'one-piece', 'shoes', 'outerwear'].includes(it.category)
      ) {
        continue;
      }

      // For tops: allow 1 'base' top + 1 'mid' top in layered outfits, but never two 'base' tops or two 'mid' tops
      if (it.category === 'top') {
        const itRole = inferLayerRole(it);
        const alreadyHasSameRoleTop = uniqueItems.some(
          (u) => u.category === 'top' && inferLayerRole(u) === itRole
        );
        if (alreadyHasSameRoleTop) {
          // Exception: if needMidLayer is true and all tops had the same role, allow a second top only if no mid top exists
          if (!(needMidLayer && midTops.length === 0 && uniqueItems.filter((u) => u.category === 'top').length < 2)) {
            continue;
          }
        }
      }

      uniqueItems.push(it);
      seenIds.add(it.id);
    }

    if (uniqueItems.length < 2) return;

    const key = buildCombinationKey(uniqueItems.map((g) => g.id));
    if (candidateCombinations.some((c) => c.key === key)) return;

    const wornCount = wearCounts && typeof wearCounts[key] === 'number' ? wearCounts[key] : 0;

    candidateCombinations.push({
      key,
      items: uniqueItems,
      wornCount,
      score: baseScore + wornCount * 25,
      styleLabel
    });
  };

  // Strategy A: One-piece outfits
  const effectiveOnePieces =
    anchorItem && anchorItem.category === 'one-piece' ? [anchorItem] : onePieces;

  for (const dress of effectiveOnePieces) {
    const midLayer = !forbidMidLayer && needMidLayer && midTops.length > 0 ? midTops[0] : null;
    const shoe = shoesList[0] || null;
    const coat = !forbidOuterwear && needOuterwear && outerwearList.length > 0 ? outerwearList[0] : null;
    const acc = accessories[0] || null;
    const comboItems = [dress, midLayer, coat, shoe, acc].filter(Boolean);
    const score = 115 + (dress.type === occasion ? 35 : 0);
    addCombo(comboItems, score, 'Refined Silhouette');
  }

  // Strategy B: Top(s) + Bottom combinations (with automatic Base + Mid layering in winter/cold weather)
  const primaryTops =
    anchorItem && anchorItem.category === 'top'
      ? [anchorItem]
      : baseTops.length > 0
        ? baseTops
        : allTops;

  const candidateBottoms = anchorItem && anchorItem.category === 'bottom' ? [anchorItem] : bottoms;

  for (let tIdx = 0; tIdx < primaryTops.length; tIdx++) {
    const primaryTop = primaryTops[tIdx];
    const primaryRole = inferLayerRole(primaryTop);

    for (let bIdx = 0; bIdx < candidateBottoms.length; bIdx++) {
      const bottom = candidateBottoms[bIdx];
      let score = scorePairHarmony(primaryTop, bottom, occasion, tempBand);

      // Determine complimentary second top layer (e.g. Base Tee + Mid Jumper in winter/cold)
      let secondTopLayer = null;
      if (needMidLayer && !forbidMidLayer) {
        if (primaryRole === 'base' && midTops.length > 0) {
          secondTopLayer = midTops[(tIdx + bIdx) % midTops.length];
          score += 18;
        } else if (primaryRole === 'mid' && baseTops.length > 0) {
          secondTopLayer = baseTops[(tIdx + bIdx) % baseTops.length];
          score += 18;
        }
      }

      const shoe = shoesList.length > 0 ? shoesList[(tIdx + bIdx) % shoesList.length] : null;
      let coat = null;
      if (!forbidOuterwear && outerwearList.length > 0) {
        if (needOuterwear || tIdx === 0) {
          coat = outerwearList[(tIdx + bIdx) % outerwearList.length];
          if (needOuterwear) score += 15;
        }
      }

      const acc = accessories.length > 0 && tIdx % 2 === 0 ? accessories[0] : null;
      // Order base layer before mid layer
      const orderedTops =
        secondTopLayer && primaryRole === 'mid'
          ? [secondTopLayer, primaryTop]
          : [primaryTop, secondTopLayer].filter(Boolean);

      const items = [...orderedTops, bottom, coat, shoe, acc].filter(Boolean);
      const label =
        occasion === 'gym'
          ? 'Active Training Set'
          : occasion === 'dress-up'
            ? 'Elevated Evening Edit'
            : secondTopLayer || coat
              ? `Layered ${activeSeason.charAt(0).toUpperCase() + activeSeason.slice(1)} Look`
              : 'Smart Everyday Essentials';

      addCombo(items, score, label);
    }
  }

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
    const topItems = combo.items.filter((g) => g.category === 'top');
    const hasMidLayer = topItems.length >= 2 || topItems.some((g) => inferLayerRole(g) === 'mid');
    const title = titles[idx] || `${combo.styleLabel} #${idx + 1}`;

    const weatherClause =
      weatherData && weatherData.condition
        ? ` Tailored for tomorrow's forecast (${weatherData.condition}, ${weatherData.tempMin ?? ''}°C–${weatherData.tempMax ?? ''}°C).`
        : '';

    const anchorClause = anchorItem
      ? ` Built directly around your pinned ${anchorItem.name}.`
      : '';

    const layerClause =
      topItems.length >= 2
        ? ` Features smart thermal multi-layering (${topItems.map((t) => t.name).join(' under/over ')}) for ${tempBand} conditions.`
        : '';

    const explanation = `Combines ${names.join(' + ')} for a cohesive ${activeSeason} ${occasion} look with balanced color harmony and clean proportions.${layerClause}${anchorClause}${weatherClause}`;

    const layeringTips = buildLayeringTip(weatherData, activeSeason, hasMidLayer, hasCoat, combo.items);

    return {
      id: `offline_outfit_${idx + 1}_${Date.now()}`,
      title,
      garmentIds: combo.items.map((g) => g.id),
      combinationKey: combo.key,
      wornCount: combo.wornCount || 0,
      explanation,
      layeringTips,
      occasion,
      season: activeSeason,
      tempBand
    };
  });

  const sortedOutfits = sortOutfitsByWearPreference(formattedOutfits, wearCounts);

  return {
    engine: 'offline',
    outfits: sortedOutfits,
    message: `Generated ${sortedOutfits.length} outfit recommendation(s) using the offline stylist.`
  };
}

export default {
  inferLayerRole,
  inferTempSuitability,
  isGarmentTempCompatible,
  buildCombinationKey,
  sortOutfitsByWearPreference,
  generateOfflineOutfits
};
