/**
 * AddGarmentView.js - Register New Garment with Photo, Fit Video, Gemini Vision Auto-Tagger & Pill Indications
 */

import { wardrobeDb } from '../db/wardrobeDb.js';
import { analyzeGarmentPhoto } from '../services/ai/geminiService.js';
import { MediaUrlManager, createSafeVideoPlayer } from '../utils/mediaUtils.js';
import { eventBus } from '../utils/eventBus.js';
import { showToast } from '../components/Toast.js';
import { LoadingOverlay } from '../components/LoadingOverlay.js';

export class AddGarmentView {
  constructor() {
    this.container = null;
    this.urlManager = new MediaUrlManager();
    this.photoFile = null;
    this.videoFile = null;
    this.formState = {
      name: '',
      category: 'top',
      season: 'winter',
      tempSuitability: ['cold'],
      layerRole: 'base',
      colorGroup: 'coloured',
      delicate: false,
      status: 'clean',
      type: 'everyday',
      visualDescription: ''
    };
  }

  async mount(container) {
    this.container = container;
    const settings = await wardrobeDb.getSettings();
    if (settings && settings.activeSeason) {
      this.formState.season = settings.activeSeason;
      this.formState.tempSuitability = [settings.activeSeason === 'winter' ? 'cold' : 'warm'];
    }
    this.render();
  }

