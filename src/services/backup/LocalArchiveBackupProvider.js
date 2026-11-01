/**
 * LocalArchiveBackupProvider - Full Offline .zip and Quick .json Backup & Restore Engine
 * Bundles manifest.json, wardrobe.json, photos/, and videos/ using vendored JSZip.
 */

import { BackupProvider } from './BackupProvider.js';
import { wardrobeDb } from '../../db/wardrobeDb.js';
import { blobToArrayBuffer } from '../../utils/mediaUtils.js';
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

/**
 * Encode binary ArrayBuffer / TypedArray into an ASCII Base64 string in safe chunks
 */
export function arrayBufferToBase64Ascii(buffer) {
  if (!buffer) return '';
  if (typeof buffer === 'string') {
    return buffer.replace(/^data:[^;]+;base64,/i, '').replace(/\s+/g, '');
  }

  let bytes;
  if (buffer instanceof Uint8Array) {
    bytes = buffer;
  } else if (ArrayBuffer.isView(buffer)) {
    bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  } else if (
    buffer instanceof ArrayBuffer ||
    Object.prototype.toString.call(buffer) === '[object ArrayBuffer]' ||
    typeof buffer.byteLength === 'number'
  ) {
    bytes = new Uint8Array(buffer);
  } else {
    bytes = new Uint8Array(0);
  }

  if (bytes.byteLength === 0) return '';

  const chunkSize = 0x8000; // 32KB chunks to avoid call-stack overflow on large videos
  const chunks = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode.apply(null, slice));
  }
  return btoa(chunks.join(''));
}

/**
 * Decode an ASCII Base64 string (with optional data URI prefix) back into an ArrayBuffer
 */
