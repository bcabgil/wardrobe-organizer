/**
 * Tier 4 E2E Test Suite: Real-World Application Workflows (Scenarios S1 through S7)
 * Targets: End-to-End System Scenarios defined in TEST_INFRA.md
 * 
 * Scenarios:
 * - S1: Greenfield Wardrobe Onboarding (Garment & Media Registry)
 * - S2: Daily Tomorrow Outfit Planning (Anchor Item Pinning & Weather Context)
 * - S3: Wearing an Outfit & Doing Laundry (Post-Wear Logging & 4-Basket Batch Cleaning)
 * - S4: Full Disaster Recovery Backup & Restore (.zip Export -> Wipe -> Replace Mode)
 * - S5: Multi-Device Status Sync (.json Export -> Merge Mode Conflict Resolution)
 * - S6: 100% Offline Airplane Mode Operation (Zero Network Autonomous Operation)
 * - S7: Season Transition (Active Season Switcher & Dynamic Catalog Adaptation)
 */

import { describe, it, expect, beforeEach, safeImport } from '../test-framework.js';

describe('Tier 4 E2E Application Scenarios (S1 - S7)', () => {
  let dbMod = null;
  let backupMod = null;
  let stylistMod = null;

  beforeEach(async (ctx) => {
    const dRes = await safeImport('../../src/db/wardrobeDb.js');
    const bRes = await safeImport('../../src/services/backup/LocalArchiveBackupProvider.js');
    const sRes = await safeImport('../../src/services/ai/offlineStylist.js');

    if (!dRes.ok) {
      ctx.skip('Pending Milestone 1+: Core DB or service layer not implemented yet');
      return;
    }
    dbMod = dRes.module;
    backupMod = bRes.ok ? bRes.module : null;
    stylistMod = sRes.ok ? sRes.module : null;
  });

  // ==========================================
  // SCENARIO S1: GREENFIELD WARDROBE ONBOARDING
  // ==========================================

  it('S1: Greenfield Wardrobe Onboarding — registers garments with photo and fit video', async (ctx) => {
    if (!dbMod) return;

    // Simulate user registering a complete capsule wardrobe
    const dummyMedia = new Uint8Array([10, 20, 30, 40]).buffer;
    const photo = await dbMod.saveMedia({
      garmentId: 's1_top',
      type: 'photo',
      mimeType: 'image/jpeg',
      data: dummyMedia
    });

    const video = await dbMod.saveMedia({
      garmentId: 's1_top',
      type: 'video',
      mimeType: 'video/mp4',
      data: dummyMedia
    });

    const garment = await dbMod.addGarment({
      id: 's1_top',
      name: 'Merino Wool Crewneck',
      category: 'top',
      season: 'winter',
      colorGroup: 'coloured',
      delicate: true,
      status: 'clean',
      type: 'everyday',
      visualDescription: 'Fine-knit charcoal grey merino wool sweater',
      photoMediaId: photo.id,
      videoMediaId: video.id
    });

    expect(garment).toBeDefined();
    expect(garment.id).toBe('s1_top');

    // Verify media retrieval
    const retrievedBlob = await dbMod.getMediaBlob(photo.id);
    expect(retrievedBlob).toBeDefined();
    expect(retrievedBlob.type).toBe('image/jpeg');

    const retrievedVideo = await dbMod.getMedia(video.id);
    expect(retrievedVideo).toBeDefined();
    expect(retrievedVideo.data.byteLength).toBe(4);

    // Cleanup
    await dbMod.deleteGarment('s1_top');
  });

  // ==========================================
  // SCENARIO S2: DAILY TOMORROW OUTFIT PLANNING
  // ==========================================

  it('S2: Daily Tomorrow Outfit Planning — pins anchor jeans & includes outerwear for cold rain', async (ctx) => {
    if (!dbMod || !stylistMod) {
      if (!stylistMod) ctx.skip('Pending Milestone 3: offlineStylist not implemented yet');
      return;
    }

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;

    const wardrobe = [
      { id: 's2_anchor_jeans', name: 'Raw Denim Jeans', category: 'bottom', season: 'all-season', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'everyday' },
      { id: 's2_oxford_shirt', name: 'White Oxford Shirt', category: 'top', season: 'all-season', colorGroup: 'whites', delicate: false, status: 'clean', type: 'everyday' },
      { id: 's2_trench_coat', name: 'Water-Resistant Trench Coat', category: 'outerwear', season: 'winter', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'everyday' },
      { id: 's2_chelsea_boots', name: 'Chelsea Boots', category: 'shoes', season: 'winter', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'everyday' }
    ];

    const weatherContext = {
      tempMin: 6,
      tempMax: 11,
      rainProb: 85,
      condition: 'Heavy rain showers'
    };

    const result = generate({
      garments: wardrobe,
      occasion: 'everyday',
      activeSeason: 'winter',
      anchorGarmentId: 's2_anchor_jeans',
      weatherData: weatherContext
    });

    expect(result.outfits.length).toBeGreaterThanOrEqual(1);
    const outfit = result.outfits[0];

    // Anchor jeans MUST be pinned
    expect(outfit.garmentIds).toContain('s2_anchor_jeans');

    // For cold rainy weather (11°C, 85% rain), trench coat should be included
    expect(outfit.garmentIds).toContain('s2_trench_coat');
    expect(outfit.explanation).toBeDefined();
  });

  // ==========================================
  // SCENARIO S3: WEARING AN OUTFIT & LAUNDRY
  // ==========================================

  it('S3: Wearing an Outfit & Doing Laundry — marks items dirty, groups into baskets, marks clean', async (ctx) => {
    if (!dbMod) return;

    // 1. Seed outfit garments
    const gWhite = await dbMod.addGarment({ id: 's3_white', name: 'Linen Shirt', category: 'top', season: 'all-season', colorGroup: 'whites', delicate: false, status: 'clean', type: 'everyday' });
    const gJeans = await dbMod.addGarment({ id: 's3_jeans', name: 'Selvedge Jeans', category: 'bottom', season: 'all-season', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'everyday' });

    // 2. User wears outfit -> marks items to_wash
    await dbMod.updateGarment(gWhite.id, { status: 'to_wash' });
    await dbMod.updateGarment(gJeans.id, { status: 'to_wash' });

    // 3. Check laundry loads
    const loads = await dbMod.getLaundryLoads();
    expect(loads.whitesRegular.some(g => g.id === gWhite.id)).toBe(true);
    expect(loads.colouredRegular.some(g => g.id === gJeans.id)).toBe(true);

    // 4. Tap "Mark Load Clean" on whites
    await dbMod.markGarmentsClean([gWhite.id]);

    const loadsAfter = await dbMod.getLaundryLoads();
    expect(loadsAfter.whitesRegular.some(g => g.id === gWhite.id)).toBe(false);

    const checkWhite = await dbMod.getGarment(gWhite.id);
    expect(checkWhite.status).toBe('clean');

    // Cleanup
    await dbMod.deleteGarment(gWhite.id);
    await dbMod.deleteGarment(gJeans.id);
  });

  // ==========================================
  // SCENARIO S4: DISASTER RECOVERY BACKUP & RESTORE
  // ==========================================

  it('S4: Full Disaster Recovery — export .zip -> wipe database -> restore replace mode', async (ctx) => {
    if (!dbMod || !backupMod) {
      if (!backupMod) ctx.skip('Pending Milestone 2: LocalArchiveBackupProvider not implemented yet');
      return;
    }

    const LocalProvider = backupMod.LocalArchiveBackupProvider || backupMod.default;
    const provider = new LocalProvider();

    // 1. Seed item
    const g = await dbMod.addGarment({
      id: 's4_capsule_top',
      name: 'Cashmere V-Neck',
      category: 'top',
      season: 'winter',
      colorGroup: 'coloured',
      delicate: true,
      status: 'clean',
      type: 'everyday'
    });

    // 2. Export full backup
    const backupRes = await provider.exportFullBackup();
    expect(backupRes.blob instanceof Blob).toBe(true);

    // 3. Simulate disaster (wipe database record)
    await dbMod.deleteGarment('s4_capsule_top');
    expect(await dbMod.getGarment('s4_capsule_top')).toBeNull();

    // 4. Restore from backup in replace mode
    const restoreRes = await provider.importBackup(backupRes.blob, 'replace');
    expect(restoreRes.success).toBe(true);

    // 5. Verify restored
    const restoredG = await dbMod.getGarment('s4_capsule_top');
    expect(restoredG).toBeDefined();
    expect(restoredG.name).toBe('Cashmere V-Neck');

    // Cleanup
    await dbMod.deleteGarment('s4_capsule_top');
  });

  // ==========================================
  // SCENARIO S5: MULTI-DEVICE STATUS SYNC
  // ==========================================

  it('S5: Multi-Device Status Sync — merge mode preserves latest updates without duplicate records', async (ctx) => {
    if (!dbMod || !backupMod) {
      if (!backupMod) ctx.skip('Pending Milestone 2: LocalArchiveBackupProvider not implemented yet');
      return;
    }

    const LocalProvider = backupMod.LocalArchiveBackupProvider || backupMod.default;
    const provider = new LocalProvider();

    // Local device has g1 updated at T1
    await dbMod.addGarment({
      id: 's5_sync_g1',
      name: 'Local Device Top',
      category: 'top',
      season: 'winter',
      colorGroup: 'whites',
      delicate: false,
      status: 'clean',
      type: 'everyday',
      updatedAt: '2026-11-01T08:00:00Z'
    });

    // Remote snapshot has newer update for g1 at T2 (marked to_wash) + new item g2
    const incomingSnapshot = JSON.stringify({
      version: 1,
      exportedAt: '2026-11-01T10:00:00Z',
      settings: { activeSeason: 'winter' },
      garments: [
        {
          id: 's5_sync_g1',
          name: 'Remote Device Top (Newer)',
          category: 'top',
          season: 'winter',
          colorGroup: 'whites',
          delicate: false,
          status: 'to_wash',
          type: 'everyday',
          updatedAt: '2026-11-01T10:00:00Z'
        },
        {
          id: 's5_sync_g2',
          name: 'Remote Device Brand New Chinos',
          category: 'bottom',
          season: 'winter',
          colorGroup: 'coloured',
          delicate: false,
          status: 'clean',
          type: 'everyday',
          updatedAt: '2026-11-01T10:00:00Z'
        }
      ],
      mediaMetadata: [],
      outfitHistory: []
    });

    const mergeResult = await provider.importBackup(incomingSnapshot, 'merge');
    expect(mergeResult.success).toBe(true);

    // Verify g1 was updated to the newer version
    const g1 = await dbMod.getGarment('s5_sync_g1');
    expect(g1.status).toBe('to_wash');
    expect(g1.name).toBe('Remote Device Top (Newer)');

    // Verify g2 was added
    const g2 = await dbMod.getGarment('s5_sync_g2');
    expect(g2).toBeDefined();

    // Cleanup
    await dbMod.deleteGarment('s5_sync_g1');
    await dbMod.deleteGarment('s5_sync_g2');
  });

  // ==========================================
  // SCENARIO S6: OFFLINE AIRPLANE MODE
  // ==========================================

  it('S6: 100% Offline Airplane Mode — stylist runs autonomously without network connection', async (ctx) => {
    if (!stylistMod) {
      ctx.skip('Pending Milestone 3: offlineStylist not implemented yet');
      return;
    }

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;

    const wardrobe = [
      { id: 's6_t1', name: 'Cotton Tee', category: 'top', season: 'all-season', colorGroup: 'whites', delicate: false, status: 'clean', type: 'everyday' },
      { id: 's6_b1', name: 'Chinos', category: 'bottom', season: 'all-season', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'everyday' },
      { id: 's6_s1', name: 'Sneakers', category: 'shoes', season: 'all-season', colorGroup: 'whites', delicate: false, status: 'clean', type: 'everyday' }
    ];

    // Execute purely synchronously in memory without network
    const result = generate({
      garments: wardrobe,
      occasion: 'everyday',
      activeSeason: 'summer'
    });

    expect(result).toBeDefined();
    expect(result.engine).toBe('offline');
    expect(result.outfits.length).toBeGreaterThanOrEqual(1);
  });

  // ==========================================
  // SCENARIO S7: SEASON TRANSITION
  // ==========================================

  it('S7: Season Transition — switching active season immediately adapts stylist candidate pool', async (ctx) => {
    if (!stylistMod) {
      ctx.skip('Pending Milestone 3: offlineStylist not implemented yet');
      return;
    }

    const generate = stylistMod.generateOfflineOutfits || stylistMod.default?.generateOfflineOutfits;

    const wardrobe = [
      { id: 's7_summer_top', name: 'Linen Beach Shirt', category: 'top', season: 'summer', colorGroup: 'whites', delicate: false, status: 'clean', type: 'everyday' },
      { id: 's7_winter_top', name: 'Heavy Wool Turtleneck', category: 'top', season: 'winter', colorGroup: 'coloured', delicate: true, status: 'clean', type: 'everyday' },
      { id: 's7_all_bottom', name: 'Jeans', category: 'bottom', season: 'all-season', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'everyday' },
      { id: 's7_all_shoes', name: 'Sneakers', category: 'shoes', season: 'all-season', colorGroup: 'coloured', delicate: false, status: 'clean', type: 'everyday' }
    ];

    // Summer season
    const summerOutfits = generate({
      garments: wardrobe,
      occasion: 'everyday',
      activeSeason: 'summer'
    });
    for (const outfit of summerOutfits.outfits) {
      expect(outfit.garmentIds).toContain('s7_summer_top');
      expect(outfit.garmentIds).not.toContain('s7_winter_top');
    }

    // Winter season
    const winterOutfits = generate({
      garments: wardrobe,
      occasion: 'everyday',
      activeSeason: 'winter'
    });
    for (const outfit of winterOutfits.outfits) {
      expect(outfit.garmentIds).toContain('s7_winter_top');
      expect(outfit.garmentIds).not.toContain('s7_summer_top');
    }
  });
});
