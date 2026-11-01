/**
 * GarmentModal.js - Garment Detail, Inline Fit Video Player (iOS/Android playsinline), Edit & Style Anchor Modal
 */

import { escapeHtml, getCategoryIconSvg } from '../utils/domUtils.js';
import { createSafeVideoPlayer, MediaUrlManager } from '../utils/mediaUtils.js';
import { wardrobeDb } from '../db/wardrobeDb.js';
import { analyzeGarmentPhoto } from '../services/ai/geminiService.js';
import { eventBus } from '../utils/eventBus.js';
import { showToast } from './Toast.js';
import { LoadingOverlay } from './LoadingOverlay.js';

export class GarmentModal {
  constructor(options = {}) {
    this.garment = options.garment || {};
    this.onClose = options.onClose || null;
    this.onUpdated = options.onUpdated || null;
    this.onDeleted = options.onDeleted || null;
    this.onStyleWithItem = options.onStyleWithItem || null;
    this.urlManager = new MediaUrlManager();
    this.activeTab = 'photo'; // 'photo' | 'video' | 'edit'
    this.modalEl = null;
  }

  async open(container = document.body) {
    const g = this.garment;
    let photoUrl = null;
    let videoUrl = null;
    let videoMime = 'video/mp4';

    if (g.photoMediaId) {
      const blob = await wardrobeDb.getMediaBlob(g.photoMediaId).catch(() => null);
      if (blob) photoUrl = this.urlManager.createUrl(blob);
    }

    if (g.videoMediaId) {
      const mediaRec = await wardrobeDb.getMedia(g.videoMediaId).catch(() => null);
      const blob = await wardrobeDb.getMediaBlob(g.videoMediaId).catch(() => null);
      if (blob) {
        videoUrl = this.urlManager.createUrl(blob);
        videoMime = (mediaRec && mediaRec.mimeType) || blob.type || 'video/mp4';
      }
    }

    this.modalEl = this.render({ photoUrl, videoUrl, videoMime });
    container.appendChild(this.modalEl);
    return this.modalEl;
  }

  render({ photoUrl = null, videoUrl = null, videoMime = 'video/mp4' } = {}) {
    const g = this.garment || {};
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-backdrop';
    wrapper.dataset.modal = 'garment-detail';

    const isClean = g.status !== 'to_wash';

    wrapper.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-header">
          <h3 class="modal-title">${escapeHtml(g.name || 'Garment Details')}</h3>
          <button type="button" class="modal-close-btn" data-action="close-modal" aria-label="Close">✕</button>
        </div>

        <div class="modal-tabs">
          <button type="button" class="modal-tab active" data-tab="photo">📷 Photo</button>
          <button type="button" class="modal-tab" data-tab="video">🎥 Fit Video ${videoUrl ? '✓' : ''}</button>
          <button type="button" class="modal-tab" data-tab="edit">✎ Edit</button>
        </div>

        <div class="modal-body">
          <!-- PHOTO PANEL -->
          <div class="modal-panel" data-panel="photo">
            <div class="modal-media-stage">
              ${
                photoUrl
                  ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(g.name)}" class="modal-detail-img" />`
                  : `<div class="modal-placeholder-box">${getCategoryIconSvg(g.category)}</div>`
              }
            </div>
            <div class="modal-attributes-grid">
              <div class="attr-pill"><span>Season</span><strong>${escapeHtml(g.season || 'all-season')}</strong></div>
              <div class="attr-pill"><span>Category</span><strong>${escapeHtml(g.category || 'top')}</strong></div>
              <div class="attr-pill"><span>Layer Role</span><strong>${escapeHtml(g.layerRole || 'base')}</strong></div>
              <div class="attr-pill"><span>Temp Range</span><strong>${escapeHtml(g.tempSuitability || 'all-temps')}</strong></div>
              <div class="attr-pill"><span>Occasion</span><strong>${escapeHtml(g.type || 'everyday')}</strong></div>
              <div class="attr-pill"><span>Color Group</span><strong>${escapeHtml(g.colorGroup || 'coloured')}</strong></div>
              <div class="attr-pill"><span>Delicate</span><strong>${g.delicate ? 'Yes (Delicate)' : 'No (Regular)'}</strong></div>
              <div class="attr-pill"><span>Status</span><strong>${isClean ? 'Clean' : 'To Wash'}</strong></div>
            </div>
            ${
              g.visualDescription
                ? `<p class="modal-visual-desc">${escapeHtml(g.visualDescription)}</p>`
                : ''
            }
          </div>