export function base64AsciiToArrayBuffer(base64String) {
  if (!base64String || typeof base64String !== 'string') {
    return new ArrayBuffer(0);
  }
  const cleanBase64 = base64String
    .replace(/^data:[^;]+;base64,/i, '')
    .replace(/\s+/g, '');
  if (!cleanBase64) return new ArrayBuffer(0);

  const binaryStr = atob(cleanBase64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes.buffer;
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

    const rawMediaRecords = await new Promise((resolve, reject) => {
      const tx = db.transaction('media', 'readonly');
      const store = tx.objectStore('media');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const mediaRecords = [];
    for (const m of rawMediaRecords) {
      let binaryData = m.data;
      if (binaryData && typeof Blob !== 'undefined' && binaryData instanceof Blob) {
        binaryData = await blobToArrayBuffer(binaryData).catch(() => null);
      }
      mediaRecords.push({
        ...m,
        data: binaryData
      });
    }

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

    // Strip sensitive geminiApiKey from exported backup files so keys never leak in shared .zip/.json files
    const safeSettings = { ...settings, geminiApiKey: '' };

    return {
      garments,
      settings: safeSettings,
      outfitHistory,
      mediaMetadata,
      mediaRecords: includeMediaRecords ? mediaRecords : []
    };
  }

  /**
   * Export JSON backup snapshot (.json) including photos & fit videos encoded as ASCII Base64 strings
   */
  async exportMetadataJson() {
    const now = new Date().toISOString();
    const { garments, settings, outfitHistory, mediaMetadata, mediaRecords } =
      await this._collectDatabaseSnapshot(true);

    const mediaMap = new Map(mediaRecords.map((m) => [m.id, m]));
    const mediaWithAscii = mediaMetadata.map((meta) => {
      const record = mediaMap.get(meta.id);
      return {
        ...meta,
        encoding: 'base64_ascii',
        dataBase64: record && record.data ? arrayBufferToBase64Ascii(record.data) : ''
      };
    });

    // Also attach photoDataBase64 / videoDataBase64 on garments as a redundant self-contained fallback
    const garmentsWithMediaFallback = garments.map((g) => {
      const photoRec = g.photoMediaId ? mediaMap.get(g.photoMediaId) : null;
      const videoRec = g.videoMediaId ? mediaMap.get(g.videoMediaId) : null;
      return {
        ...g,
        photoDataBase64: photoRec && photoRec.data ? arrayBufferToBase64Ascii(photoRec.data) : undefined,
        photoMimeType: photoRec ? photoRec.mimeType || 'image/jpeg' : undefined,
        videoDataBase64: videoRec && videoRec.data ? arrayBufferToBase64Ascii(videoRec.data) : undefined,
        videoMimeType: videoRec ? videoRec.mimeType || 'video/mp4' : undefined
      };
    });

    const payload = {
      version: 1,
      app: 'WardrobeOrganizerPWA',
      exportType: 'metadata_json',
      exportedAt: now,
      settings: {
        ...settings,
        lastBackupAt: now
      },
      garments: garmentsWithMediaFallback,
      mediaMetadata: mediaWithAscii,
      outfitHistory
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const filename = `wardrobe-status-${formatDateStamp(now)}.json`;

    await wardrobeDb.setSetting('lastBackupAt', now);
    eventBus.emit('backup:completed', {
      type: 'json',
      timestamp: now,
      count: garments.length,
      mediaCount: mediaWithAscii.length
    });

    return {
      blob,
      jsonString,
      filename,
      timestamp: now,
      count: garments.length,
      mediaCount: mediaWithAscii.length
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
    const mediaMetadata = Array.isArray(parsedData.mediaMetadata) ? parsedData.mediaMetadata : [];
    const incomingGarments = parsedData.garments || [];
    const hasEmbeddedMediaPayload =
      Boolean(loadedZip) ||
      mediaMetadata.some((m) => m && typeof m.dataBase64 === 'string' && m.dataBase64.length > 0) ||
      incomingGarments.some(
        (g) =>
          g &&
          ((typeof g.photoDataBase64 === 'string' && g.photoDataBase64.length > 0) ||
            (typeof g.videoDataBase64 === 'string' && g.videoDataBase64.length > 0))
      );

    if (restoreMode === 'replace') {
      if (hasEmbeddedMediaPayload) {
        await wardrobeDb.clearDatabase();
      } else {
        // Legacy metadata-only JSON without embedded media: clear garments/history but preserve existing local media blobs!
        const db = await wardrobeDb.openDb();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(['garments', 'outfitHistory'], 'readwrite');
          tx.objectStore('garments').clear();
          tx.objectStore('outfitHistory').clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
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

    // 2. Restore Media Blobs (from ZIP archive entries OR from Base64 ASCII strings in JSON backup)
    let restoredMediaCount = 0;
    const restoredMediaByGarment = new Map();

    if (mediaMetadata.length > 0) {
      const db = await wardrobeDb.openDb();
      for (let i = 0; i < mediaMetadata.length; i++) {
        const meta = mediaMetadata[i];
        if (!meta || !meta.id) continue;

        let arrayBuffer = null;

        if (loadedZip) {
          const ext = getExtensionFromMime(meta.mimeType);
          const folder = meta.type === 'video' ? 'videos' : 'photos';
          const candidatePath = meta.archivePath || `${folder}/${meta.id}.${ext}`;
          const zipEntry = loadedZip.file(candidatePath);
          if (zipEntry) {
            arrayBuffer = await zipEntry.async('arraybuffer');
          }
        }

        if (!arrayBuffer && typeof meta.dataBase64 === 'string' && meta.dataBase64.length > 0) {
          arrayBuffer = base64AsciiToArrayBuffer(meta.dataBase64);
        }

        if (arrayBuffer && arrayBuffer.byteLength > 0) {
          await new Promise((resolve, reject) => {
            const tx = db.transaction('media', 'readwrite');
            const store = tx.objectStore('media');
            store.put({
              id: meta.id,
              mediaId: meta.id,
              garmentId: meta.garmentId || null,
              type: meta.type || 'photo',
              mimeType: meta.mimeType || 'image/jpeg',
              data: arrayBuffer,
              size: arrayBuffer.byteLength,
              createdAt: meta.createdAt || now
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          if (meta.garmentId) {
            const entry = restoredMediaByGarment.get(meta.garmentId) || {};
            if (meta.type === 'video') {
              entry.videoMediaId = meta.id;
            } else {
              entry.photoMediaId = meta.id;
            }
            restoredMediaByGarment.set(meta.garmentId, entry);
          }
          restoredMediaCount++;
        }
      }
    }

    // 3. Restore Garments (and any inline garment photoDataBase64 / videoDataBase64 fallback)
    let restoredGarmentsCount = 0;
    const db = await wardrobeDb.openDb();

    for (const incoming of incomingGarments) {
      if (!incoming || !incoming.id) continue;

      let resolvedPhotoId =
        incoming.photoMediaId || restoredMediaByGarment.get(incoming.id)?.photoMediaId || null;
      let resolvedVideoId =
        incoming.videoMediaId || restoredMediaByGarment.get(incoming.id)?.videoMediaId || null;

      // If inline photoDataBase64 is present and media wasn't already restored from mediaMetadata
      if (typeof incoming.photoDataBase64 === 'string' && incoming.photoDataBase64.length > 0) {
        const pId = resolvedPhotoId || `photo_${incoming.id}_${Date.now()}`;
        resolvedPhotoId = pId;
        const existingMedia = await wardrobeDb.getMedia(pId);
        if (!existingMedia) {
          const buf = base64AsciiToArrayBuffer(incoming.photoDataBase64);
          if (buf && buf.byteLength > 0) {
            await wardrobeDb.saveMedia({
              id: pId,
              garmentId: incoming.id,
              type: 'photo',
              mimeType: incoming.photoMimeType || 'image/jpeg',
              data: buf
            });
            restoredMediaCount++;
          }
        }
      }

      if (typeof incoming.videoDataBase64 === 'string' && incoming.videoDataBase64.length > 0) {
        const vId = resolvedVideoId || `video_${incoming.id}_${Date.now()}`;
        resolvedVideoId = vId;
        const existingMedia = await wardrobeDb.getMedia(vId);
        if (!existingMedia) {
          const buf = base64AsciiToArrayBuffer(incoming.videoDataBase64);
          if (buf && buf.byteLength > 0) {
            await wardrobeDb.saveMedia({
              id: vId,
              garmentId: incoming.id,
              type: 'video',
              mimeType: incoming.videoMimeType || 'video/mp4',
              data: buf
            });
            restoredMediaCount++;
          }
        }
      }

      if (restoreMode === 'merge') {
        const existing = await wardrobeDb.getGarment(incoming.id);
        if (existing) {
          const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
          const incomingTime = new Date(incoming.updatedAt || incoming.createdAt || 0).getTime();
          if (incomingTime >= existingTime) {
            const { photoDataBase64, photoMimeType, videoDataBase64, videoMimeType, ...cleanIncoming } = incoming;
            await new Promise((resolve, reject) => {
              const tx = db.transaction('garments', 'readwrite');
              tx.objectStore('garments').put({
                ...existing,
                ...cleanIncoming,
                photoMediaId: resolvedPhotoId || existing.photoMediaId || null,
                videoMediaId: resolvedVideoId || existing.videoMediaId || null
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
          tempSuitability: incoming.tempSuitability || 'all-temps',
          layerRole: incoming.layerRole || (incoming.category === 'outerwear' ? 'outer' : incoming.category === 'top' ? 'base' : 'single'),
          visualDescription: incoming.visualDescription || '',
          photoMediaId: resolvedPhotoId,
          videoMediaId: resolvedVideoId,
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
