/**
 * Unit Test Suite: IndexedDB Storage & Schemas (Milestone 1)
 * Target: src/db/wardrobeDb.js
 * 
 * Verifies:
 * - WardrobeDB database initialization and 4 object stores
 * - Compound indices (status_season, laundry_load) and store indices
 * - Garment entity CRUD operations with timestamp auto-generation
 * - WebKit-safe ArrayBuffer media storage and Blob reconstitution
 * - Laundry load aggregation and batch status updates
 * - Settings key-value storage and dirty-tracking metrics
 * - Boundary conditions: empty stores, invalid inputs, orphan cleanup, unicode
 */

import { describe, it, expect, beforeEach, afterEach, safeImport } from '../test-framework.js';

describe('WardrobeDB: Storage Layer & Schemas', () => {
  let dbMod = null;
  const TEST_DB_NAME = 'WardrobeDB_UnitTest';

  beforeEach(async (ctx) => {
    const res = await safeImport('../../src/db/wardrobeDb.js');
    if (!res.ok) {
      ctx.skip('Pending Milestone 1: src/db/wardrobeDb.js not implemented yet');
      return;
    }
    dbMod = res.module;
  });

  // ==========================================
  // TIER 1: CORE SCHEMA & INITIALIZATION
  // ==========================================

  it('T1-DB-01: opens WardrobeDB with 4 required object stores', async (ctx) => {
    if (!dbMod) return;

    // Verify raw IDB schema
    const db = await (dbMod.openDb ? dbMod.openDb() : dbMod.getDatabase?.());
    expect(db).toBeDefined();
    expect(db.name).toBe('WardrobeDB');

    const storeNames = Array.from(db.objectStoreNames);
    expect(storeNames).toContain('garments');
    expect(storeNames).toContain('media');
    expect(storeNames).toContain('settings');
    expect(storeNames).toContain('outfitHistory');
  });

  it('T1-DB-02: verifies compound indices on garments store', async (ctx) => {
    if (!dbMod) return;

    const db = await (dbMod.openDb ? dbMod.openDb() : dbMod.getDatabase?.());
    const tx = db.transaction('garments', 'readonly');
    const store = tx.objectStore('garments');
    const indexNames = Array.from(store.indexNames);

    expect(indexNames).toContain('status_season');
    expect(indexNames).toContain('laundry_load');
    expect(indexNames).toContain('category');
    expect(indexNames).toContain('season');
    expect(indexNames).toContain('status');
    expect(indexNames).toContain('colorGroup');
    expect(indexNames).toContain('delicate');
    expect(indexNames).toContain('type');

    const statusSeasonIdx = store.index('status_season');
    expect(statusSeasonIdx.keyPath).toEqual(['status', 'season']);

    const laundryLoadIdx = store.index('laundry_load');
    expect(laundryLoadIdx.keyPath).toEqual(['status', 'colorGroup', 'delicate']);
  });

  it('T1-DB-03: verifies media store indices and keyPath', async (ctx) => {
    if (!dbMod) return;

    const db = await (dbMod.openDb ? dbMod.openDb() : dbMod.getDatabase?.());
    const tx = db.transaction('media', 'readonly');
    const store = tx.objectStore('media');

    expect(store.keyPath).toBe('id');
    const indexNames = Array.from(store.indexNames);
    expect(indexNames).toContain('garmentId');
    expect(indexNames).toContain('type');
  });

  // ==========================================
  // TIER 1: GARMENT CRUD OPERATIONS
  // ==========================================

  it('T1-DB-04: creates, reads, updates, and deletes a garment entity', async (ctx) => {
    if (!dbMod) return;

    const garmentData = {
      name: 'Charcoal Merino Turtleneck',
      category: 'top',
      season: 'winter',
      colorGroup: 'coloured',
      delicate: true,
      status: 'clean',
      type: 'everyday',
      visualDescription: 'Charcoal grey fine-knit turtleneck sweater'
    };

    // CREATE
    const created = await dbMod.addGarment(garmentData);
    expect(created).toBeDefined();
    expect(created.id).toBeDefined();
    expect(created.name).toBe('Charcoal Merino Turtleneck');
    expect(created.createdAt).toBeDefined();
    expect(created.updatedAt).toBeDefined();

    // READ
    const retrieved = await dbMod.getGarment(created.id);
    expect(retrieved).toBeDefined();
    expect(retrieved.id).toBe(created.id);
    expect(retrieved.delicate).toBe(true);

    // UPDATE
    const updated = await dbMod.updateGarment(created.id, {
      name: 'Charcoal Merino Turtleneck (Fitted)',
      status: 'to_wash'
    });
    expect(updated.name).toBe('Charcoal Merino Turtleneck (Fitted)');
    expect(updated.status).toBe('to_wash');

    // DELETE
    const deleted = await dbMod.deleteGarment(created.id);
    expect(deleted).toBe(true);

    const postDelete = await dbMod.getGarment(created.id);
    expect(postDelete).toBeNull();
  });

  it('T1-DB-05: toggles garment status between clean and to_wash', async (ctx) => {
    if (!dbMod) return;

    const g = await dbMod.addGarment({
      name: 'Toggle Test Shirt',
      category: 'top',
      season: 'all-season',
      colorGroup: 'whites',
      delicate: false,
      status: 'clean',
      type: 'everyday'
    });

    const toggled1 = await dbMod.toggleGarmentStatus(g.id);
    expect(toggled1.status).toBe('to_wash');

    const toggled2 = await dbMod.toggleGarmentStatus(g.id);
    expect(toggled2.status).toBe('clean');

    await dbMod.deleteGarment(g.id);
  });

  // ==========================================
  // TIER 1: WEBKIT-SAFE MEDIA PIPELINE
  // ==========================================

  it('T1-DB-06: stores binary media as ArrayBuffer and reconstructs Blob with correct MIME', async (ctx) => {
    if (!dbMod) return;

    // Create 1KB binary pattern
    const bytes = new Uint8Array(1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const arrayBuffer = bytes.buffer;

    const mediaRecord = await dbMod.saveMedia({
      garmentId: 'test_garment_uuid',
      type: 'photo',
      mimeType: 'image/jpeg',
      data: arrayBuffer
    });

    expect(mediaRecord).toBeDefined();
    expect(mediaRecord.id).toBeDefined();
    expect(mediaRecord.type).toBe('photo');
    expect(mediaRecord.mimeType).toBe('image/jpeg');
    expect(mediaRecord.size).toBe(1024);

    // Reconstruct Blob
    const blob = await dbMod.getMediaBlob(mediaRecord.id);
    expect(blob).toBeDefined();
    expect(blob instanceof Blob).toBe(true);
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBe(1024);

    // Verify binary fidelity
    const reconstitutedBuf = await blob.arrayBuffer();
    expect(reconstitutedBuf.byteLength).toBe(1024);
    const view = new Uint8Array(reconstitutedBuf);
    expect(view[0]).toBe(0);
    expect(view[255]).toBe(255);
    expect(view[256]).toBe(0);
  });

  it('T1-DB-07: cascading delete removes garment along with photo and video media', async (ctx) => {
    if (!dbMod) return;

    const dummyBuf = new Uint8Array([1, 2, 3, 4]).buffer;
    const photo = await dbMod.saveMedia({ garmentId: 'cascading_target', type: 'photo', mimeType: 'image/png', data: dummyBuf });
    const video = await dbMod.saveMedia({ garmentId: 'cascading_target', type: 'video', mimeType: 'video/mp4', data: dummyBuf });

    const g = await dbMod.addGarment({
      id: 'cascading_target',
      name: 'Cascading Target Suit',
      category: 'top',
      season: 'all-season',
      colorGroup: 'coloured',
      delicate: true,
      status: 'clean',
      type: 'dress-up',
      photoMediaId: photo.id,
      videoMediaId: video.id
    });

    await dbMod.deleteGarment(g.id);

    const checkG = await dbMod.getGarment(g.id);
    expect(checkG).toBeNull();

    const checkPhoto = await dbMod.getMedia(photo.id);
    expect(checkPhoto).toBeNull();

    const checkVideo = await dbMod.getMedia(video.id);
    expect(checkVideo).toBeNull();
  });

  // ==========================================
  // TIER 1: LAUNDRY & SETTINGS OPERATIONS
  // ==========================================

  it('T1-DB-08: aggregates 4-basket laundry loads correctly', async (ctx) => {
    if (!dbMod) return;

    // Seed 4 garments into the 4 buckets
    const g1 = await dbMod.addGarment({ name: 'L1', category: 'top', season: 'winter', colorGroup: 'whites', delicate: false, status: 'to_wash', type: 'everyday' });
    const g2 = await dbMod.addGarment({ name: 'L2', category: 'top', season: 'winter', colorGroup: 'whites', delicate: true, status: 'to_wash', type: 'everyday' });
    const g3 = await dbMod.addGarment({ name: 'L3', category: 'top', season: 'winter', colorGroup: 'coloured', delicate: false, status: 'to_wash', type: 'everyday' });
    const g4 = await dbMod.addGarment({ name: 'L4', category: 'top', season: 'winter', colorGroup: 'coloured', delicate: true, status: 'to_wash', type: 'everyday' });

    const loads = await dbMod.getLaundryLoads();
    expect(loads.whitesRegular.some(item => item.id === g1.id)).toBe(true);
    expect(loads.whitesDelicate.some(item => item.id === g2.id)).toBe(true);
    expect(loads.colouredRegular.some(item => item.id === g3.id)).toBe(true);
    expect(loads.colouredDelicate.some(item => item.id === g4.id)).toBe(true);

    // Batch mark whites clean
    const updatedCount = await dbMod.markGarmentsClean([g1.id, g2.id]);
    expect(updatedCount).toBe(2);

    const postLoads = await dbMod.getLaundryLoads();
    expect(postLoads.whitesRegular.some(item => item.id === g1.id)).toBe(false);
    expect(postLoads.whitesDelicate.some(item => item.id === g2.id)).toBe(false);

    // Cleanup
    await dbMod.deleteGarment(g1.id);
    await dbMod.deleteGarment(g2.id);
    await dbMod.deleteGarment(g3.id);
    await dbMod.deleteGarment(g4.id);
  });

  it('T1-DB-09: settings key-value persistence with activeSeason default', async (ctx) => {
    if (!dbMod) return;

    await dbMod.setSetting('activeSeason', 'summer');
    const val = await dbMod.getSetting('activeSeason');
    expect(val).toBe('summer');

    await dbMod.setSetting('geminiApiKey', 'AIzaSyFakeKey123');
    const apiKey = await dbMod.getSetting('geminiApiKey');
    expect(apiKey).toBe('AIzaSyFakeKey123');

    // Reset
    await dbMod.setSetting('activeSeason', 'winter');
    await dbMod.setSetting('geminiApiKey', '');
  });

  // ==========================================
  // TIER 2: BOUNDARY & EDGE CASES
  // ==========================================

  it('T2-DB-01: querying non-existent ID returns null without throwing', async (ctx) => {
    if (!dbMod) return;

    const res = await dbMod.getGarment('non_existent_uuid_999999');
    expect(res).toBeNull();

    const mediaRes = await dbMod.getMedia('non_existent_media_999999');
    expect(mediaRes).toBeNull();
  });

  it('T2-DB-02: handles special characters, unicode, and emojis in text fields', async (ctx) => {
    if (!dbMod) return;

    const specialName = '👘 Silk Kimono Robe & "Gold" Embroidery <Tag> & 100% Cotton';
    const g = await dbMod.addGarment({
      name: specialName,
      category: 'one-piece',
      season: 'all-season',
      colorGroup: 'coloured',
      delicate: true,
      status: 'clean',
      type: 'dress-up',
      visualDescription: 'Japanese inspired 🌸 cherry blossom motif with \'single\' quotes.'
    });

    const retrieved = await dbMod.getGarment(g.id);
    expect(retrieved.name).toBe(specialName);
    expect(retrieved.visualDescription).toContain('🌸');

    await dbMod.deleteGarment(g.id);
  });

  it('T2-DB-03: cleans up orphaned media unreferenced by any garment', async (ctx) => {
    if (!dbMod) return;

    const dummyBuf = new Uint8Array([9, 9, 9]).buffer;
    const orphanPhoto = await dbMod.saveMedia({ garmentId: 'ghost_id', type: 'photo', mimeType: 'image/jpeg', data: dummyBuf });

    if (dbMod.cleanupOrphanedMedia) {
      const removedCount = await dbMod.cleanupOrphanedMedia();
      expect(removedCount).toBeGreaterThanOrEqual(1);

      const checkOrphan = await dbMod.getMedia(orphanPhoto.id);
      expect(checkOrphan).toBeNull();
    }
  });

  // ==========================================
  // TIER 3: CROSS-FEATURE DIRTY TRACKING
  // ==========================================

  it('T3-DB-01: calculates backup dirty status correctly when garments are added/modified', async (ctx) => {
    if (!dbMod) return;

    if (dbMod.getBackupStatus) {
      const statusBefore = await dbMod.getBackupStatus();
      expect(typeof statusBefore.hasUnsavedChanges).toBe('boolean');

      const g = await dbMod.addGarment({
        name: 'Dirty Tracking Test',
        category: 'accessory',
        season: 'all-season',
        colorGroup: 'whites',
        delicate: false,
        status: 'clean',
        type: 'everyday'
      });

      const statusAfter = await dbMod.getBackupStatus();
      expect(statusAfter.hasUnsavedChanges).toBe(true);

      await dbMod.deleteGarment(g.id);
    }
  });
});
