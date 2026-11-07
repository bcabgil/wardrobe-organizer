/**
 * AddGarmentView.js - Register New Garment with Photo, Fit Video, Gemini Vision Auto-Tagger & Pill Indications
 */

import {
  wardrobeDb,
  formatCategoryLabel,
  normalizeCategoryValue
} from '../db/wardrobeDb.js';
import { generateGarmentMetadataDescription } from '../services/ai/geminiService.js';
import { MediaUrlManager, createSafeVideoPlayer } from '../utils/mediaUtils.js';
import { escapeHtml } from '../utils/domUtils.js';
import { eventBus } from '../utils/eventBus.js';
import { showToast } from '../components/Toast.js';
import { LoadingOverlay } from '../components/LoadingOverlay.js';

export class AddGarmentView {
  constructor() {
    this.container = null;
    this.urlManager = new MediaUrlManager();
    this.photoFile = null;
    this.videoFile = null;
    this.customCategories = {
      laundryCategories: ['coloured', 'whites'],
      careCategories: ['delicate', 'other'],
      occasionCategories: ['everyday', 'dress-up']
    };
    this.formState = {
      name: '',
      category: 'top',
      season: 'winter',
      tempSuitability: ['cold'],
      layerRole: 'base',
      colorGroup: 'coloured',
      careCategory: 'other',
      delicate: false,
      status: 'clean',
      type: 'everyday',
      userDetails: '',
      visualDescription: ''
    };
  }

  async mount(container) {
    this.container = container;
    const [settings, customCategories] = await Promise.all([
      wardrobeDb.getSettings(),
      wardrobeDb.getCustomCategories()
    ]);
    if (customCategories) {
      this.customCategories = customCategories;
    }
    if (settings && settings.activeSeason) {
      this.formState.season = settings.activeSeason;
      this.formState.tempSuitability = [settings.activeSeason === 'winter' ? 'cold' : 'warm'];
    }
    if (!this.customCategories.laundryCategories.includes(this.formState.colorGroup)) {
      this.formState.colorGroup = this.customCategories.laundryCategories[0] || 'coloured';
    }
    if (!this.customCategories.careCategories.includes(this.formState.careCategory)) {
      this.formState.careCategory = this.customCategories.careCategories.includes('other')
        ? 'other'
        : this.customCategories.careCategories[0] || 'other';
      this.formState.delicate = this.formState.careCategory === 'delicate';
    }
    if (!this.customCategories.occasionCategories.includes(this.formState.type)) {
      this.formState.type = this.customCategories.occasionCategories[0] || 'everyday';
    }
    this.render();
  }

  isTempSelected(val) {
    const cur = this.formState.tempSuitability;
    if (Array.isArray(cur)) return cur.includes(val);
    return cur === val;
  }

