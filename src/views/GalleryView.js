/**
 * GalleryView.js - Wardrobe Catalog with Active Season Switcher, Filter Chips, and Fit Video Detail Modal
 */

import { wardrobeDb } from '../db/wardrobeDb.js';
import { MediaUrlManager } from '../utils/mediaUtils.js';
import { eventBus } from '../utils/eventBus.js';
import { escapeHtml } from '../utils/domUtils.js';
import { GarmentCard } from '../components/GarmentCard.js';
import { GarmentModal } from '../components/GarmentModal.js';
import { showToast } from '../components/Toast.js';

export class GalleryView {
  constructor() {
    this.container = null;
    this.urlManager = new MediaUrlManager();
    this.garments = [];
    this.activeSeason = 'winter';
    this.filters = {
      seasonFilter: 'active', // 'active' | 'all' | 'winter' | 'summer' | 'all-season'
      status: 'all',          // 'all' | 'clean' | 'to_wash'
      type: 'all',            // 'all' | 'everyday' | 'gym' | 'dress-up'
      category: 'all',        // 'all' | 'top' | 'bottom' | 'outerwear' | 'one-piece' | 'shoes' | 'accessory'
      search: ''
    };
    this._unsub = null;
  }

  async mount(container, params = {}) {
    this.container = container;
    if (params.season) this.filters.seasonFilter = params.season;
    if (params.category) this.filters.category = params.category;
    if (params.status) this.filters.status = params.status;

    await this.loadData();
    await this.render();

    this._unsub = eventBus.on('wardrobe:changed', async () => {
      await this.loadData();
      await this.renderGrid();
    });
  }

  async loadData() {
    const [garments, settings] = await Promise.all([
      wardrobeDb.getAllGarments(),
      wardrobeDb.getSettings()
    ]);
    this.garments = garments || [];
    this.activeSeason = (settings && settings.activeSeason) || 'winter';
  }

