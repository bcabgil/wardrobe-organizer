/**
 * TomorrowStylistView.js - "What Should I Wear Tomorrow?" AI Fashion Stylist Studio
 * Combines clean in-season clothes, tomorrow's weather forecast, optional anchor garment,
 * inline fit video previews, and one-tap "Wear This Outfit" status updater.
 */

import { wardrobeDb } from '../db/wardrobeDb.js';
import { suggestTomorrowOutfits } from '../services/ai/geminiService.js';
import { getTomorrowWeather } from '../services/weather/weatherService.js';
import { MediaUrlManager, createSafeVideoPlayer } from '../utils/mediaUtils.js';
import { escapeHtml, getCategoryIconSvg } from '../utils/domUtils.js';
import { eventBus } from '../utils/eventBus.js';
import { WearOutfitModal } from '../components/WearOutfitModal.js';
import { showToast } from '../components/Toast.js';
import { LoadingOverlay } from '../components/LoadingOverlay.js';

export class TomorrowStylistView {
  constructor() {
    this.container = null;
    this.urlManager = new MediaUrlManager();
    this.garments = [];
    this.settings = {};
    this.weather = null;
    this.occasion = 'everyday';
    this.anchorGarmentId = '';
    this.weatherNote = '';
    this.includeOuterwear = false;
    this.lastResult = null;
  }

  async mount(container, params = {}) {
    this.container = container;
    if (params.occasion) this.occasion = params.occasion;
    if (params.anchor) this.anchorGarmentId = params.anchor;

    const [garments, settings] = await Promise.all([
      wardrobeDb.getAllGarments(),
      wardrobeDb.getSettings()
    ]);
    this.garments = garments || [];
    this.settings = settings || {};

    this.weather = await getTomorrowWeather({
      cityName: this.settings.location || '',
      activeSeason: this.settings.activeSeason || 'winter'
    });

    await this.render();
    // Automatically generate initial outfit suggestions
    await this.generateSuggestions();
  }

  getCleanInSeasonGarments() {
    const activeSeason = this.settings.activeSeason || 'winter';
    return this.garments.filter(
      (g) => g.status === 'clean' && (!g.season || g.season === activeSeason || g.season === 'all-season')
    );
  }