  renderCustomizableCategoryPills(groupKey, fieldName) {
    const categories = this.customCategories[groupKey] || [];
    const activeVal = normalizeCategoryValue(this.formState[fieldName]);
    const pillsHtml = categories
      .map((cat) => {
        const normCat = normalizeCategoryValue(cat);
        const isActive = normCat === activeVal;
        const label = formatCategoryLabel(cat);
        return `
          <span class="pill-chip-wrap">
            <button type="button" class="pill-btn ${isActive ? 'active' : ''}" data-val="${escapeHtml(normCat)}">${escapeHtml(label)}</button>
            <button type="button" class="pill-remove-btn" data-remove-cat="${escapeHtml(normCat)}" data-cat-group="${escapeHtml(groupKey)}" data-field="${escapeHtml(fieldName)}" title="Remove ${escapeHtml(label)}" aria-label="Remove ${escapeHtml(label)}">×</button>
          </span>
        `;
      })
      .join('');

    return `
      <div class="pill-selector" data-field="${escapeHtml(fieldName)}" data-cat-group="${escapeHtml(groupKey)}">
        ${pillsHtml}
        <button type="button" class="pill-btn pill-add-btn" data-toggle-add-cat="${escapeHtml(groupKey)}" title="Add category">+ Add</button>
      </div>
      <div class="custom-cat-input-row hidden" data-add-cat-row="${escapeHtml(groupKey)}">
        <input type="text" class="form-input custom-cat-input" data-cat-input="${escapeHtml(groupKey)}" placeholder="New category name..." />
        <button type="button" class="btn-secondary btn-confirm-cat" data-confirm-add-cat="${escapeHtml(groupKey)}" data-field="${escapeHtml(fieldName)}">Add</button>
      </div>
    `;
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <section class="view-section add-garment-view">
        <div class="section-header">
          <h2>Add to Wardrobe</h2>
          <p class="section-subtitle">Capture a photo, record a fit video on you, and tag your seasonal & care indications.</p>
        </div>

        <form id="add-garment-form" class="garment-form card-surface">
          <!-- MEDIA UPLOADERS -->
          <div class="media-upload-grid">
            <div class="media-upload-box">
              <label class="media-picker-label" for="input-garment-photo">
                <div id="photo-preview-slot" class="media-preview-slot">
                  <span class="upload-icon">📷</span>
                  <strong>Garment Photo</strong>
                  <span class="upload-hint">Tap to take photo or choose from library</span>
                </div>
              </label>
              <input type="file" id="input-garment-photo" accept="image/*" class="sr-only-input" />
            </div>

            <div class="media-upload-box">
              <label class="media-picker-label" for="input-garment-video">
                <div id="video-preview-slot" class="media-preview-slot">
                  <span class="upload-icon">🎥</span>
                  <strong>Fit Video on Me</strong>
                  <span class="upload-hint">Record or select video of how it fits</span>
                </div>
              </label>
              <input type="file" id="input-garment-video" accept="video/*" class="sr-only-input" />
            </div>
          </div>

          <!-- GARMENT NAME -->
          <div class="form-group">
            <label class="form-label" for="garment-name-input">Garment Name</label>
            <input type="text" id="garment-name-input" name="name" class="form-input" placeholder="e.g., Cream Cable-Knit Sweater" value="${escapeHtml(this.formState.name || '')}" required />
          </div>

          <!-- PILL INDICATIONS -->
          <div class="form-group">
            <span class="form-label">Season Indication</span>
            <div class="pill-selector" data-field="season">
              <button type="button" class="pill-btn ${this.formState.season === 'winter' ? 'active' : ''}" data-val="winter">❄️ Winter</button>
              <button type="button" class="pill-btn ${this.formState.season === 'summer' ? 'active' : ''}" data-val="summer">☀️ Summer</button>
              <button type="button" class="pill-btn ${this.formState.season === 'all-season' ? 'active' : ''}" data-val="all-season">🔄 All-Season</button>
            </div>
          </div>

          <div class="form-group">
            <span class="form-label">Category</span>
            <div class="pill-selector pill-grid-3" data-field="category">
              <button type="button" class="pill-btn ${this.formState.category === 'top' ? 'active' : ''}" data-val="top">👕 Top</button>
              <button type="button" class="pill-btn ${this.formState.category === 'bottom' ? 'active' : ''}" data-val="bottom">👖 Bottom</button>
              <button type="button" class="pill-btn ${this.formState.category === 'outerwear' ? 'active' : ''}" data-val="outerwear">🧥 Outerwear</button>
              <button type="button" class="pill-btn ${this.formState.category === 'one-piece' ? 'active' : ''}" data-val="one-piece">👗 One-Piece</button>
              <button type="button" class="pill-btn ${this.formState.category === 'shoes' ? 'active' : ''}" data-val="shoes">👟 Shoes</button>
              <button type="button" class="pill-btn ${this.formState.category === 'accessory' ? 'active' : ''}" data-val="accessory">🧣 Accessory</button>
            </div>
          </div>

          <div class="form-group">
            <span class="form-label">Layer</span>
            <div class="pill-selector" data-field="layerRole">
              <button type="button" class="pill-btn ${this.formState.layerRole === 'base' ? 'active' : ''}" data-val="base">👕 Base (Tee / Shirt)</button>
              <button type="button" class="pill-btn ${this.formState.layerRole === 'mid' ? 'active' : ''}" data-val="mid">🧶 Mid (Jumper / Knit / Hoodie)</button>
              <button type="button" class="pill-btn ${this.formState.layerRole === 'outer' ? 'active' : ''}" data-val="outer">🧥 Outer (Coat / Jacket)</button>
              <button type="button" class="pill-btn ${this.formState.layerRole === 'single' ? 'active' : ''}" data-val="single">✨ Single / Bottom / Shoes</button>
            </div>
          </div>

          <div class="form-group">
            <span class="form-label">Temperature Suitability <em style="color:var(--text-muted); font-weight:400;">(Select one or more)</em></span>
            <div class="pill-selector" data-field="tempSuitability" data-multi="true">
              <button type="button" class="pill-btn ${this.isTempSelected('freezing') ? 'active' : ''}" data-val="freezing">🧊 Freezing (&lt;5°C)</button>
              <button type="button" class="pill-btn ${this.isTempSelected('cold') ? 'active' : ''}" data-val="cold">❄️ Cold (5–14°C)</button>
              <button type="button" class="pill-btn ${this.isTempSelected('mild') ? 'active' : ''}" data-val="mild">🌤️ Mild (15–22°C)</button>
              <button type="button" class="pill-btn ${this.isTempSelected('warm') ? 'active' : ''}" data-val="warm">☀️ Warm (&gt;22°C)</button>
              <button type="button" class="pill-btn ${this.isTempSelected('all-temps') ? 'active' : ''}" data-val="all-temps">🌡️ All Temps</button>
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <span class="form-label">Laundry</span>
              ${this.renderCustomizableCategoryPills('laundryCategories', 'colorGroup')}
            </div>

            <div class="form-group">
              <span class="form-label">Care</span>
              ${this.renderCustomizableCategoryPills('careCategories', 'careCategory')}
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <span class="form-label">Occasion</span>
              ${this.renderCustomizableCategoryPills('occasionCategories', 'type')}
            </div>

            <div class="form-group">
              <span class="form-label">Status</span>
              <div class="pill-selector" data-field="status">
                <button type="button" class="pill-btn ${this.formState.status === 'clean' ? 'active' : ''}" data-val="clean">✓ Clean</button>
                <button type="button" class="pill-btn ${this.formState.status === 'to_wash' ? 'active' : ''}" data-val="to_wash">🧺 To Wash</button>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="garment-desc-input">Details</label>
            <textarea id="garment-desc-input" name="userDetails" class="form-textarea" rows="2" placeholder="Optional">${escapeHtml(this.formState.userDetails || '')}</textarea>
          </div>

          <div class="form-submit-row">
            <button type="submit" class="btn-primary btn-block">Save Garment to Wardrobe</button>
          </div>
        </form>
      </section>
    `;

    this.restoreMediaPreviews();
    this.bindEvents();
  }

  syncInputsToFormState() {
    if (!this.container) return;
    const nameInput = this.container.querySelector('#garment-name-input');
    const descInput = this.container.querySelector('#garment-desc-input');
    if (nameInput) this.formState.name = nameInput.value;
    if (descInput) this.formState.userDetails = descInput.value;
  }

  restoreMediaPreviews() {
    if (!this.container) return;
    const photoPreview = this.container.querySelector('#photo-preview-slot');
    const videoPreview = this.container.querySelector('#video-preview-slot');

    if (this.photoFile && photoPreview) {
      const previewUrl = this.urlManager.createUrl(this.photoFile);
      photoPreview.innerHTML = `<img src="${previewUrl}" alt="Selected Garment Preview" class="upload-preview-img" />`;
    }
    if (this.videoFile && videoPreview) {
      const videoUrl = this.urlManager.createUrl(this.videoFile);
      videoPreview.innerHTML = '';
      const player = createSafeVideoPlayer(videoUrl, this.videoFile.type || 'video/mp4');
      player.className = 'upload-preview-video';
      videoPreview.appendChild(player);
    }
  }

  bindEvents() {
    if (!this.container) return;

    // Pill selectors (with multi-select support for tempSuitability)
    this.container.querySelectorAll('.pill-selector').forEach((groupEl) => {
      const field = groupEl.dataset.field;
      const isMulti = groupEl.dataset.multi === 'true' || field === 'tempSuitability';
      groupEl.querySelectorAll('.pill-btn[data-val]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const rawVal = btn.dataset.val;
          if (isMulti) {
            let current = Array.isArray(this.formState[field])
              ? [...this.formState[field]]
              : this.formState[field]
                ? [this.formState[field]]
                : [];

            if (rawVal === 'all-temps') {
              current = ['all-temps'];
            } else {
              current = current.filter((v) => v !== 'all-temps');
              if (current.includes(rawVal)) {
                current = current.filter((v) => v !== rawVal);
              } else {
                current.push(rawVal);
              }
              if (current.length === 0) {
                current = ['all-temps'];
              }
            }

            this.formState[field] = current;
            groupEl.querySelectorAll('.pill-btn[data-val]').forEach((b) => {
              b.classList.toggle('active', current.includes(b.dataset.val));
            });
          } else {
            this.formState[field] = rawVal;
            if (field === 'careCategory') {
              this.formState.delicate = normalizeCategoryValue(rawVal) === 'delicate';
            }
            groupEl.querySelectorAll('.pill-btn[data-val]').forEach((b) => b.classList.toggle('active', b === btn));
          }
        });
      });
    });

    // Toggle inline input for adding a custom category
    this.container.querySelectorAll('[data-toggle-add-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const groupKey = btn.dataset.toggleAddCat;
        const row = this.container.querySelector(`[data-add-cat-row="${groupKey}"]`);
        if (row) {
          row.classList.toggle('hidden');
          const input = row.querySelector(`[data-cat-input="${groupKey}"]`);
          if (input && !row.classList.contains('hidden')) {
            input.focus();
          }
        }
      });
    });

    // Confirm adding a custom category
    const handleAddCategory = async (groupKey, fieldName) => {
      const input = this.container.querySelector(`[data-cat-input="${groupKey}"]`);
      const rawLabel = String(input?.value || '').trim();
      if (!rawLabel) return;
      this.syncInputsToFormState();
      const added = await wardrobeDb.addCategoryOption(groupKey, rawLabel);
      if (added) {
        this.customCategories[groupKey] = added.list;
        this.formState[fieldName] = added.value;
        if (fieldName === 'careCategory') {
          this.formState.delicate = added.value === 'delicate';
        }
        eventBus.emit('categories:changed', { groupKey, list: added.list });
        showToast(`Added "${formatCategoryLabel(added.value)}" category`, 'success');
        this.render();
      }
    };

    this.container.querySelectorAll('[data-confirm-add-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        handleAddCategory(btn.dataset.confirmAddCat, btn.dataset.field);
      });
    });

    this.container.querySelectorAll('[data-cat-input]').forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const groupKey = input.dataset.catInput;
          const confirmBtn = this.container.querySelector(`[data-confirm-add-cat="${groupKey}"]`);
          if (confirmBtn) {
            handleAddCategory(groupKey, confirmBtn.dataset.field);
          }
        }
      });
    });

    // Remove a category option
    this.container.querySelectorAll('[data-remove-cat]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const groupKey = btn.dataset.catGroup;
        const fieldName = btn.dataset.field;
        const catToRemove = btn.dataset.removeCat;
        const currentList = this.customCategories[groupKey] || [];
        if (currentList.length <= 1) {
          showToast('Keep at least one category in this group, or add another first.', 'info');
          return;
        }
        this.syncInputsToFormState();
        const updatedList = await wardrobeDb.removeCategoryOption(groupKey, catToRemove);
        this.customCategories[groupKey] = updatedList;
        if (normalizeCategoryValue(this.formState[fieldName]) === normalizeCategoryValue(catToRemove)) {
          this.formState[fieldName] = updatedList[0] || '';
          if (fieldName === 'careCategory') {
            this.formState.delicate = normalizeCategoryValue(this.formState.careCategory) === 'delicate';
          }
        }
        eventBus.emit('categories:changed', { groupKey, list: updatedList });
        showToast(`Removed "${formatCategoryLabel(catToRemove)}" category`, 'info');
        this.render();
      });
    });

    // Photo input
    const photoInput = this.container.querySelector('#input-garment-photo');
    const photoPreview = this.container.querySelector('#photo-preview-slot');

    photoInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      this.photoFile = file;
      const previewUrl = this.urlManager.createUrl(file);
      if (photoPreview) {
        photoPreview.innerHTML = `<img src="${previewUrl}" alt="Selected Garment Preview" class="upload-preview-img" />`;
      }
    });

    // Fit Video input
    const videoInput = this.container.querySelector('#input-garment-video');
    const videoPreview = this.container.querySelector('#video-preview-slot');

    videoInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      this.videoFile = file;
      const videoUrl = this.urlManager.createUrl(file);
      if (videoPreview) {
        videoPreview.innerHTML = '';
        const player = createSafeVideoPlayer(videoUrl, file.type || 'video/mp4');
        player.className = 'upload-preview-video';
        videoPreview.appendChild(player);
      }
    });

    // Form submission — single optimized AI call on save to generate AI metadata description + user details
    const form = this.container.querySelector('#add-garment-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = this.container.querySelector('#garment-name-input');
      const descInput = this.container.querySelector('#garment-desc-input');
      const userDetails = String(descInput?.value || '').trim();

      const garmentData = {
        ...this.formState,
        delicate: normalizeCategoryValue(this.formState.careCategory) === 'delicate',
        name: String(nameInput?.value || '').trim() || 'Untitled Garment',
        userDetails
      };

      try {
        LoadingOverlay.show('Generating AI metadata description & saving garment...');
        const settings = await wardrobeDb.getSettings();
        const { visualDescription } = await generateGarmentMetadataDescription(
          garmentData,
          this.photoFile,
          settings.geminiApiKey || '',
          this.videoFile
        );
        garmentData.visualDescription = visualDescription;

        const saved = await wardrobeDb.saveGarment(garmentData, this.photoFile, this.videoFile);
        eventBus.emit('wardrobe:changed', { garment: saved });
        if (saved.status === 'to_wash') {
          eventBus.emit('laundry:updated', { garment: saved });
        }
        showToast(`Added "${saved.name}" to your wardrobe!`, 'success');
        window.location.hash = '#gallery';
      } catch (err) {
        showToast(`Failed to save garment: ${err.message}`, 'error');
      } finally {
        LoadingOverlay.hide();
      }
    });
  }

  async unmount() {
    this.urlManager.revokeAll();
  }
}

export default AddGarmentView;
