/**
 * domUtils.js - Safe HTML escaping, sanitization, and SVG garment placeholders
 */

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeParamValue(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/<\/?script[^>]*>/gi, '')
    .replace(/[<>]/g, '')
    .trim();
}

export function getCategoryIconSvg(category = 'top') {
  const cat = String(category).toLowerCase();
  if (cat === 'bottom') {
    return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="garment-placeholder-svg"><path d="M18 10h28l4 44h-12l-6-26-6 26H14l4-44z"/></svg>`;
  }
  if (cat === 'outerwear') {
    return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="garment-placeholder-svg"><path d="M22 10l-12 10 6 12 6-4v26h20V28l6 4 6-12-12-10-6 6h-8l-6-6z"/><line x1="32" y1="16" x2="32" y2="54"/></svg>`;
  }
  if (cat === 'one-piece') {
    return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="garment-placeholder-svg"><path d="M24 10h16l4 14-6 6 8 24H18l8-24-6-6 4-14z"/></svg>`;
  }
  if (cat === 'shoes') {
    return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="garment-placeholder-svg"><path d="M10 44h44v6H10v-6zm4-16l12 8 18 2c6 0 10 3 10 6H10V28h4z"/></svg>`;
  }
  if (cat === 'accessory') {
    return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="garment-placeholder-svg"><rect x="14" y="24" width="36" height="26" rx="4"/><path d="M24 24V18a8 8 0 0 1 16 0v6"/></svg>`;
  }
  // Default: top / sweater / t-shirt
  return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="garment-placeholder-svg"><path d="M22 12l-12 10 6 10 6-4v24h20V28l6 4 6-10-12-10a8 8 0 0 1-16 0z"/></svg>`;
}

export function formatBytes(bytes = 0) {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatRelativeDate(isoString) {
  if (!isoString) return 'Never';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default {
  escapeHtml,
  sanitizeParamValue,
  getCategoryIconSvg,
  formatBytes,
  formatRelativeDate
};