  async render() {
    if (!this.container) return;
    const cleanGarments = this.getCleanInSeasonGarments();
    const activeSeason = this.settings.activeSeason || 'winter';

    const anchorOptionsHtml = cleanGarments
      .map(
        (g) =>
          `<option value="${escapeHtml(g.id)}" ${this.anchorGarmentId === g.id ? 'selected' : ''}>${escapeHtml(g.name)} (${escapeHtml(g.category)})</option>`
      )
      .join('');

    const w = this.weather || {};

    this.container.innerHTML = `
      <section class="view-section stylist-view">
        <div class="section-header">
          <h2>What Should I Wear Tomorrow?</h2>
          <p class="section-subtitle">AI-styled combinations from your <strong>${cleanGarments.length} clean ${escapeHtml(activeSeason)}</strong> pieces.</p>
        </div>

        <!-- WEATHER BANNER -->
        <div class="weather-card">
          <div class="weather-icon">${w.icon || '🌤️'}</div>
          <div class="weather-details">
            <div class="weather-title">Tomorrow's Forecast • ${escapeHtml(w.cityName || 'Local')}</div>
            <div class="weather-summary">${escapeHtml(w.summary || `${w.condition || 'Mild'}, ${w.tempMin ?? 10}°C – ${w.tempMax ?? 18}°C`)}</div>
          </div>
        </div>

        <!-- STYLIST CONTROLS -->
        <div class="stylist-controls card-surface">
          <div class="form-group">
            <span class="form-label">Tomorrow's Occasion</span>
            <div class="pill-selector" id="stylist-occasion-pills">
              <button type="button" class="pill-btn ${this.occasion === 'everyday' ? 'active' : ''}" data-val="everyday">☕ Everyday</button>
              <button type="button" class="pill-btn ${this.occasion === 'gym' ? 'active' : ''}" data-val="gym">🏋️ Gym</button>
              <button type="button" class="pill-btn ${this.occasion === 'dress-up' ? 'active' : ''}" data-val="dress-up">🥂 Dress-up</button>
            </div>
          </div>

          <div class="form-row-2">
            <label class="form-label">Anchor Piece (Optional)
              <select id="stylist-anchor-select" class="form-select">
                <option value="">✨ Let AI choose freely</option>
                ${anchorOptionsHtml}
              </select>
            </label>

            <label class="form-label">Extra Note / Vibe
              <input type="text" id="stylist-note-input" class="form-input" placeholder="e.g., Office meetings then dinner" value="${escapeHtml(this.weatherNote)}" />
            </label>
          </div>

          <label class="form-label" style="flex-direction:row; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" id="stylist-include-outerwear" ${this.includeOuterwear ? 'checked' : ''} style="width:17px; height:17px; accent-color:var(--accent-gold); cursor:pointer;" />
            <span>🧥 Include Jacket / Outerwear in Suggestions <em style="color:var(--text-muted); font-weight:400;">(Optional — off by default)</em></span>
          </label>

          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button type="button" id="btn-generate-outfits" class="btn-primary" style="flex:2;">
              ✨ Suggest Outfits for Tomorrow
            </button>
            <button type="button" id="btn-force-refresh-outfits" class="btn-secondary" style="flex:1;" title="Bypass cache and request fresh combinations from AI">
              🔄 Refresh Ideas
            </button>
          </div>
        </div>

        <!-- OUTFIT RESULTS MOUNT -->
        <div id="stylist-outfits-mount" class="outfits-list"></div>
      </section>
    `;

    // Bind occasion pills
    this.container.querySelectorAll('#stylist-occasion-pills .pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.occasion = btn.dataset.val;
        this.container
          .querySelectorAll('#stylist-occasion-pills .pill-btn')
          .forEach((b) => b.classList.toggle('active', b === btn));
        this.generateSuggestions({ forceRefresh: false });
      });
    });

    // Bind anchor select, note & optional outerwear toggle
    this.container.querySelector('#stylist-anchor-select')?.addEventListener('change', (e) => {
      this.anchorGarmentId = e.target.value || '';
    });

    this.container.querySelector('#stylist-note-input')?.addEventListener('input', (e) => {
      this.weatherNote = e.target.value || '';
    });

    this.container.querySelector('#stylist-include-outerwear')?.addEventListener('change', (e) => {
      this.includeOuterwear = Boolean(e.target.checked);
      this.generateSuggestions({ forceRefresh: false });
    });

    this.container.querySelector('#btn-generate-outfits')?.addEventListener('click', () => {
      this.generateSuggestions({ forceRefresh: false });
    });

    this.container.querySelector('#btn-force-refresh-outfits')?.addEventListener('click', () => {
      this.generateSuggestions({ forceRefresh: true });
    });
  }

  async generateSuggestions({ forceRefresh = false } = {}) {
    if (!this.container) return;
    const outfitsMount = this.container.querySelector('#stylist-outfits-mount');
    if (!outfitsMount) return;

    this.urlManager.revokeAll();
    LoadingOverlay.show(
      forceRefresh ? 'Generating fresh AI outfit combinations...' : 'Curating tomorrow\'s outfit combinations...'
    );

    try {
      // Always fetch latest settings, garments, wear counts, and persisted cache from IndexedDB
      const [latestGarments, latestSettings, wearCounts, persistedCache] = await Promise.all([
        wardrobeDb.getAllGarments(),
        wardrobeDb.getSettings(),
        wardrobeDb.getCombinationWearCounts(),
        wardrobeDb.getSetting('outfitSuggestionsCache', {})
      ]);
      this.garments = latestGarments || [];
      this.settings = latestSettings || {};

      const result = await suggestTomorrowOutfits({
        garments: this.garments,
        occasion: this.occasion,
        activeSeason: this.settings.activeSeason || 'winter',
        anchorGarmentId: this.anchorGarmentId || null,
        weatherNote: this.weatherNote,
        weatherData: this.weather,
        apiKey: this.settings.geminiApiKey || '',
        wearCounts: wearCounts || {},
        forceRefresh,
        persistedCache: persistedCache || {},
        includeOuterwear: this.includeOuterwear
      });

      // Persist newly computed outfits in IndexedDB cache (unless it was an API error fallback)
      if (
        !result.fromCache &&
        result.cacheKey &&
        !result.fallbackReason &&
        Array.isArray(result.outfits) &&
        result.outfits.length > 0
      ) {
        const nextCache = { ...(persistedCache || {}) };
        nextCache[result.cacheKey] = {
          engine: result.engine,
          outfits: result.outfits,
          message: result.message,
          cachedAt: new Date().toISOString()
        };
        // Keep max 20 recent cache entries
        const keys = Object.keys(nextCache);
        if (keys.length > 20) {
          delete nextCache[keys[0]];
        }
        await wardrobeDb.setSetting('outfitSuggestionsCache', nextCache).catch(() => {});
      }

      this.lastResult = result;
      await this.renderOutfits(result, outfitsMount);
    } catch (err) {
      outfitsMount.innerHTML = `<div class="empty-state-card"><p>Could not generate outfits: ${escapeHtml(err.message)}</p></div>`;
    } finally {
      LoadingOverlay.hide();
    }
  }

  async renderOutfits(result, outfitsMount) {
    outfitsMount.innerHTML = '';

    if (!result || !Array.isArray(result.outfits) || result.outfits.length === 0) {
      outfitsMount.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-icon">✨</div>
          <h3>No Complete Outfits Available Yet</h3>
          <p>${escapeHtml(result?.message || 'Add at least a clean top and bottom (or one-piece) for this season to get outfit combinations.')}</p>
          <a href="#add" class="btn-primary">＋ Add Clean Clothes</a>
        </div>
      `;
      return;
    }

    const hasApiKey = Boolean(this.settings.geminiApiKey && String(this.settings.geminiApiKey).trim());
    const cacheTag = result.fromCache ? ' • ⚡ Loaded from Cache (Sorted by Most Worn)' : ' • Sorted by Most Worn';
    const engineBadge =
      result.engine === 'gemini'
        ? `<span class="engine-badge engine-gemini">✨ Styled by Google Gemini AI${escapeHtml(cacheTag)}</span>`
        : hasApiKey && result.fallbackReason
          ? `<span class="engine-badge engine-offline">⚡ Offline Rule Stylist (Gemini Fallback: ${escapeHtml(result.fallbackReason)})</span>`
          : `<span class="engine-badge engine-offline">⚡ Smart Rule Stylist${escapeHtml(cacheTag)}</span>`;

    const headerBanner = document.createElement('div');
    headerBanner.className = 'stylist-engine-row';
    headerBanner.innerHTML = engineBadge;
    outfitsMount.appendChild(headerBanner);

    const garmentMap = new Map(this.garments.map((g) => [g.id, g]));

    for (const outfit of result.outfits) {
      const outfitGarments = (outfit.garmentIds || [])
        .map((id) => garmentMap.get(id))
        .filter(Boolean);

      const cardEl = document.createElement('article');
      cardEl.className = 'outfit-card card-surface';

      // Prepare thumbnails & fit videos
      const piecesHtmlPromises = outfitGarments.map(async (g) => {
        let photoUrl = null;
        if (g.photoMediaId) {
          const blob = await wardrobeDb.getMediaBlob(g.photoMediaId).catch(() => null);
          if (blob) photoUrl = this.urlManager.createUrl(blob);
        }

        return `
          <div class="outfit-piece-item" data-garment-id="${escapeHtml(g.id)}">
            <div class="outfit-piece-thumb">
              ${
                photoUrl
                  ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(g.name)}" />`
                  : `<div class="outfit-piece-placeholder">${getCategoryIconSvg(g.category)}</div>`
              }
              ${
                g.videoMediaId
                  ? `<button type="button" class="btn-preview-fit" data-video-media-id="${escapeHtml(g.videoMediaId)}" data-garment-name="${escapeHtml(g.name)}">▶ Fit Video</button>`
                  : ''
              }
            </div>
            <div class="outfit-piece-name">${escapeHtml(g.name)}</div>
            <div class="outfit-piece-cat">${escapeHtml(g.category)}</div>
          </div>
        `;
      });

      const piecesHtml = (await Promise.all(piecesHtmlPromises)).join('');
      const wornCount = typeof outfit.wornCount === 'number' ? outfit.wornCount : 0;
      const wornBadgeHtml =
        wornCount > 0
          ? `<span class="badge-chip" style="color:var(--accent-gold); border:1px solid rgba(229,195,145,0.45); font-weight:700;">❤️ Worn ${wornCount}×</span>`
          : `<span class="badge-chip">✨ Unworn Combo</span>`;

      cardEl.innerHTML = `
        <div class="outfit-card-header">
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span class="outfit-kicker">${escapeHtml(this.occasion.toUpperCase())} LOOK</span>
              ${wornBadgeHtml}
            </div>
            <h3 class="outfit-title">${escapeHtml(outfit.title || 'Curated Combination')}</h3>
          </div>
          <button type="button" class="btn-primary btn-wear-outfit">Wear This Outfit</button>
        </div>

        <div class="outfit-pieces-grid">
          ${piecesHtml}
        </div>

        <div class="outfit-video-drawer hidden" data-role="fit-video-drawer"></div>

        <div class="outfit-rationale">
          <p><strong>Why it works:</strong> ${escapeHtml(outfit.explanation || '')}</p>
          ${
            outfit.layeringTips
              ? `<p class="outfit-tip"><strong>💡 Styling Tip:</strong> ${escapeHtml(outfit.layeringTips)}</p>`
              : ''
          }
        </div>
      `;

      // Bind inline fit video preview buttons inside the outfit card
      cardEl.querySelectorAll('.btn-preview-fit').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const videoMediaId = btn.dataset.videoMediaId;
          const gName = btn.dataset.garmentName;
          const drawer = cardEl.querySelector('[data-role="fit-video-drawer"]');
          if (!drawer || !videoMediaId) return;

          const blob = await wardrobeDb.getMediaBlob(videoMediaId).catch(() => null);
          if (!blob) {
            showToast('Fit video not found', 'error');
            return;
          }
          const vUrl = this.urlManager.createUrl(blob);
          drawer.classList.remove('hidden');
          drawer.innerHTML = `
            <div class="inline-video-header">
              <span>🎥 Fit Preview: <strong>${escapeHtml(gName)}</strong></span>
              <button type="button" class="btn-close-inline-video">Close ✕</button>
            </div>
          `;
          const player = createSafeVideoPlayer(vUrl, blob.type || 'video/mp4');
          player.className = 'outfit-inline-video';
          drawer.appendChild(player);

          drawer.querySelector('.btn-close-inline-video')?.addEventListener('click', () => {
            player.pause();
            drawer.classList.add('hidden');
            drawer.innerHTML = '';
          });
        });
      });

      // Bind "Wear This Outfit" button
      cardEl.querySelector('.btn-wear-outfit')?.addEventListener('click', () => {
        const wearModal = new WearOutfitModal({
          outfit: {
            ...outfit,
            garments: outfitGarments
          },
          onConfirmWear: async (selectedWashIds) => {
            const allOutfitIds = outfitGarments.map((g) => g.id);
            const washSet = new Set(selectedWashIds || []);
            const keepCleanWornIds = allOutfitIds.filter((id) => !washSet.has(id));

            if (selectedWashIds && selectedWashIds.length > 0) {
              await wardrobeDb.markGarmentsWorn(selectedWashIds, null, true);
            }
            if (keepCleanWornIds.length > 0) {
              await wardrobeDb.markGarmentsWorn(keepCleanWornIds, null, false);
            }

            await wardrobeDb.addOutfitHistory({
              outfitId: outfit.id,
              title: outfit.title,
              garmentIds: allOutfitIds,
              explanation: outfit.explanation,
              layeringTips: outfit.layeringTips,
              occasion: this.occasion
            });

            eventBus.emit('wardrobe:changed', { source: 'wear_outfit' });
            eventBus.emit('laundry:updated', { wornCount: selectedWashIds.length });
            showToast(
              `Outfit logged! ${selectedWashIds.length} item(s) moved to your Laundry Basket.`,
              'success'
            );

            this.garments = await wardrobeDb.getAllGarments();
            await this.render();
            await this.generateSuggestions();
          }
        });
        wearModal.open(document.body);
      });

      outfitsMount.appendChild(cardEl);
    }
  }

  async unmount() {
    this.urlManager.revokeAll();
  }
}

export default TomorrowStylistView;
