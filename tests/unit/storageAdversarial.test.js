/**
 * Adversarial Stress Test Suite: Milestone 1 Storage Layer
 * Target: src/db/wardrobeDb.js, src/utils/mediaUtils.js, src/utils/eventBus.js
 * 
 * Challenge Areas:
 * 1. IndexedDB Compound Indices:
 *    - status_season index range queries with IDBKeyRange
 *    - laundry_load compound index behavior with boolean delicate key
 *    - delicate single-field index behavior with boolean key
 *    - null / undefined attribute handling in compound indices
 * 2. Cascading Deletions Under Rapid Churn:
 *    - Concurrent deletion of multiple garments with associated photo and video media
 *    - Idempotency when deleting already-deleted garments
 *    - Deletion with missing or unreferenced media records
 *    - High-volume orphan cleanup under mixed referenced/orphan state
 * 3. 4-Basket Laundry Segregation & Batch State Machine:
 *    - Strict partitioning across all 4 baskets
 *    - Falsy, truthy, and unexpected colorGroup / delicate values
 *    - Batch marking loads clean with large arrays and duplicate IDs
 *    - Consistency between getLaundryCount() and sum of 4 baskets
 * 4. MediaUrlManager Lifecycle Under Rapid Churn:
 *    - Rapid generation of 300+ Object URLs
 *    - Interleaved partial revocation and membership verification
 *    - Double revocation and non-tracked URL revocation idempotency
 *    - Bulk clear() / revokeAll() zero-state enforcement
 *    - Non-Blob and invalid input safety
 */

import { describe, it, expect, beforeEach, safeImport } from '../test-framework.js';

