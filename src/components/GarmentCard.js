/**
 * GarmentCard.js - Mobile Wardrobe Grid Card with Photo, Status/Care Badges, Fit Video Indicator & Quick Status Toggle
 */

import { escapeHtml, getCategoryIconSvg } from '../utils/domUtils.js';

export class GarmentCard {
  constructor(options = {}) {
    this.garment = options.garment || {};
    this.photoUrl = options.photoUrl || null;
    this.onToggleStatus = options.onToggleStatus || null;
    this.onSelect = options.onSelect || null;
  }

  render() {
    const g = this.garment || {};
    const card = document.createElement('article');
    card.className = `garment-card status-${g.status || 'clean'}`;
    card.dataset.garmentId = g.id || '';

    const isClean = g.status !== 'to_wash';
    const seasonIcon = g.season === 'winter' ? '❄️' : g.season === 'summer' ? '☀️' : '🔄';
    const seasonLabel = g.season === 'winter' ? 'Winter' : g.season === 'summer' ? 'Summer' : 'All-Season';
    const colorLabel = g.colorGroup === 'whites' ? 'Whites' : 'Coloured';
    const typeLabel = g.type === 'gym' ? 'Gym' : g.type === 'dress-up' ? 'Dress-up' : 'Everyday';
    const tempLabels = {
      freezing: '🧊 <5°C',
      cold: '❄️ 5–14°C',
      mild: '🌤️ 15–22°C',
      warm: '☀️ >22°C',
      'all-temps': '🌡️ All Temps'
    };
    const tempList = Array.isArray(g.tempSuitability)
      ? g.tempSuitability
      : typeof g.tempSuitability === 'string' && g.tempSuitability
        ? g.tempSuitability.split(',').map((s) => s.trim())
        : [];
    const tempBadge = tempList
      .filter((t) => tempLabels[t])
      .map((t) => `<span class="badge-chip">${tempLabels[t]}</span>`)
      .join('');
    const layerBadge = g.category === 'top' && g.layerRole === 'mid'
      ? `<span class="badge-chip">🧶 Mid Layer</span>`
      : g.category === 'top' && g.layerRole === 'base'
        ? `<span class="badge-chip">👕 Base</span>`
        : '';

    const mediaHtml = this.photoUrl
      ? `<img src="${escapeHtml(this.photoUrl)}" alt="${escapeHtml(g.name || 'Garment')}" class="garment-card-img" loading="lazy" />`
      : `<div class="garment-card-placeholder">${getCategoryIconSvg(g.category)}</div>`;

    const videoBadgeHtml = g.videoMediaId
      ? `<span class="badge-fit-video" title="Has Fit Video">▶ Fit Video</span>`
      : '';

    const delicateBadgeHtml = g.delicate
      ? `<span class="badge-chip badge-delicate" title="Delicate Care">🫧 Delicate</span>`
      : '';

    card.innerHTML = `
      <div class="garment-card-media" data-action="open-detail">
        ${mediaHtml}
        <div class="garment-card-top-badges">
          <span class="badge-season">${seasonIcon} ${escapeHtml(seasonLabel)}</span>
          ${videoBadgeHtml}
        </div>
        <span class="badge-status ${isClean ? 'is-clean' : 'is-wash'}">
          ${isClean ? '✓ Clean' : '🧺 To Wash'}
        </span>
      </div>
      <div class="garment-card-body">
        <div class="garment-card-title" data-action="open-detail">${escapeHtml(g.name || 'Untitled Garment')}</div>
        <div class="garment-card-tags">
          <span class="badge-chip">${escapeHtml(typeLabel)}</span>
          <span class="badge-chip">${escapeHtml(colorLabel)}</span>
          ${tempBadge}
          ${layerBadge}
          ${delicateBadgeHtml}
        </div>
        <div class="garment-card-actions">
          <button type="button" class="btn-toggle ${isClean ? 'btn-mark-wash' : 'btn-mark-clean'}" data-action="toggle-status">
            ${isClean ? 'Move to Wash' : 'Mark Clean'}
          </button>
        </div>
      </div>
    `;

    const toggleBtn = card.querySelector('[data-action="toggle-status"]');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof this.onToggleStatus === 'function') {
          this.onToggleStatus(g);
        }
      });
    }

    card.querySelectorAll('[data-action="open-detail"]').forEach((el) => {
      el.addEventListener('click', () => {
        if (typeof this.onSelect === 'function') {
          this.onSelect(g);
        }
      });
    });

    return card;
  }
}

export default GarmentCard;