  getFilteredGarments() {
    return this.garments.filter((g) => {
      if (this.filters.seasonFilter === 'active') {
        if (g.season && g.season !== this.activeSeason && g.season !== 'all-season') {
          return false;
        }
      } else if (this.filters.seasonFilter !== 'all') {
        if (g.season !== this.filters.seasonFilter) return false;
      }

      if (this.filters.status !== 'all' && g.status !== this.filters.status) {
        return false;
      }
      if (this.filters.type !== 'all' && g.type !== this.filters.type) {
        return false;
      }
      if (this.filters.category !== 'all' && g.category !== this.filters.category) {
        return false;
      }
      if (this.filters.search) {
        const q = this.filters.search.toLowerCase();
        const hay = `${g.name || ''} ${g.visualDescription || ''} ${g.category || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  async render() {
    if (!this.container) return;

    const isWinter = this.activeSeason === 'winter';
    const cleanCount = this.garments.filter((g) => g.status === 'clean').length;
    const washCount = this.garments.filter((g) => g.status === 'to_wash').length;

    this.container.innerHTML = `
      <section class="view-section gallery-view">
        <div class="season-banner">
          <div class="season-banner-info">
            <span class="season-kicker">ACTIVE WARDROBE MODE</span>
            <h2 class="season-heading">${isWinter ? '❄️ Winter Collection' : '☀️ Summer Collection'}</h2>
            <p class="season-sub">${this.garments.length} total items • ${cleanCount} Clean • ${washCount} To Wash</p>
          </div>
          <button type="button" class="btn-season-switch" id="btn-switch-active-season">
            Switch to ${isWinter ? '☀️ Summer' : '❄️ Winter'}
          </button>
        </div>

        <div class="filter-bar">
          <div class="search-row">
            <input type="search" id="gallery-search" class="form-input search-input" placeholder="Search clothes, colors, fabrics..." value="${escapeHtml(this.filters.search)}" />
          </div>

          <div class="chip-scroll-row" data-filter-group="seasonFilter">
            <button type="button" class="filter-chip ${this.filters.seasonFilter === 'active' ? 'active' : ''}" data-val="active">Current Season (${isWinter ? 'Winter + Year-Round' : 'Summer + Year-Round'})</button>
            <button type="button" class="filter-chip ${this.filters.seasonFilter === 'all' ? 'active' : ''}" data-val="all">All Clothes</button>
            <button type="button" class="filter-chip ${this.filters.seasonFilter === 'winter' ? 'active' : ''}" data-val="winter">❄️ Winter Only</button>
            <button type="button" class="filter-chip ${this.filters.seasonFilter === 'summer' ? 'active' : ''}" data-val="summer">☀️ Summer Only</button>
            <button type="button" class="filter-chip ${this.filters.seasonFilter === 'all-season' ? 'active' : ''}" data-val="all-season">🔄 Year-Round</button>
          </div>

          <div class="chip-scroll-row" data-filter-group="status">
            <button type="button" class="filter-chip ${this.filters.status === 'all' ? 'active' : ''}" data-val="all">All Status</button>
            <button type="button" class="filter-chip ${this.filters.status === 'clean' ? 'active' : ''}" data-val="clean">✓ Clean</button>
            <button type="button" class="filter-chip ${this.filters.status === 'to_wash' ? 'active' : ''}" data-val="to_wash">🧺 To Wash</button>
          </div>

          <div class="chip-scroll-row" data-filter-group="type">
            <button type="button" class="filter-chip ${this.filters.type === 'all' ? 'active' : ''}" data-val="all">All Occasions</button>
            <button type="button" class="filter-chip ${this.filters.type === 'everyday' ? 'active' : ''}" data-val="everyday">Everyday</button>
            <button type="button" class="filter-chip ${this.filters.type === 'gym' ? 'active' : ''}" data-val="gym">Gym</button>
            <button type="button" class="filter-chip ${this.filters.type === 'dress-up' ? 'active' : ''}" data-val="dress-up">Dress-up</button>
          </div>

          <div class="chip-scroll-row" data-filter-group="category">
            <button type="button" class="filter-chip ${this.filters.category === 'all' ? 'active' : ''}" data-val="all">All Categories</button>
            <button type="button" class="filter-chip ${this.filters.category === 'top' ? 'active' : ''}" data-val="top">Tops</button>
            <button type="button" class="filter-chip ${this.filters.category === 'bottom' ? 'active' : ''}" data-val="bottom">Bottoms</button>
            <button type="button" class="filter-chip ${this.filters.category === 'outerwear' ? 'active' : ''}" data-val="outerwear">Outerwear</button>
            <button type="button" class="filter-chip ${this.filters.category === 'one-piece' ? 'active' : ''}" data-val="one-piece">One-Piece</button>
            <button type="button" class="filter-chip ${this.filters.category === 'shoes' ? 'active' : ''}" data-val="shoes">Shoes</button>
            <button type="button" class="filter-chip ${this.filters.category === 'accessory' ? 'active' : ''}" data-val="accessory">Accessories</button>
          </div>
        </div>

        <div id="gallery-grid-mount" class="garment-grid"></div>
      </section>
    `;

    // Bind Active Season toggle
    this.container.querySelector('#btn-switch-active-season')?.addEventListener('click', async () => {
      const nextSeason = this.activeSeason === 'winter' ? 'summer' : 'winter';
      await wardrobeDb.setSetting('activeSeason', nextSeason);
      this.activeSeason = nextSeason;
      eventBus.emit('season:changed', { activeSeason: nextSeason });
      showToast(`Switched active wardrobe to ${nextSeason.toUpperCase()} mode`, 'info');
      await this.render();
    });

    // Bind search input
    this.container.querySelector('#gallery-search')?.addEventListener('input', (e) => {
      this.filters.search = e.target.value || '';
      this.renderGrid();
    });

    // Bind filter chip groups
    this.container.querySelectorAll('[data-filter-group]').forEach((groupEl) => {
      const groupKey = groupEl.dataset.filterGroup;
      groupEl.querySelectorAll('.filter-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          this.filters[groupKey] = chip.dataset.val;
          groupEl.querySelectorAll('.filter-chip').forEach((c) => c.classList.toggle('active', c === chip));
          this.renderGrid();
        });
      });
    });

    await this.renderGrid();
  }

  async renderGrid() {
    if (!this.container) return;
    const gridMount = this.container.querySelector('#gallery-grid-mount');
    if (!gridMount) return;

    this.urlManager.revokeAll();
    gridMount.innerHTML = '';

    const filtered = this.getFilteredGarments();

    if (filtered.length === 0) {
      gridMount.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-icon">🧥</div>
          <h3>${this.garments.length === 0 ? 'Your Digital Wardrobe is Empty' : 'No Matching Garments'}</h3>
          <p>${
            this.garments.length === 0
              ? 'Start your seasonal changeover by adding your clothes with photos and fit videos.'
              : 'Try adjusting your season, status, or category filter chips above.'
          }</p>
          <a href="#add" class="btn-primary">＋ Add Garment</a>
        </div>
      `;
      return;
    }

    for (const g of filtered) {
      let photoUrl = null;
      if (g.photoMediaId) {
        const blob = await wardrobeDb.getMediaBlob(g.photoMediaId).catch(() => null);
        if (blob) {
          photoUrl = this.urlManager.createUrl(blob);
        }
      }

      const card = new GarmentCard({
        garment: g,
        photoUrl,
        onToggleStatus: async (item) => {
          const updated = await wardrobeDb.toggleGarmentStatus(item.id);
          eventBus.emit('wardrobe:changed', { id: item.id });
          eventBus.emit('laundry:updated', { id: item.id });
          showToast(
            `${updated.name} moved to ${updated.status === 'clean' ? 'Clean' : 'To Wash'}`,
            'success'
          );
        },
        onSelect: (item) => {
          const modal = new GarmentModal({
            garment: item,
            onUpdated: async () => {
              await this.loadData();
              await this.render();
            },
            onDeleted: async () => {
              await this.loadData();
              await this.render();
            }
          });
          modal.open(document.body);
        }
      });

      gridMount.appendChild(card.render());
    }
  }

  async unmount() {
    this.urlManager.revokeAll();
    if (typeof this._unsub === 'function') {
      this._unsub();
      this._unsub = null;
    }
  }
}

export default GalleryView;