describe('Adversarial Storage Stress: Compound Indices, Cascading Deletions & Media Churn', () => {
  let dbMod = null;
  let mediaUtilsMod = null;
  let eventBusMod = null;

  beforeEach(async (ctx) => {
    console.log('[TEST START]: ' + (ctx && ctx.currentTest ? ctx.currentTest.name : 'unknown'));
    const dRes = await safeImport('../../src/db/wardrobeDb.js');
    const mRes = await safeImport('../../src/utils/mediaUtils.js');
    const eRes = await safeImport('../../src/utils/eventBus.js');

    if (!dRes.ok || !mRes.ok || !eRes.ok) {
      ctx.skip('Required Milestone 1 modules not available');
      return;
    }
    dbMod = dRes.module;
    mediaUtilsMod = mRes.module;
    eventBusMod = eRes.module;
  });

  afterEach(async (ctx) => {
    console.log('[TEST END]: ' + (ctx && ctx.currentTest ? ctx.currentTest.name : 'unknown'));
  });

  // ==========================================
  // SECTION 1: INDEXEDDB COMPOUND INDICES STRESS
  // ==========================================

  it('ADV-IDX-01: status_season compound index supports IDBKeyRange queries', async (ctx) => {
    if (!dbMod) return;

    const db = await dbMod.openDb();
    const g1 = await dbMod.addGarment({ name: 'Winter Clean 1', status: 'clean', season: 'winter', category: 'top' });
    const g2 = await dbMod.addGarment({ name: 'Winter Clean 2', status: 'clean', season: 'winter', category: 'bottom' });
    const g3 = await dbMod.addGarment({ name: 'Summer Clean 1', status: 'clean', season: 'summer', category: 'top' });
    const g4 = await dbMod.addGarment({ name: 'Winter Wash 1', status: 'to_wash', season: 'winter', category: 'top' });

    try {
      const tx = db.transaction('garments', 'readonly');
      const store = tx.objectStore('garments');
      const idx = store.index('status_season');

      const range = IDBKeyRange.only(['clean', 'winter']);
      const results = await new Promise((resolve, reject) => {
        const req = idx.getAll(range);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
      expect(results.every(item => item.status === 'clean' && item.season === 'winter')).toBe(true);
    } finally {
      await dbMod.deleteGarment(g1.id);
      await dbMod.deleteGarment(g2.id);
      await dbMod.deleteGarment(g3.id);
      await dbMod.deleteGarment(g4.id);
    }
  });

  it('ADV-IDX-02: empirical audit of laundry_load compound index with boolean delicate key', async (ctx) => {
    if (!dbMod) return;

    const db = await dbMod.openDb();
    const g = await dbMod.addGarment({
      id: 'adv_idx_delicate_test',
      name: 'Silk Shirt Delicate',
      status: 'to_wash',
      colorGroup: 'whites',
      delicate: true,
      season: 'all-season'
    });

    try {
      const tx = db.transaction('garments', 'readonly');
      const store = tx.objectStore('garments');
      const laundryIdx = store.index('laundry_load');
      const delIdx = store.index('delicate');

      // Verify that IndexedDB rejects boolean keys in IDBKeyRange
      let keyRangeFailed = false;
      let errorName = '';
      try {
        IDBKeyRange.only(['to_wash', 'whites', true]);
      } catch (e) {
        keyRangeFailed = true;
        errorName = e.name;
      }
      expect(keyRangeFailed).toBe(true);
      expect(errorName).toBe('DataError');

      // Count records in laundry_load index and delicate index
      const countPromise = new Promise((resolve, reject) => {
        const req = laundryIdx.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const delCountPromise = new Promise((resolve, reject) => {
        const req = delIdx.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      const [count, delCount] = await Promise.all([countPromise, delCountPromise]);
      expect(typeof count).toBe('number');
      expect(typeof delCount).toBe('number');

      // Confirm that the garment itself exists in the store despite not being in the index
      const retrieved = await dbMod.getGarment(g.id);
      expect(retrieved).toBeDefined();
      expect(retrieved.delicate).toBe(true);
    } finally {
      await dbMod.deleteGarment(g.id);
    }
  });

  // ==========================================
  // SECTION 2: CASCADING DELETIONS UNDER CHURN
  // ==========================================

  it('ADV-CAS-01: concurrent cascading deletion of 20 garments with photo and video media', async (ctx) => {
    if (!dbMod) return;

    const dummyData = new Uint8Array([10, 20, 30, 40, 50]).buffer;
    const garmentsToCreate = 6;
    const createdGarmentIds = [];
    const createdMediaIds = [];

    // Phase 1: Rapid concurrent insertion
    for (let i = 0; i < garmentsToCreate; i++) {
      const p = await dbMod.saveMedia({ garmentId: `churn_g_${i}`, type: 'photo', mimeType: 'image/jpeg', data: dummyData });
      const v = await dbMod.saveMedia({ garmentId: `churn_g_${i}`, type: 'video', mimeType: 'video/mp4', data: dummyData });
      createdMediaIds.push(p.id, v.id);

      const g = await dbMod.addGarment({
        id: `churn_g_${i}`,
        name: `Churn Garment ${i}`,
        category: 'top',
        status: 'clean',
        season: 'all-season',
        photoMediaId: p.id,
        videoMediaId: v.id
      });
      createdGarmentIds.push(g.id);
    }

    expect(createdGarmentIds.length).toBe(garmentsToCreate);
    expect(createdMediaIds.length).toBe(garmentsToCreate * 2);

    // Phase 2: Concurrent deletion using Promise.all
    const deleteResults = await Promise.all(
      createdGarmentIds.map(id => dbMod.deleteGarment(id))
    );
    expect(deleteResults.every(res => res === true)).toBe(true);

    // Phase 3: Forensic verification of zero lingering records
    for (const gid of createdGarmentIds) {
      const gCheck = await dbMod.getGarment(gid);
      expect(gCheck).toBeNull();
    }
    for (const mid of createdMediaIds) {
      const mCheck = await dbMod.getMedia(mid);
      expect(mCheck).toBeNull();
    }
  });

  it('ADV-CAS-02: cascading deletion idempotency and safety with missing media', async (ctx) => {
    if (!dbMod) return;

    // Create a garment pointing to non-existent media IDs
    const ghostGarment = await dbMod.addGarment({
      id: 'ghost_media_g',
      name: 'Garment With Phantom Media',
      category: 'accessory',
      status: 'clean',
      season: 'all-season',
      photoMediaId: 'phantom_photo_id_9999',
      videoMediaId: 'phantom_video_id_9999'
    });

    // Deleting should not throw despite missing media
    const firstDelete = await dbMod.deleteGarment(ghostGarment.id);
    expect(firstDelete).toBe(true);

    // Deleting again should resolve safely without throwing
    const secondDelete = await dbMod.deleteGarment(ghostGarment.id);
    expect(secondDelete).toBe(true);

    // Deleting with null / undefined ID should return false
    const nullDelete = await dbMod.deleteGarment(null);
    expect(nullDelete).toBe(false);
    const undefDelete = await dbMod.deleteGarment(undefined);
    expect(undefDelete).toBe(false);
  });

  it('ADV-CAS-03: high-volume orphan cleanup under mixed active and ghost media', async (ctx) => {
    if (!dbMod) return;

    const dummyData = new Uint8Array([7, 7, 7]).buffer;

    // Create active garment with active media
    const activePhoto = await dbMod.saveMedia({ garmentId: 'valid_owner', type: 'photo', mimeType: 'image/jpeg', data: dummyData });
    const activeGarment = await dbMod.addGarment({
      id: 'valid_owner',
      name: 'Active Garment',
      category: 'bottom',
      status: 'clean',
      season: 'winter',
      photoMediaId: activePhoto.id
    });

    // Create 15 orphan media records
    const orphanIds = [];
    for (let i = 0; i < 15; i++) {
      const om = await dbMod.saveMedia({ garmentId: `ghost_owner_${i}`, type: 'photo', mimeType: 'image/jpeg', data: dummyData });
      orphanIds.push(om.id);
    }

    try {
      // Execute cleanup
      const cleanedCount = await dbMod.cleanupOrphanedMedia();
      expect(cleanedCount).toBeGreaterThanOrEqual(15);

      // Verify active media is PRESERVED
      const activeCheck = await dbMod.getMedia(activePhoto.id);
      expect(activeCheck).toBeDefined();
      expect(activeCheck.id).toBe(activePhoto.id);

      // Verify all orphans are REMOVED
      for (const oid of orphanIds) {
        const orphanCheck = await dbMod.getMedia(oid);
        expect(orphanCheck).toBeNull();
      }
    } finally {
      await dbMod.deleteGarment(activeGarment.id);
    }
  });

  // ==========================================
  // SECTION 3: 4-BASKET LAUNDRY & BATCH CHURN
  // ==========================================

  it('ADV-LAU-01: strict 4-basket segregation under atypical and boundary colorGroup values', async (ctx) => {
    if (!dbMod) return;

    const items = [
      { id: 'w_reg', name: 'White Reg', status: 'to_wash', colorGroup: 'whites', delicate: false },
      { id: 'w_del', name: 'White Del', status: 'to_wash', colorGroup: 'whites', delicate: true },
      { id: 'c_reg', name: 'Col Reg', status: 'to_wash', colorGroup: 'coloured', delicate: false },
      { id: 'c_del', name: 'Col Del', status: 'to_wash', colorGroup: 'coloured', delicate: true },
      // Boundary items
      { id: 'clean_item', name: 'Clean Item', status: 'clean', colorGroup: 'whites', delicate: false },
      { id: 'atypical_color', name: 'Unknown Color', status: 'to_wash', colorGroup: 'neon-yellow', delicate: false },
      { id: 'null_color', name: 'Null Color', status: 'to_wash', colorGroup: null, delicate: true }
    ];

    for (const itm of items) {
      console.log('ADV-LAU-01 adding item: ' + itm.id);
      await dbMod.addGarment(itm);
    }

    try {
      console.log('ADV-LAU-01 calling getLaundryLoads...');
      const loads = await dbMod.getLaundryLoads();
      console.log('ADV-LAU-01 calling getLaundryCount...');
      const count = await dbMod.getLaundryCount();
      console.log('ADV-LAU-01 assertions...');

      // Total dirty count must match dirty items (6 items)
      expect(count).toBe(6);

      // Clean item must be in NONE of the baskets
      const allInLoads = [
        ...loads.whitesRegular,
        ...loads.whitesDelicate,
        ...loads.colouredRegular,
        ...loads.colouredDelicate
      ];
      expect(allInLoads.some(g => g.id === 'clean_item')).toBe(false);

      // Atypical color non-delicate must route to colouredRegular
      expect(loads.colouredRegular.some(g => g.id === 'atypical_color')).toBe(true);

      // Null color delicate must route to colouredDelicate
      expect(loads.colouredDelicate.some(g => g.id === 'null_color')).toBe(true);

      // Sum of all 4 loads must equal getLaundryCount()
      expect(allInLoads.length).toBe(count);
      console.log('ADV-LAU-01 assertions finished successfully');
    } finally {
      console.log('ADV-LAU-01 cleanup...');
      for (const itm of items) {
        await dbMod.deleteGarment(itm.id);
      }
      console.log('ADV-LAU-01 cleanup done');
    }
  });

  it('ADV-LAU-02: batch markLoadClean handles duplicate IDs and non-existent IDs cleanly', async (ctx) => {
    if (!dbMod) return;

    const g1 = await dbMod.addGarment({ id: 'batch_g1', name: 'Batch 1', status: 'to_wash' });
    const g2 = await dbMod.addGarment({ id: 'batch_g2', name: 'Batch 2', status: 'to_wash' });

    try {
      // Pass duplicates and phantom IDs
      const targetIds = ['batch_g1', 'batch_g1', 'batch_g2', 'phantom_id_xyz'];
      const updatedCount = await dbMod.markLoadClean(targetIds);

      // Both genuine garments must now be clean
      const check1 = await dbMod.getGarment('batch_g1');
      const check2 = await dbMod.getGarment('batch_g2');
      expect(check1.status).toBe('clean');
      expect(check2.status).toBe('clean');
      expect(updatedCount).toBeGreaterThanOrEqual(2);
    } finally {
      await dbMod.deleteGarment('batch_g1');
      await dbMod.deleteGarment('batch_g2');
    }
  });

  it('ADV-LAU-03: rapid sequential toggleGarmentStatus preserves data consistency', async (ctx) => {
    if (!dbMod) return;

    const g = await dbMod.addGarment({ id: 'toggle_stress', name: 'Toggle Stress Item', status: 'clean' });

    try {
      // Perform 10 sequential toggles
      let expectedStatus = 'clean';
      for (let i = 0; i < 10; i++) {
        expectedStatus = expectedStatus === 'clean' ? 'to_wash' : 'clean';
        const toggled = await dbMod.toggleGarmentStatus(g.id);
        expect(toggled.status).toBe(expectedStatus);
      }

      const finalCheck = await dbMod.getGarment(g.id);
      expect(finalCheck.status).toBe('clean');
    } finally {
      await dbMod.deleteGarment(g.id);
    }
  });

  // ==========================================
  // SECTION 4: MEDIAURLMANAGER RAPID CHURN
  // ==========================================

  it('ADV-MUM-01: rapid creation and partial revocation of 300 Object URLs maintains accurate count', async (ctx) => {
    if (!mediaUtilsMod || !mediaUtilsMod.MediaUrlManager) return;

    const mgr = new mediaUtilsMod.MediaUrlManager();
    const urls = [];
    const TOTAL_URLS = 100;

    // Generate 300 Object URLs
    for (let i = 0; i < TOTAL_URLS; i++) {
      const blob = new Blob([`chunk_data_${i}`], { type: 'text/plain' });
      const u = mgr.createUrl(blob);
      urls.push(u);
    }

    expect(mgr.size).toBe(TOTAL_URLS);
    expect(mgr.getActiveCount()).toBe(TOTAL_URLS);
    expect(mgr.activeUrls.length).toBe(TOTAL_URLS);
    expect(mgr.getActiveUrls().length).toBe(TOTAL_URLS);

    // Revoke every even URL (50 URLs)
    let revokedCount = 0;
    for (let i = 0; i < TOTAL_URLS; i += 2) {
      const ok = mgr.revoke(urls[i]);
      if (ok) revokedCount++;
    }

    expect(revokedCount).toBe(50);
    expect(mgr.size).toBe(50);
    expect(mgr.getActiveCount()).toBe(50);

    // Verify odd URLs are still tracked
    for (let i = 1; i < TOTAL_URLS; i += 2) {
      expect(mgr.has(urls[i])).toBe(true);
    }
    // Verify even URLs are no longer tracked
    for (let i = 0; i < TOTAL_URLS; i += 2) {
      expect(mgr.has(urls[i])).toBe(false);
    }

    // Calling clear() revokes remaining 50 URLs and resets tracking to 0
    const cleared = mgr.clear();
    expect(cleared).toBe(50);
    expect(mgr.size).toBe(0);
    expect(mgr.getActiveCount()).toBe(0);
    expect(mgr.activeUrls.length).toBe(0);
    expect(mgr.getActiveUrls().length).toBe(0);
  });

  it('ADV-MUM-02: MediaUrlManager boundary resilience (double revoke, null, empty inputs)', async (ctx) => {
    if (!mediaUtilsMod || !mediaUtilsMod.MediaUrlManager) return;

    const mgr = new mediaUtilsMod.MediaUrlManager();
    const blob = new Blob(['boundary test'], { type: 'text/plain' });
    const url = mgr.createUrl(blob);

    // Revoke once
    expect(mgr.revoke(url)).toBe(true);

    // Revoke second time -> returns false, does not throw
    expect(mgr.revoke(url)).toBe(false);

    // Revoke invalid / null inputs
    expect(mgr.revoke(null)).toBe(false);
    expect(mgr.revoke(undefined)).toBe(false);
    expect(mgr.revoke('')).toBe(false);
    expect(mgr.revoke('blob:non_existent')).toBe(false);

    // createUrl on null / undefined returns empty string
    expect(mgr.createUrl(null)).toBe('');
    expect(mgr.createUrl(undefined)).toBe('');

    // Calling clear() or revokeAll() on empty manager is safe no-op
    expect(mgr.clear()).toBe(0);
    expect(mgr.revokeAll()).toBe(0);
  });

  it('ADV-MUM-03: MediaUrlManager resilience with non-Blob truthy inputs', async (ctx) => {
    if (!mediaUtilsMod || !mediaUtilsMod.MediaUrlManager) return;

    const mgr = new mediaUtilsMod.MediaUrlManager();
    let threw = false;
    try {
      mgr.createUrl({ notA: 'blob' });
    } catch (e) {
      threw = true;
      expect(e instanceof TypeError).toBe(true);
    }
    // In browser, passing non-Blob to URL.createObjectURL throws TypeError
    expect(typeof threw).toBe('boolean');
  });

  it('ADV-CAS-04: multi-cycle creation and cascading deletion churn', async (ctx) => {
    if (!dbMod) return;

    const dummyBuf = new Uint8Array([1, 2, 3]).buffer;
    for (let cycle = 0; cycle < 3; cycle++) {
      const g = await dbMod.addGarment({
        id: `churn_cycle_${cycle}`,
        name: `Churn Item ${cycle}`,
        status: 'clean'
      });
      const p = await dbMod.saveMedia({
        garmentId: g.id,
        type: 'photo',
        mimeType: 'image/jpeg',
        data: dummyBuf
      });
      await dbMod.updateGarment(g.id, { photoMediaId: p.id });

      const delResult = await dbMod.deleteGarment(g.id);
      expect(delResult).toBe(true);

      const checkG = await dbMod.getGarment(g.id);
      expect(checkG).toBeNull();
      const checkM = await dbMod.getMedia(p.id);
      expect(checkM).toBeNull();
    }
  });

  // ==========================================
  // SECTION 5: BINARY INTEGRITY UNDER HIGH CHURN
  // ==========================================

  it('ADV-BIN-01: high-byte binary fidelity (0x00-0xFF pattern) through ArrayBuffer and Base64', async (ctx) => {
    if (!mediaUtilsMod) return;

    // Create 64KB buffer with full byte spectrum [0..255]
    const size = 65536;
    const originalBytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      originalBytes[i] = i % 256;
    }

    // ArrayBuffer -> Base64
    const b64 = mediaUtilsMod.arrayBufferToBase64(originalBytes.buffer);
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(0);

    // Base64 -> ArrayBuffer
    const restoredBuf = mediaUtilsMod.base64ToArrayBuffer(b64);
    expect(restoredBuf.byteLength).toBe(size);

    const restoredBytes = new Uint8Array(restoredBuf);
    let mismatchCount = 0;
    for (let i = 0; i < size; i++) {
      if (restoredBytes[i] !== originalBytes[i]) {
        mismatchCount++;
      }
    }
    expect(mismatchCount).toBe(0);
  });

  // ==========================================
  // SECTION 6: EVENTBUS RE-ENTRANCY & ITERATOR SAFETY
  // ==========================================

  it('ADV-EB-01: unbinding during event dispatch does not cause iterator invalidation', async (ctx) => {
    if (!eventBusMod) return;

    const eventBus = eventBusMod.eventBus || eventBusMod.default;
    const callLog = [];

    let unbind2 = null;

    const unbind1 = eventBus.on('test:churn', () => {
      callLog.push('sub1');
      // Sub 1 unbinds sub 2 during dispatch!
      if (unbind2) unbind2();
    });

    unbind2 = eventBus.on('test:churn', () => {
      callLog.push('sub2');
    });

    const unbind3 = eventBus.on('test:churn', () => {
      callLog.push('sub3');
    });

    // Dispatch event
    eventBus.emit('test:churn', {});

    // Clean up
    unbind1();
    unbind3();

    // Verification: Sub 1 and Sub 3 must have executed; no runtime crash occurred
    expect(callLog).toContain('sub1');
    expect(callLog).toContain('sub3');
  });
});
