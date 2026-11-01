/**
 * BackupSettingsView.js - Backup & Restore Center (.zip & .json), Google Drive v2 Adapter Status,
 * Active Season Switcher, Gemini API Key Configuration, and Weather Location Settings.
 */

import { wardrobeDb } from '../db/wardrobeDb.js';
import { backupManager } from '../services/backup/BackupManager.js';
import { testGeminiApiKey } from '../services/ai/geminiService.js';
import { eventBus } from '../utils/eventBus.js';
import { escapeHtml, formatBytes, formatRelativeDate } from '../utils/domUtils.js';
import { showToast } from '../components/Toast.js';
import { LoadingOverlay } from '../components/LoadingOverlay.js';

export class BackupSettingsView {
  constructor() {
    this.container = null;
    this.settings = {};
    this.backupStatus = {};
  }

  async mount(container) {
    this.container = container;
    await this.loadState();
    this.render();
  }

  async loadState() {
    const [settings, status] = await Promise.all([
      wardrobeDb.getSettings(),
      backupManager.getStatus()
    ]);
    this.settings = settings || {};
    this.backupStatus = status || {};
  }

  render() {
    if (!this.container) return;

    const s = this.settings;
    const b = this.backupStatus;
    const hasKey = Boolean(s.geminiApiKey && String(s.geminiApiKey).trim().length > 5);

    this.container.innerHTML = `
      <section class="view-section settings-view">
        <div class="section-header">
          <h2>Backup & Settings</h2>
          <p class="section-subtitle">Keep your wardrobe safe across seasons or phone upgrades, and configure your AI Stylist.</p>
        </div>

        <!-- BACKUP & RESTORE CARD -->
        <div class="card-surface settings-card">
          <div class="settings-card-header">
            <div>
              <span class="badge-kicker">DISASTER RECOVERY & SYNC</span>
              <h3>Wardrobe Backup Vault</h3>
            </div>
            <span class="backup-health-pill ${b.hasUnsavedChanges ? 'is-dirty' : 'is-synced'}">
              ${b.hasUnsavedChanges ? `⚠ ${b.changesCount || 1} Unsaved Change(s)` : '✓ Backed Up'}
            </span>
          </div>

          <div class="storage-metrics-grid">
            <div class="metric-box">
              <span class="metric-val">${b.totalGarments || 0}</span>
              <span class="metric-label">Garments</span>
            </div>
            <div class="metric-box">
              <span class="metric-val">${b.totalPhotos || 0}</span>
              <span class="metric-label">Photos</span>
            </div>
            <div class="metric-box">
              <span class="metric-val">${b.totalVideos || 0}</span>
              <span class="metric-label">Fit Videos</span>
            </div>
            <div class="metric-box">
              <span class="metric-val">${formatBytes(b.estimatedStorageBytes || 0)}</span>
              <span class="metric-label">On-Device Size</span>
            </div>
          </div>

          <p class="backup-meta-line">Last Backup: <strong>${escapeHtml(formatRelativeDate(b.lastBackupAt))}</strong></p>

          <div class="backup-actions-grid">
            <button type="button" id="btn-export-zip" class="btn-primary">
              📦 Export Full Backup (.zip)
              <span class="btn-sub">Includes wardrobe.json + all photos & fit videos (Save to Google Drive / Files)</span>
            </button>

            <button type="button" id="btn-export-json" class="btn-secondary">
              📄 Export Quick Status (.json)
              <span class="btn-sub">Lightweight metadata & clean/wash statuses only</span>
            </button>
          </div>

          <hr class="divider" />

          <div class="restore-section">
            <h4>Restore from Backup (.zip or .json)</h4>
            <p class="text-muted">Restore your entire wardrobe onto a new phone or sync statuses across devices.</p>
            <div class="form-row-2">
              <label class="form-label">Restore Mode
                <select id="restore-mode-select" class="form-select">
                  <option value="merge">Merge (Keep newer items & preserve API key)</option>
                  <option value="replace">Replace (Clean-slate full restore)</option>
                </select>
              </label>

              <label class="form-label">Select Backup File (.zip / .json)
                <input type="file" id="input-restore-file" accept=".zip,.json,application/zip,application/json" class="form-input" />
              </label>
            </div>
            <button type="button" id="btn-run-restore" class="btn-secondary btn-block" disabled>
              🔄 Restore Selected Backup
            </button>
          </div>

          <div class="gdrive-v2-banner">
            <div>
              <strong>☁️ Google One / Google Drive Auto-Sync Ready</strong>
              <p class="text-muted">Tip: On iPhone or Android, tapping "Export Full Backup (.zip)" opens your phone's Share sheet so you can tap <strong>Save to Google Drive</strong> immediately. Pluggable <code>GoogleDriveBackupProvider</code> is also pre-wired for direct OAuth API sync.</p>
            </div>
          </div>
        </div>

        <!-- AI & SEASON CONFIGURATION CARD -->
        <div class="card-surface settings-card">
          <h3>✨ AI Fashion Stylist & Season Settings</h3>
          <form id="settings-form" class="garment-form">
            <div class="form-row-2">
              <label class="form-label">Active Season Mode
                <select name="activeSeason" class="form-select">
                  <option value="winter" ${s.activeSeason === 'winter' ? 'selected' : ''}>❄️ Winter Mode (Winter + All-Season)</option>
                  <option value="summer" ${s.activeSeason === 'summer' ? 'selected' : ''}>☀️ Summer Mode (Summer + All-Season)</option>
                </select>
              </label>

              <label class="form-label">Your City (For Tomorrow's Weather)
                <input type="text" name="location" class="form-input" placeholder="e.g., Madrid, London, New York" value="${escapeHtml(s.location || '')}" />
              </label>
            </div>

            <div class="form-group">
              <label class="form-label" for="gemini-key-input">
                Google Gemini API Key ${hasKey ? '<span class="key-status-ok">✓ Configured</span>' : '<span class="key-status-missing">(Optional — Free via Google AI Studio)</span>'}
              </label>
              <div style="display:flex; gap:8px;">
                <input type="password" id="gemini-key-input" name="geminiApiKey" class="form-input" placeholder="Paste your AIzaSy... key from aistudio.google.com" value="${escapeHtml(s.geminiApiKey || '')}" autocomplete="off" />
                <button type="button" id="btn-test-gemini-key" class="btn-secondary" style="white-space:nowrap;">🔌 Test Key</button>
              </div>
              <p class="form-help">
                Get a free key in 2 clicks with your Google account at
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style="color:var(--accent-gold);">aistudio.google.com/app/apikey</a>.
                Stored strictly inside your phone's local IndexedDB.
              </p>
            </div>

            <button type="submit" class="btn-primary btn-block">Save Settings</button>
          </form>
        </div>
      </section>
    `;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;

    // Export Full ZIP
    this.container.querySelector('#btn-export-zip')?.addEventListener('click', async () => {
      try {
        LoadingOverlay.show('Building full ZIP backup...', 10);
        const res = await backupManager.exportAndDeliverFullBackup({
          onProgress: (pct, step) => LoadingOverlay.show(step, pct)
        });
        LoadingOverlay.hide();
        if (!res.delivery?.aborted) {
          showToast(`Full backup ready (${res.filename})!`, 'success');
        }
        await this.loadState();
        this.render();
      } catch (err) {
        LoadingOverlay.hide();
        showToast(`Backup export failed: ${err.message}`, 'error');
      }
    });

    // Export Quick JSON
    this.container.querySelector('#btn-export-json')?.addEventListener('click', async () => {
      try {
        LoadingOverlay.show('Exporting JSON snapshot...');
        const res = await backupManager.exportAndDeliverMetadataJson();
        LoadingOverlay.hide();
        if (!res.delivery?.aborted) {
          showToast(`Status snapshot exported (${res.filename})!`, 'success');
        }
        await this.loadState();
        this.render();
      } catch (err) {
        LoadingOverlay.hide();
        showToast(`JSON export failed: ${err.message}`, 'error');
      }
    });

    // Restore File input & button
    const fileInput = this.container.querySelector('#input-restore-file');
    const restoreBtn = this.container.querySelector('#btn-run-restore');
    const modeSelect = this.container.querySelector('#restore-mode-select');

    fileInput?.addEventListener('change', () => {
      if (restoreBtn) {
        restoreBtn.disabled = !(fileInput.files && fileInput.files.length > 0);
      }
    });

    restoreBtn?.addEventListener('click', async () => {
      const file = fileInput?.files?.[0];
      if (!file) return;
      const mode = modeSelect?.value || 'merge';

      try {
        LoadingOverlay.show(`Restoring backup (${mode} mode)...`, 15);
        const res = await backupManager.importBackup(file, mode, (pct, step) =>
          LoadingOverlay.show(step, pct)
        );
        LoadingOverlay.hide();
        showToast(
          `Restored ${res.garmentsCount} garment(s) and ${res.mediaCount || 0} media file(s)!`,
          'success'
        );
        await this.loadState();
        this.render();
      } catch (err) {
        LoadingOverlay.hide();
        showToast(`Restore failed: ${err.message}`, 'error');
      }
    });

    // Save Settings form
    const form = this.container.querySelector('#settings-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const nextSettings = {
        activeSeason: fd.get('activeSeason') || 'winter',
        location: String(fd.get('location') || '').trim(),
        geminiApiKey: String(fd.get('geminiApiKey') || '').trim()
      };

      await wardrobeDb.updateSettings(nextSettings);
      eventBus.emit('season:changed', { activeSeason: nextSettings.activeSeason });
      showToast('Settings saved!', 'success');
      await this.loadState();
      this.render();
    });

    // Auto-save Gemini API Key immediately on paste/change so switching tabs never loses it
    const keyInputEl = this.container.querySelector('#gemini-key-input');
    keyInputEl?.addEventListener('change', async () => {
      const val = String(keyInputEl.value || '').trim();
      await wardrobeDb.setSetting('geminiApiKey', val);
      this.settings.geminiApiKey = val;
    });
    keyInputEl?.addEventListener('paste', (e) => {
      setTimeout(async () => {
        const val = String(keyInputEl.value || '').trim();
        if (val) {
          await wardrobeDb.setSetting('geminiApiKey', val);
          this.settings.geminiApiKey = val;
          showToast('API key saved automatically! Click "🔌 Test Key" to verify.', 'info');
        }
      }, 50);
    });

    // Test Gemini API Key button
    this.container.querySelector('#btn-test-gemini-key')?.addEventListener('click', async () => {
      const keyInput = this.container.querySelector('#gemini-key-input');
      const candidateKey = String(keyInput?.value || '').trim();
      if (!candidateKey) {
        showToast('Paste your Gemini API key first!', 'error');
        return;
      }
      try {
        LoadingOverlay.show('Testing connection to Google Gemini AI...');
        await testGeminiApiKey(candidateKey);
        await wardrobeDb.setSetting('geminiApiKey', candidateKey);
        LoadingOverlay.hide();
        showToast('✓ Connection successful! Your Gemini API key has been saved.', 'success');
        await this.loadState();
        this.render();
      } catch (err) {
        LoadingOverlay.hide();
        showToast(`Gemini key test failed: ${err.message}`, 'error');
      }
    });
  }

  async unmount() {}
}

export default BackupSettingsView;