          <!-- FIT VIDEO PANEL -->
          <div class="modal-panel hidden" data-panel="video">
            <div class="modal-video-container" id="modal-video-slot">
              ${
                videoUrl
                  ? ''
                  : `<div class="empty-video-notice"><p>No fit video attached to this garment yet.</p><p class="text-muted">You can upload a fit video in the Edit tab below.</p></div>`
              }
            </div>
          </div>

          <!-- EDIT PANEL -->
          <div class="modal-panel hidden" data-panel="edit">
            <form id="edit-garment-form" class="garment-form">
              <label class="form-label">Name
                <input type="text" name="name" class="form-input" value="${escapeHtml(g.name || '')}" required />
              </label>
              <div class="form-row-2">
                <label class="form-label">Season
                  <select name="season" class="form-select">
                    <option value="winter" ${g.season === 'winter' ? 'selected' : ''}>❄️ Winter</option>
                    <option value="summer" ${g.season === 'summer' ? 'selected' : ''}>☀️ Summer</option>
                    <option value="all-season" ${g.season === 'all-season' ? 'selected' : ''}>🔄 All-Season</option>
                  </select>
                </label>
                <label class="form-label">Category
                  <select name="category" class="form-select">
                    <option value="top" ${g.category === 'top' ? 'selected' : ''}>Top</option>
                    <option value="bottom" ${g.category === 'bottom' ? 'selected' : ''}>Bottom</option>
                    <option value="outerwear" ${g.category === 'outerwear' ? 'selected' : ''}>Outerwear</option>
                    <option value="one-piece" ${g.category === 'one-piece' ? 'selected' : ''}>One-Piece</option>
                    <option value="shoes" ${g.category === 'shoes' ? 'selected' : ''}>Shoes</option>
                    <option value="accessory" ${g.category === 'accessory' ? 'selected' : ''}>Accessory</option>
                  </select>
                </label>
              </div>
              <div class="form-row-2">
                <label class="form-label">Layering Role
                  <select name="layerRole" class="form-select">
                    <option value="base" ${g.layerRole === 'base' ? 'selected' : ''}>👕 Base Layer (Tee/Shirt)</option>
                    <option value="mid" ${g.layerRole === 'mid' ? 'selected' : ''}>🧶 Mid Layer (Jumper/Knit)</option>
                    <option value="outer" ${g.layerRole === 'outer' ? 'selected' : ''}>🧥 Outer Layer (Coat/Jacket)</option>
                    <option value="single" ${g.layerRole === 'single' ? 'selected' : ''}>✨ Single / Bottom / Shoes</option>
                  </select>
                </label>
                <label class="form-label">Temperature Suitability
                  <select name="tempSuitability" class="form-select">
                    <option value="freezing" ${g.tempSuitability === 'freezing' ? 'selected' : ''}>🧊 Freezing (&lt;5°C)</option>
                    <option value="cold" ${g.tempSuitability === 'cold' ? 'selected' : ''}>❄️ Cold (5–14°C)</option>
                    <option value="mild" ${g.tempSuitability === 'mild' ? 'selected' : ''}>🌤️ Mild (15–22°C)</option>
                    <option value="warm" ${g.tempSuitability === 'warm' ? 'selected' : ''}>☀️ Warm (&gt;22°C)</option>
                    <option value="all-temps" ${(!g.tempSuitability || g.tempSuitability === 'all-temps') ? 'selected' : ''}>🌡️ All Temps</option>
                  </select>
                </label>
              </div>
              <div class="form-row-2">
                <label class="form-label">Color Group
                  <select name="colorGroup" class="form-select">
                    <option value="coloured" ${g.colorGroup === 'coloured' ? 'selected' : ''}>🎨 Coloured</option>
                    <option value="whites" ${g.colorGroup === 'whites' ? 'selected' : ''}>⚪ Whites</option>
                  </select>
                </label>
                <label class="form-label">Delicate Care
                  <select name="delicate" class="form-select">
                    <option value="false" ${!g.delicate ? 'selected' : ''}>No (Regular)</option>
                    <option value="true" ${g.delicate ? 'selected' : ''}>🫧 Yes (Delicate)</option>
                  </select>
                </label>
              </div>
              <div class="form-row-2">
                <label class="form-label">Type / Occasion
                  <select name="type" class="form-select">
                    <option value="everyday" ${g.type === 'everyday' ? 'selected' : ''}>Everyday</option>
                    <option value="gym" ${g.type === 'gym' ? 'selected' : ''}>Gym</option>
                    <option value="dress-up" ${g.type === 'dress-up' ? 'selected' : ''}>Dress-up</option>
                  </select>
                </label>
                <label class="form-label">Status
                  <select name="status" class="form-select">
                    <option value="clean" ${isClean ? 'selected' : ''}>Clean</option>
                    <option value="to_wash" ${!isClean ? 'selected' : ''}>To Wash</option>
                  </select>
                </label>
              </div>
              <label class="form-label">Update Fit Video (optional)
                <input type="file" name="newVideo" id="edit-new-video-input" accept="video/*" class="form-input" />
              </label>
              <button type="button" class="btn-ai-tag" data-action="reanalyze-ai">
                ✨ Analyze Photo &amp; Fit Video with Gemini Vision
              </button>
              <label class="form-label">Style &amp; Fit Proportions Notes
                <textarea name="visualDescription" class="form-textarea" rows="3">${escapeHtml(g.visualDescription || '')}</textarea>
              </label>
              <div class="modal-edit-actions">
                <button type="submit" class="btn-primary">Save Changes</button>
                <button type="button" class="btn-danger" data-action="delete-garment">Delete Garment</button>
              </div>
            </form>
          </div>
        </div>

