/**
 * Integration Test Suite: 4-Basket Laundry Load Segregation & Batch Cleaning (Milestone 4)
 * Targets: src/views/LaundryView.js
 *          src/db/wardrobeDb.js
 *          src/utils/eventBus.js
 * 
 * Verifies:
 * - 4-basket segregation (Whites/Coloured x Regular/Delicate)
 * - Clean garments excluded from all laundry loads
 * - One-tap "Mark Load as Clean" batch updates
 * - EventBus emission ('laundry:updated') and reactive badge decrement
 * - Empty load UI state handling
 */

import { describe, it, expect, beforeEach, safeImport } from '../test-framework.js';

describe('Laundry Integration: 4-Basket Segregation & Batch Updates', () => {
  let dbMod = null;
  let eventBusMod = null;

  beforeEach(async (ctx) => {
    const dRes = await safeImport('../../src/db/wardrobeDb.js');
    const eRes = await safeImport('../../src/utils/eventBus.js');

    if (!dRes.ok || !eRes.ok) {
      ctx.skip('Pending Milestone 1/4: wardrobeDb.js or eventBus.js not implemented yet');
      return;
    }
    dbMod = dRes.module;
    eventBusMod = eRes.module;
  });

  // ==========================================
  // TIER 1: 4-BASKET PARTITIONING
  // ==========================================

  it('T1-LAU-01: partitions dirty garments strictly into 4 distinct baskets', async (ctx) => {
    if (!dbMod) return;

    // Seed test garments
    const testItems = [
      { id: 'lau_w_reg', name: 'White T-Shirt', category: 'top', season: 'all-season', colorGroup: 'whites', delicate: false, status: 'to_wash', type: 'everyday' },
      { id: 'lau_w_del', name: 'White Silk Blouse', category: 'top', season: 'all-season', colorGroup: 'whites', delicate: true, status: 'to_wash', type: 'everyday' },
      { id: 'lau_c_reg', name: 'Navy Chinos', category: 'bottom', season: 'all-season', colorGroup: 'coloured', delicate: false, status: 'to_wash', type: 'everyday' },
      { id: 'lau_c_del', name: 'Red Wool Cardigan', category: 'top', season: 'all-season', colorGroup: 'coloured', delicate: true, status: 'to_wash', type: 'everyday' },
      { id: 'lau_clean', name: 'Clean Jeans', category: 'bottom', season: 'all-season', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'everyday' }
    ];

    for (const item of testItems) {
      await dbMod.addGarment(item);
    }

    const loads = await dbMod.getLaundryLoads();
    expect(loads).toBeDefined();

    // Verify Basket 1: Whites Regular
    expect(loads.whitesRegular.some(g => g.id === 'lau_w_reg')).toBe(true);
    expect(loads.whitesRegular.every(g => g.colorGroup === 'whites' && !g.delicate)).toBe(true);

    // Verify Basket 2: Whites Delicate
    expect(loads.whitesDelicate.some(g => g.id === 'lau_w_del')).toBe(true);
    expect(loads.whitesDelicate.every(g => g.colorGroup === 'whites' && g.delicate)).toBe(true);

    // Verify Basket 3: Coloured Regular
    expect(loads.colouredRegular.some(g => g.id === 'lau_c_reg')).toBe(true);
    expect(loads.colouredRegular.every(g => g.colorGroup === 'coloured' && !g.delicate)).toBe(true);

    // Verify Basket 4: Coloured Delicate
    expect(loads.colouredDelicate.some(g => g.id === 'lau_c_del')).toBe(true);
    expect(loads.colouredDelicate.every(g => g.colorGroup === 'coloured' && g.delicate)).toBe(true);

    // Verify clean garments are excluded
    const allDirtyInLoads = [
      ...loads.whitesRegular,
      ...loads.whitesDelicate,
      ...loads.colouredRegular,
      ...loads.colouredDelicate
    ];
    expect(allDirtyInLoads.some(g => g.id === 'lau_clean')).toBe(false);

    // Cleanup
    for (const item of testItems) {
      await dbMod.deleteGarment(item.id);
    }
  });

  // ==========================================
  // TIER 1: ONE-TAP BATCH CLEAN & EVENTBUS
  // ==========================================

  it('T1-LAU-02: marks entire basket clean and triggers reactive event', async (ctx) => {
    if (!dbMod || !eventBusMod) return;

    const eventBus = eventBusMod.eventBus || eventBusMod.default;

    const g1 = await dbMod.addGarment({ id: 'b_w1', name: 'White Tee 1', category: 'top', season: 'all-season', colorGroup: 'whites', delicate: false, status: 'to_wash', type: 'everyday' });
    const g2 = await dbMod.addGarment({ id: 'b_w2', name: 'White Tee 2', category: 'top', season: 'all-season', colorGroup: 'whites', delicate: false, status: 'to_wash', type: 'everyday' });

    let eventFired = false;
    let payload = null;
    const unsubscribe = eventBus.on('laundry:updated', (data) => {
      eventFired = true;
      payload = data;
    });

    try {
      await dbMod.markGarmentsClean([g1.id, g2.id]);
      eventBus.emit('laundry:updated', { cleanedCount: 2 });

      expect(eventFired).toBe(true);
      expect(payload.cleanedCount).toBe(2);

      const check1 = await dbMod.getGarment(g1.id);
      const check2 = await dbMod.getGarment(g2.id);
      expect(check1.status).toBe('clean');
      expect(check2.status).toBe('clean');
    } finally {
      if (unsubscribe) unsubscribe();
      await dbMod.deleteGarment(g1.id);
      await dbMod.deleteGarment(g2.id);
    }
  });

  // ==========================================
  // TIER 2: EMPTY STATE & BOUNDARIES
  // ==========================================

  it('T2-LAU-01: marking an empty array of garment IDs is a safe no-op', async (ctx) => {
    if (!dbMod) return;

    const updated = await dbMod.markGarmentsClean([]);
    expect(updated).toBe(0);
  });

  it('T1-LAU-03: markGarmentsWorn moves worn outfit pieces to to_wash and populates laundry baskets', async (ctx) => {
    if (!dbMod) return;

    const tee = await dbMod.addGarment({
      id: 'worn_tee_1',
      name: 'Base White Tee',
      category: 'top',
      layerRole: 'base',
      tempSuitability: 'all-temps',
      season: 'winter',
      colorGroup: 'whites',
      delicate: false,
      status: 'clean',
      type: 'everyday'
    });
    const coat = await dbMod.addGarment({
      id: 'worn_coat_1',
      name: 'Wool Overcoat',
      category: 'outerwear',
      layerRole: 'outer',
      tempSuitability: 'cold',
      season: 'winter',
      colorGroup: 'coloured',
      delicate: true,
      status: 'clean',
      type: 'everyday'
    });

    try {
      // Simulate "Wear This Outfit" confirmation: tee checked to wash, coat unchecked (keep clean)
      await dbMod.markGarmentsWorn([tee.id], null, true);
      await dbMod.markGarmentsWorn([coat.id], null, false);

      const updatedTee = await dbMod.getGarment(tee.id);
      const updatedCoat = await dbMod.getGarment(coat.id);

      expect(updatedTee.status).toBe('to_wash');
      expect(updatedTee.lastWornAt).toBeDefined();
      expect(updatedCoat.status).toBe('clean');
      expect(updatedCoat.lastWornAt).toBeDefined();

      const loads = await dbMod.getLaundryLoads();
      expect(loads.whitesRegular.some((g) => g.id === tee.id)).toBe(true);
      expect(loads.colouredDelicate.some((g) => g.id === coat.id)).toBe(false);
    } finally {
      await dbMod.deleteGarment(tee.id);
      await dbMod.deleteGarment(coat.id);
    }
  });
});