  isTempSelected(val) {
    const cur = this.formState.tempSuitability;
    if (Array.isArray(cur)) return cur.includes(val);
    return cur === val;
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
              <button type="button" id="btn-ai-autotag" class="btn-ai-tag" disabled>
                ✨ Auto-Fill Attributes with AI
              </button>
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
            <input type="text" id="garment-name-input" name="name" class="form-input" placeholder="e.g., Cream Cable-Knit Sweater" required />
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
              <div class="pill-selector" data-field="colorGroup">
                <button type="button" class="pill-btn ${this.formState.colorGroup === 'coloured' ? 'active' : ''}" data-val="coloured">🎨 Coloured</button>
                <button type="button" class="pill-btn ${this.formState.colorGroup === 'whites' ? 'active' : ''}" data-val="whites">⚪ Whites</button>
              </div>
            </div>

            <div class="form-group">
              <span class="form-label">Care</span>
              <div class="pill-selector" data-field="delicate">
                <button type="button" class="pill-btn ${!this.formState.delicate ? 'active' : ''}" data-val="false">No</button>
                <button type="button" class="pill-btn ${this.formState.delicate ? 'active' : ''}" data-val="true">🫧 Yes</button>
              </div>
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <span class="form-label">Occasion</span>
              <div class="pill-selector" data-field="type">
                <button type="button" class="pill-btn ${this.formState.type === 'everyday' ? 'active' : ''}" data-val="everyday">Everyday</button>
                <button type="button" class="pill-btn ${this.formState.type === 'gym' ? 'active' : ''}" data-val="gym">Gym</button>
                <button type="button" class="pill-btn ${this.formState.type === 'dress-up' ? 'active' : ''}" data-val="dress-up">Dress-up</button>
              </div>
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
            <label class="form-label" for="garment-desc-input">Visual Style & Color Notes (Used by AI Outfit Stylist)</label>
            <textarea id="garment-desc-input" name="visualDescription" class="form-textarea" rows="2" placeholder="e.g., Warm camel wool coat with relaxed lapels, pairs well with navy or cream knits..."></textarea>
          </div>

          <div class="form-submit-row">
            <button type="submit" class="btn-primary btn-block">Save Garment to Wardrobe</button>
          </div>
        </form>
      </section>
    `;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;

    // Pill selectors (with multi-select support for tempSuitability)
    this.container.querySelectorAll('.pill-selector').forEach((groupEl) => {
      const field = groupEl.dataset.field;
      const isMulti = groupEl.dataset.multi === 'true' || field === 'tempSuitability';
      groupEl.querySelectorAll('.pill-btn').forEach((btn) => {
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
            groupEl.querySelectorAll('.pill-btn').forEach((b) => {
              b.classList.toggle('active', current.includes(b.dataset.val));
            });
          } else {
            this.formState[field] = field === 'delicate' ? rawVal === 'true' : rawVal;
            groupEl.querySelectorAll('.pill-btn').forEach((b) => b.classList.toggle('active', b === btn));
          }
        });
      });
    });

    // Photo input
    const photoInput = this.container.querySelector('#input-garment-photo');
    const photoPreview = this.container.querySelector('#photo-preview-slot');
    const autoTagBtn = this.container.querySelector('#btn-ai-autotag');

    const updateAutoTagButtonState = () => {
      if (!autoTagBtn) return;
      autoTagBtn.disabled = !(this.photoFile || this.videoFile);
      if (this.photoFile && this.videoFile) {
        autoTagBtn.textContent = '✨ Auto-Fill with Gemini Vision (Photo + Fit Video)';
      } else if (this.videoFile) {
        autoTagBtn.textContent = '✨ Auto-Fill with Gemini Vision (Fit Video)';
      } else {
        autoTagBtn.textContent = '✨ Auto-Fill with Gemini Vision';
      }
    };

    photoInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      this.photoFile = file;
      const previewUrl = this.urlManager.createUrl(file);
      if (photoPreview) {
        photoPreview.innerHTML = `<img src="${previewUrl}" alt="Selected Garment Preview" class="upload-preview-img" />`;
      }
      updateAutoTagButtonState();
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
      updateAutoTagButtonState();
    });

    // AI Auto-Tag button
    autoTagBtn?.addEventListener('click', async () => {
      if (!this.photoFile && !this.videoFile) return;
      try {
        LoadingOverlay.show(
          this.videoFile
            ? 'Analyzing garment photo & fit video proportions with AI...'
            : 'Analyzing garment photo with AI...'
        );
        const settings = await wardrobeDb.getSettings();
        const tagResult = await analyzeGarmentPhoto(
          this.photoFile,
          settings.geminiApiKey || '',
          this.videoFile
        );

        // Populate form fields
        const nameInput = this.container.querySelector('#garment-name-input');
        const descInput = this.container.querySelector('#garment-desc-input');
        if (nameInput && tagResult.name) nameInput.value = tagResult.name;
        if (descInput && tagResult.visualDescription) descInput.value = tagResult.visualDescription;

        ['category', 'season', 'tempSuitability', 'layerRole', 'colorGroup', 'delicate', 'type'].forEach((field) => {
          if (tagResult[field] !== undefined) {
            if (field === 'tempSuitability') {
              const nextArr = Array.isArray(tagResult[field])
                ? tagResult[field]
                : [String(tagResult[field])];
              this.formState.tempSuitability = nextArr;
              const groupEl = this.container.querySelector(`.pill-selector[data-field="tempSuitability"]`);
              if (groupEl) {
                groupEl.querySelectorAll('.pill-btn').forEach((btn) => {
                  btn.classList.toggle('active', nextArr.includes(btn.dataset.val));
                });
              }
            } else {
              this.formState[field] = tagResult[field];
              const groupEl = this.container.querySelector(`.pill-selector[data-field="${field}"]`);
              if (groupEl) {
                groupEl.querySelectorAll('.pill-btn').forEach((btn) => {
                  btn.classList.toggle('active', btn.dataset.val === String(tagResult[field]));
                });
              }
            }
          }
        });

        showToast(
          tagResult.engine === 'gemini'
            ? tagResult.analyzedFitVideo
              ? '✨ Auto-filled attributes & on-body fit profile from Photo + Fit Video!'
              : '✨ Auto-filled attributes with Gemini Vision!'
            : 'Auto-filled attributes (Configure Gemini API Key in Backup/Settings for full AI Vision)',
          'success'
        );
      } catch (err) {
        showToast(`Could not auto-analyze photo: ${err.message}`, 'error');
      } finally {
        LoadingOverlay.hide();
      }
    });

    // Form submission
    const form = this.container.querySelector('#add-garment-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = this.container.querySelector('#garment-name-input');
      const descInput = this.container.querySelector('#garment-desc-input');

      const garmentData = {
        ...this.formState,
        name: String(nameInput?.value || '').trim() || 'Untitled Garment',
        visualDescription: String(descInput?.value || '').trim()
      };

      try {
        LoadingOverlay.show('Saving garment & media to your phone...');
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
