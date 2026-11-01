/**
 * LocalArchiveBackupProvider - Full Offline .zip and Quick .json Backup & Restore Engine
 * Bundles manifest.json, wardrobe.json, photos/, and videos/ using vendored JSZip.
 */

import { BackupProvider } from './BackupProvider.js';
import { wardrobeDb } from '../../db/wardrobeDb.js';
import { eventBus } from '../../utils/eventBus.js';
import JSZip from '../../vendor/jszip.min.js';

function getExtensionFromMime(mimeType = '') {
  const mime = String(mimeType).toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('heic')) return 'heic';
  if (mime.includes('quicktime') || mime.includes('mov')) return 'mov';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.startsWith('video/')) return 'mp4';
  return 'jpg';
}

function formatDateStamp(isoDate = new Date().toISOString()) {
  return isoDate.slice(0, 10);
}

export class LocalArchiveBackupProvider extends BackupProvider {
  get id() {
    return 'local_archive';
  }

  get name() {
    return 'Local Archive (.zip / .json)';
  }

  get description() {
    return 'Portable offline ZIP archive (wardrobe.json + photos + fit videos) and lightweight JSON status snapshots.';
  }

  async getStatus() {
    const dbStatus = await wardrobeDb.getBackupStatus();
    return {
      providerId: this.id,
      providerName: this.name,
      requiresAuth: false,
      ...dbStatus
    };
  }

