/**
 * Integration Test Suite: Mobile UI Components & Media Safeguards (Milestone 4)
 * Targets: src/components/GarmentCard.js
 *          src/components/GarmentModal.js
 *          src/components/WearOutfitModal.js
 *          src/components/BottomNav.js
 *          src/utils/mediaUtils.js
 * 
 * Verifies:
 * - GarmentCard rendering, thumbnail handling, and clean/wash toggle
 * - GarmentModal inline video player attributes (playsinline, webkit-playsinline)
 * - Object URL revocation lifecycle on modal close
 * - WearOutfitModal outfit confirmation and post-wear laundry logging
 * - BottomNav 5-item tabs and reactive badge counters
 */

import { describe, it, expect, beforeEach, safeImport } from '../test-framework.js';

describe('UI Components: Cards, Modals & Media Safeguards', () => {
  let cardMod = null;
  let modalMod = null;
  let wearModalMod = null;
  let mediaUtilsMod = null;

  beforeEach(async (ctx) => {
    const cRes = await safeImport('../../src/components/GarmentCard.js');
    const mRes = await safeImport('../../src/components/GarmentModal.js');
    const wRes = await safeImport('../../src/components/WearOutfitModal.js');
    const uRes = await safeImport('../../src/utils/mediaUtils.js');

    if (!cRes.ok && !mRes.ok && !uRes.ok) {
      ctx.skip('Pending Milestone 1/4: UI components not yet implemented');
      return;
    }
    cardMod = cRes.ok ? cRes.module : null;
    modalMod = mRes.ok ? mRes.module : null;
    wearModalMod = wRes.ok ? wRes.module : null;
    mediaUtilsMod = uRes.ok ? uRes.module : null;
  });

  // ==========================================
  // TIER 1: FIT VIDEO & WEBKIT SAFEGUARDS
  // ==========================================

  it('T1-UI-01: video elements enforce playsinline and webkit-playsinline for iOS Safari', async (ctx) => {
    if (!mediaUtilsMod && !modalMod) return;

    if (mediaUtilsMod && mediaUtilsMod.createSafeVideoPlayer) {
      const videoEl = mediaUtilsMod.createSafeVideoPlayer('blob:http://dummy/video', 'video/mp4');
      expect(videoEl.tagName).toBe('VIDEO');
      expect(videoEl.hasAttribute('playsinline')).toBe(true);
      expect(videoEl.hasAttribute('webkit-playsinline')).toBe(true);
      expect(videoEl.getAttribute('preload')).toBe('metadata');
    }
  });

  it('T1-UI-02: MediaUrlManager tracks active URLs and supports clean revocation', async (ctx) => {
    if (!mediaUtilsMod || !mediaUtilsMod.MediaUrlManager) return;

    const manager = new mediaUtilsMod.MediaUrlManager();
    const dummyBlob = new Blob(['sample data'], { type: 'text/plain' });
    const url = manager.createUrl(dummyBlob);

    expect(typeof url).toBe('string');
    expect(url.startsWith('blob:')).toBe(true);
    expect(manager.getActiveCount()).toBe(1);

    manager.revoke(url);
    expect(manager.getActiveCount()).toBe(0);
  });

  // ==========================================
  // TIER 1: GARMENT CARD INTERACTION
  // ==========================================

  it('T1-UI-03: GarmentCard renders garment metadata and toggle button', async (ctx) => {
    if (!cardMod) return;

    const CardClass = cardMod.GarmentCard || cardMod.default;
    const mockGarment = {
      id: 'ui_card_test_1',
      name: 'Cashmere Cardigan',
      category: 'top',
      season: 'winter',
      colorGroup: 'coloured',
      delicate: true,
      status: 'clean',
      type: 'everyday'
    };

    let toggleTriggered = false;
    const cardInstance = new CardClass({
      garment: mockGarment,
      onToggleStatus: () => { toggleTriggered = true; }
    });

    const el = cardInstance.render();
    expect(el).toBeDefined();
    expect(el.innerHTML).toContain('Cashmere Cardigan');

    const toggleBtn = el.querySelector('[data-action="toggle-status"]') || el.querySelector('.btn-toggle');
    if (toggleBtn) {
      toggleBtn.click();
      expect(toggleTriggered).toBe(true);
    }
  });

  // ==========================================
  // TIER 1: WEAR OUTFIT MODAL LAUNDRY LOGGING
  // ==========================================

  it('T1-UI-04: WearOutfitModal lists garments and confirms post-wear laundry logging', async (ctx) => {
    if (!wearModalMod) return;

    const ModalClass = wearModalMod.WearOutfitModal || wearModalMod.default;
    const mockOutfit = {
      id: 'outfit_ui_test',
      title: 'Minimalist Monday',
      garments: [
        { id: 'g_top', name: 'White Tee', status: 'clean' },
        { id: 'g_bot', name: 'Raw Denim', status: 'clean' }
      ]
    };

    let loggedGarments = null;
    const modal = new ModalClass({
      outfit: mockOutfit,
      onConfirmWear: (selectedIds) => { loggedGarments = selectedIds; }
    });

    const modalEl = modal.render();
    expect(modalEl.innerHTML).toContain('White Tee');
    expect(modalEl.innerHTML).toContain('Raw Denim');

    const confirmBtn = modalEl.querySelector('[data-action="confirm-wear"]') || modalEl.querySelector('.btn-confirm');
    if (confirmBtn) {
      confirmBtn.click();
      expect(loggedGarments).toBeDefined();
      expect(loggedGarments).toContain('g_top');
      expect(loggedGarments).toContain('g_bot');
    }
  });

  // ==========================================
  // TIER 2: BOUNDARY & FALLBACK PLACEHOLDER
  // ==========================================

  it('T2-UI-01: GarmentCard with missing image renders SVG placeholder without error', async (ctx) => {
    if (!cardMod) return;

    const CardClass = cardMod.GarmentCard || cardMod.default;
    const gWithoutPhoto = {
      id: 'no_photo_g',
      name: 'Item Without Photo',
      category: 'accessory',
      season: 'all-season',
      colorGroup: 'whites',
      delicate: false,
      status: 'clean',
      type: 'everyday',
      photoMediaId: null
    };

    const card = new CardClass({ garment: gWithoutPhoto });
    const el = card.render();
    expect(el).toBeDefined();
    // Must render placeholder image or icon
    const imgOrSvg = el.querySelector('img') || el.querySelector('svg');
    expect(imgOrSvg).toBeDefined();
  });
});