        <div class="modal-footer">
          ${
            isClean
              ? `<button type="button" class="btn-primary" data-action="style-anchor">✨ Build Tomorrow's Outfit With This</button>`
              : `<button type="button" class="btn-secondary" data-action="quick-clean">✓ Mark Clean First to Style</button>`
          }
        </div>
      </div>
    `;

    // Mount safe inline video element if videoUrl exists
    if (videoUrl) {
      const slot = wrapper.querySelector('#modal-video-slot');
      if (slot) {
        const videoPlayer = createSafeVideoPlayer(videoUrl, videoMime);
        videoPlayer.className = 'modal-fit-video';
        slot.appendChild(videoPlayer);
      }
    }

    // Tab switching
    const tabs = wrapper.querySelectorAll('.modal-tab');
    const panels = wrapper.querySelectorAll('.modal-panel');
    tabs.forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const target = tabBtn.dataset.tab;
        tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === target));
        panels.forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== target));
      });
    });

    // Close handlers
    wrapper.querySelector('[data-action="close-modal"]')?.addEventListener('click', () => this.close());
    wrapper.addEventListener('click', (e) => {
      if (e.target === wrapper) this.close();
    });

    // Style with item
    wrapper.querySelector('[data-action="style-anchor"]')?.addEventListener('click', () => {
      const id = g.id;
      this.close();
      if (typeof this.onStyleWithItem === 'function') {
        this.onStyleWithItem(id);
      } else if (typeof window !== 'undefined') {
        window.location.hash = `#tomorrow?anchor=${encodeURIComponent(id)}&occasion=${encodeURIComponent(g.type || 'everyday')}`;
      }
    });

    // Quick clean button
    wrapper.querySelector('[data-action="quick-clean"]')?.addEventListener('click', async () => {
      await wardrobeDb.updateGarment(g.id, { status: 'clean' });
      eventBus.emit('wardrobe:changed', { id: g.id });
      eventBus.emit('laundry:updated', { id: g.id });
      showToast(`${g.name} marked clean!`, 'success');
      if (typeof this.onUpdated === 'function') this.onUpdated();
      this.close();
    });

    // Re-analyze Photo & Fit Video with Gemini Vision inside Edit tab
    wrapper.querySelector('[data-action="reanalyze-ai"]')?.addEventListener('click', async () => {
      try {
        LoadingOverlay.show('Analyzing garment photo & fit video with Gemini Vision...');
        const settings = await wardrobeDb.getSettings();
        const photoBlob = g.photoMediaId ? await wardrobeDb.getMediaBlob(g.photoMediaId).catch(() => null) : null;
        const newVideoInput = wrapper.querySelector('#edit-new-video-input');
        const uploadedVideoFile = newVideoInput?.files?.[0] || null;
        const videoBlob =
          uploadedVideoFile ||
          (g.videoMediaId ? await wardrobeDb.getMediaBlob(g.videoMediaId).catch(() => null) : null);

        if (!photoBlob && !videoBlob) {
          LoadingOverlay.hide();
          showToast('No photo or fit video found on this garment to analyze.', 'error');
          return;
        }

        const tagResult = await analyzeGarmentPhoto(photoBlob, settings.geminiApiKey || '', videoBlob);
        const editFormEl = wrapper.querySelector('#edit-garment-form');
        if (editFormEl) {
          if (tagResult.name) editFormEl.querySelector('[name="name"]').value = tagResult.name;
          if (tagResult.visualDescription) {
            editFormEl.querySelector('[name="visualDescription"]').value = tagResult.visualDescription;
          }
          ['season', 'category', 'layerRole', 'tempSuitability', 'colorGroup', 'type'].forEach((f) => {
            const sel = editFormEl.querySelector(`[name="${f}"]`);
            if (sel && tagResult[f]) sel.value = String(tagResult[f]);
          });
          const delSel = editFormEl.querySelector('[name="delicate"]');
          if (delSel && tagResult.delicate !== undefined) delSel.value = String(Boolean(tagResult.delicate));
        }
        LoadingOverlay.hide();
        showToast(
          tagResult.analyzedFitVideo
            ? '✨ Updated attributes & fit proportions from Photo + Fit Video! Click Save Changes.'
            : '✨ Updated attributes with Gemini Vision! Click Save Changes.',
          'success'
        );
      } catch (err) {
        LoadingOverlay.hide();
        showToast(`AI analysis failed: ${err.message}`, 'error');
      }
    });

    // Edit form submit
    const editForm = wrapper.querySelector('#edit-garment-form');
    if (editForm) {
      editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(editForm);
        const updates = {
          name: String(fd.get('name') || '').trim() || g.name,
          season: fd.get('season'),
          category: fd.get('category'),
          layerRole: fd.get('layerRole') || g.layerRole || 'base',
          tempSuitability: fd.get('tempSuitability') || g.tempSuitability || 'all-temps',
          colorGroup: fd.get('colorGroup'),
          delicate: fd.get('delicate') === 'true',
          type: fd.get('type'),
          status: fd.get('status'),
          visualDescription: String(fd.get('visualDescription') || '').trim()
        };

        const videoFile = fd.get('newVideo');
        if (videoFile && videoFile instanceof Blob && videoFile.size > 0) {
          const savedVid = await wardrobeDb.saveMedia({
            garmentId: g.id,
            type: 'video',
            mimeType: videoFile.type || 'video/mp4',
            data: videoFile
          });
          updates.videoMediaId = savedVid.id;
        }

        await wardrobeDb.updateGarment(g.id, updates);
        eventBus.emit('wardrobe:changed', { id: g.id });
        eventBus.emit('laundry:updated', { id: g.id });
        showToast('Garment updated!', 'success');
        if (typeof this.onUpdated === 'function') this.onUpdated();
        this.close();
      });
    }

    // Delete button
    wrapper.querySelector('[data-action="delete-garment"]')?.addEventListener('click', async () => {
      await wardrobeDb.deleteGarment(g.id);
      eventBus.emit('wardrobe:changed', { id: g.id });
      eventBus.emit('laundry:updated', { id: g.id });
      showToast('Garment removed from wardrobe', 'info');
      if (typeof this.onDeleted === 'function') this.onDeleted(g.id);
      this.close();
    });

    return wrapper;
  }

  close() {
    this.urlManager.revokeAll();
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }
    this.modalEl = null;
    if (typeof this.onClose === 'function') {
      this.onClose();
    }
  }
}

export default GarmentModal;