  /**
   * Collect all database records for export
   */
  async _collectDatabaseSnapshot(includeMediaRecords = false) {
    const db = await wardrobeDb.openDb();
    const [garments, settings, outfitHistory] = await Promise.all([
      wardrobeDb.getAllGarments(),
      wardrobeDb.getSettings(),
      wardrobeDb.getOutfitHistory(1000)
    ]);

    const mediaRecords = await new Promise((resolve, reject) => {
      const tx = db.transaction('media', 'readonly');
      const store = tx.objectStore('media');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const mediaMetadata = mediaRecords.map((m) => {
      const ext = getExtensionFromMime(m.mimeType);
      const folder = m.type === 'video' ? 'videos' : 'photos';
      const archivePath = `${folder}/${m.id}.${ext}`;
      return {
        id: m.id,
        garmentId: m.garmentId,
        type: m.type,
        mimeType: m.mimeType || (m.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        size: m.size || (m.data ? m.data.byteLength : 0),
        createdAt: m.createdAt || new Date().toISOString(),
        archivePath
      };
    });

    return {
      garments,
      settings,
      outfitHistory,
      mediaMetadata,
      mediaRecords: includeMediaRecords ? mediaRecords : []
    };
  }

  /**
   * Export lightweight metadata & status snapshot (.json)
   */
  async exportMetadataJson() {
    const now = new Date().toISOString();
    const { garments, settings, outfitHistory, mediaMetadata } = await this._collectDatabaseSnapshot(false);

    const payload = {
      version: 1,
      app: 'WardrobeOrganizerPWA',
      exportType: 'metadata_json',
      exportedAt: now,
      settings: {
        ...settings,
        lastBackupAt: now
      },
      garments,
      mediaMetadata,
      outfitHistory
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const filename = `wardrobe-status-${formatDateStamp(now)}.json`;

    await wardrobeDb.setSetting('lastBackupAt', now);
    eventBus.emit('backup:completed', { type: 'json', timestamp: now, count: garments.length });

    return {
      blob,
      jsonString,
      filename,
      timestamp: now,
      count: garments.length
    };
  }

  /**
   * Export full .zip archive containing manifest.json, wardrobe.json, photos/, and videos/
   */
  async exportFullBackup(onProgress) {
    const notify = typeof onProgress === 'function' ? onProgress : () => {};
    notify(5, 'Reading wardrobe database...');

    const now = new Date().toISOString();
    const { garments, settings, outfitHistory, mediaMetadata, mediaRecords } = await this._collectDatabaseSnapshot(true);

    const zip = new JSZip();

    const manifest = {
      version: 1,
      app: 'WardrobeOrganizerPWA',
      exportType: 'full_zip',
      exportedAt: now,
      counts: {
        garments: garments.length,
        media: mediaRecords.length,
        outfitHistory: outfitHistory.length
      }
    };

    const wardrobePayload = {
      version: 1,
      exportedAt: now,
      settings: {
        ...settings,
        lastBackupAt: now
      },
      garments,
      mediaMetadata,
      outfitHistory
    };

    notify(20, 'Packaging wardrobe metadata...');
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    zip.file('wardrobe.json', JSON.stringify(wardrobePayload, null, 2));

    const photosFolder = zip.folder('photos');
    const videosFolder = zip.folder('videos');

    const totalMedia = mediaRecords.length;
    for (let i = 0; i < totalMedia; i++) {
      const m = mediaRecords[i];
      const ext = getExtensionFromMime(m.mimeType);
      const fileName = `${m.id}.${ext}`;
      const dataBuffer = m.data instanceof ArrayBuffer
        ? new Uint8Array(m.data)
        : (m.data ? new Uint8Array(m.data) : new Uint8Array(0));

      if (m.type === 'video') {
        videosFolder.file(fileName, dataBuffer, { compression: 'STORE' });
      } else {
        photosFolder.file(fileName, dataBuffer, { compression: 'DEFLATE' });
      }

      const pct = 20 + Math.round(((i + 1) / Math.max(1, totalMedia)) * 50);
      notify(pct, `Packaging media (${i + 1}/${totalMedia})...`);
    }

    notify(75, 'Building ZIP archive...');
    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/zip'
    });

    const filename = `wardrobe-backup-${formatDateStamp(now)}.zip`;
    await wardrobeDb.setSetting('lastBackupAt', now);
    notify(100, 'Backup complete');

    eventBus.emit('backup:completed', {
      type: 'zip',
      timestamp: now,
      count: garments.length,
      mediaCount: mediaRecords.length
    });

    return {
      blob,
      filename,
      timestamp: now,
      count: garments.length,
      mediaCount: mediaRecords.length
    };
  }

  /**
   * Import and restore either a .zip archive or a .json snapshot in 'replace' or 'merge' mode
   */
  async importBackup(fileOrPayload, mode = 'replace', onProgress) {
    if (!fileOrPayload) {
      throw new Error('LocalArchiveBackupProvider.importBackup: Backup payload is required');
    }

    const restoreMode = mode === 'merge' ? 'merge' : 'replace';
    const notify = typeof onProgress === 'function' ? onProgress : () => {};
    notify(10, 'Inspecting backup payload...');

    let parsedData = null;
    let loadedZip = null;

    // Determine whether input is JSON string, plain Object, or binary Blob/ArrayBuffer
    if (typeof fileOrPayload === 'string') {
      try {
        parsedData = JSON.parse(fileOrPayload);
      } catch (err) {
        throw new Error(`Invalid JSON backup string: ${err.message}`);
      }
    } else if (
      typeof fileOrPayload === 'object' &&
      !(fileOrPayload instanceof Blob) &&
      !(fileOrPayload instanceof ArrayBuffer) &&
      !ArrayBuffer.isView(fileOrPayload)
    ) {
      parsedData = fileOrPayload;
    } else {
      // Could be a Blob/File (.zip or .json) or ArrayBuffer
      const isJsonFile =
        (fileOrPayload instanceof Blob &&
          (fileOrPayload.type === 'application/json' ||
            (fileOrPayload.name && fileOrPayload.name.toLowerCase().endsWith('.json'))));

      if (isJsonFile) {
        const text = await fileOrPayload.text();
        try {
          parsedData = JSON.parse(text);
        } catch (err) {
          throw new Error(`Invalid JSON backup file: ${err.message}`);
        }
      } else {
        // Try parsing as ZIP first; if not a ZIP, check if it's UTF-8 JSON text inside a generic Blob
        try {
          loadedZip = await JSZip.loadAsync(fileOrPayload);
          const wardrobeEntry = loadedZip.file('wardrobe.json');
          if (!wardrobeEntry) {
            throw new Error('ZIP archive is missing required wardrobe.json');
          }
          const jsonText = await wardrobeEntry.async('string');
          parsedData = JSON.parse(jsonText);
        } catch (zipErr) {
          // Check if it was actually a valid JSON blob without mime type
          if (fileOrPayload instanceof Blob) {
            try {
              const maybeText = await fileOrPayload.text();
              if (maybeText.trim().startsWith('{')) {
                parsedData = JSON.parse(maybeText);
              } else {
                throw zipErr;
              }
            } catch (_) {
              throw new Error(`Corrupted or unsupported backup archive: ${zipErr.message}`);
            }
          } else {
            throw new Error(`Corrupted or unsupported backup archive: ${zipErr.message}`);
          }
        }
      }
    }

    if (!parsedData || typeof parsedData !== 'object' || !Array.isArray(parsedData.garments)) {
      throw new Error('Malformed backup payload: missing garments array');
    }

    notify(35, `Restoring wardrobe (${restoreMode} mode)...`);

    const existingSettings = await wardrobeDb.getSettings();
    const now = new Date().toISOString();

    if (restoreMode === 'replace') {
      await wardrobeDb.clearDatabase();
    }

    // 1. Restore Settings (protecting existing non-empty geminiApiKey in merge mode or if incoming is empty)
    const incomingSettings = parsedData.settings || {};
    const mergedSettings = { ...incomingSettings };

    if (
      restoreMode === 'merge' &&
      (!incomingSettings.geminiApiKey || String(incomingSettings.geminiApiKey).trim() === '') &&
      existingSettings.geminiApiKey
    ) {
      mergedSettings.geminiApiKey = existingSettings.geminiApiKey;
    } else if (
      restoreMode === 'replace' &&
      (!incomingSettings.geminiApiKey || String(incomingSettings.geminiApiKey).trim() === '') &&
      existingSettings.geminiApiKey
    ) {
      // Even on replace, preserve existing device API key if backup had none
      mergedSettings.geminiApiKey = existingSettings.geminiApiKey;
    }

    mergedSettings.lastBackupAt = now;
    await wardrobeDb.updateSettings(mergedSettings);

    // 2. Restore Media Blobs (if ZIP archive is loaded)
    let restoredMediaCount = 0;
    const mediaMetadata = Array.isArray(parsedData.mediaMetadata) ? parsedData.mediaMetadata : [];

    if (loadedZip && mediaMetadata.length > 0) {
      const db = await wardrobeDb.openDb();
      for (let i = 0; i < mediaMetadata.length; i++) {
        const meta = mediaMetadata[i];
        const ext = getExtensionFromMime(meta.mimeType);
        const folder = meta.type === 'video' ? 'videos' : 'photos';
        const candidatePath = meta.archivePath || `${folder}/${meta.id}.${ext}`;
        const zipEntry = loadedZip.file(candidatePath);

        if (zipEntry) {
          const arrayBuffer = await zipEntry.async('arraybuffer');
          await new Promise((resolve, reject) => {
            const tx = db.transaction('media', 'readwrite');
            const store = tx.objectStore('media');
            store.put({
              id: meta.id,
              garmentId: meta.garmentId,
              type: meta.type || 'photo',
              mimeType: meta.mimeType || 'image/jpeg',
              data: arrayBuffer,
              size: arrayBuffer.byteLength,
              createdAt: meta.createdAt || now
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          restoredMediaCount++;
        }
      }
    }

    // 3. Restore Garments
    const incomingGarments = parsedData.garments || [];
    let restoredGarmentsCount = 0;
    const db = await wardrobeDb.openDb();

    for (const incoming of incomingGarments) {
      if (!incoming || !incoming.id) continue;

      if (restoreMode === 'merge') {
        const existing = await wardrobeDb.getGarment(incoming.id);
        if (existing) {
          const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
          const incomingTime = new Date(incoming.updatedAt || incoming.createdAt || 0).getTime();
          if (incomingTime >= existingTime) {
            await new Promise((resolve, reject) => {
              const tx = db.transaction('garments', 'readwrite');
              tx.objectStore('garments').put({
                ...existing,
                ...incoming,
                photoMediaId: incoming.photoMediaId !== undefined ? incoming.photoMediaId : existing.photoMediaId,
                videoMediaId: incoming.videoMediaId !== undefined ? incoming.videoMediaId : existing.videoMediaId
              });
              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error);
            });
            restoredGarmentsCount++;
          }
          continue;
        }
      }

      // Insert directly keeping original ID and timestamps
      await new Promise((resolve, reject) => {
        const tx = db.transaction('garments', 'readwrite');
        tx.objectStore('garments').put({
          id: incoming.id,
          name: incoming.name || 'Untitled Garment',
          category: incoming.category || 'top',
          season: incoming.season || 'all-season',
          colorGroup: incoming.colorGroup || 'coloured',
          delicate: Boolean(incoming.delicate),
          status: incoming.status || 'clean',
          type: incoming.type || 'everyday',
          visualDescription: incoming.visualDescription || '',
          photoMediaId: incoming.photoMediaId || null,
          videoMediaId: incoming.videoMediaId || null,
          lastWornAt: incoming.lastWornAt || null,
          createdAt: incoming.createdAt || now,
          updatedAt: incoming.updatedAt || now
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      restoredGarmentsCount++;
    }

    // 4. Restore Outfit History
    const incomingHistory = Array.isArray(parsedData.outfitHistory) ? parsedData.outfitHistory : [];
    if (restoreMode === 'replace' && incomingHistory.length > 0) {
      for (const h of incomingHistory) {
        await wardrobeDb.addOutfitHistory(h);
      }
    }

    notify(100, 'Restore complete');

    eventBus.emit('backup:restored', {
      mode: restoreMode,
      garmentsCount: restoredGarmentsCount,
      mediaCount: restoredMediaCount
    });
    eventBus.emit('wardrobe:changed', { source: 'backup_restore' });
    eventBus.emit('laundry:updated', { source: 'backup_restore' });

    return {
      success: true,
      mode: restoreMode,
      count: restoredGarmentsCount,
      garmentsCount: restoredGarmentsCount,
      mediaCount: restoredMediaCount
    };
  }
}

export default LocalArchiveBackupProvider;
