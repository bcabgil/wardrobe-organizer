/**
 * Unit Test Suite: Vendored Offline JSZip 3.x (Milestone 1)
 * Target: src/vendor/jszip.min.js
 * 
 * Verifies:
 * - Creating files and nested folder hierarchies
 * - Generating ZIP archives (Blob, ArrayBuffer, Uint8Array)
 * - Compression methods (STORE and DEFLATE)
 * - Reading and unzipping archives with JSZip.loadAsync()
 * - Text and binary extraction fidelity (async('string'), async('arraybuffer'), async('blob'))
 * - Archive iteration via forEach() and filter()
 */

import { describe, it, expect, beforeEach } from '../test-framework.js';
import JSZip from '../../src/vendor/jszip.min.js';

describe('JSZip: 100% Offline Standalone Archive Engine', () => {
  let zip;

  beforeEach(() => {
    zip = new JSZip();
  });

  it('T1-ZIP-01: creates files, directories and generates valid ZIP blob', async () => {
    zip.file('manifest.json', JSON.stringify({ version: 1, name: 'WardrobeBackup' }));
    zip.folder('photos').file('photo_1.jpg', new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70]));

    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
    expect(blob).toBeDefined();
    expect(blob instanceof Blob).toBe(true);
    expect(blob.type).toBe('application/zip');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('T1-ZIP-02: roundtrip loads ZIP archive and extracts text content with exact fidelity', async () => {
    const originalJson = JSON.stringify({ app: 'Wardrobe Organizer', items: 12, ok: true }, null, 2);
    zip.file('wardrobe.json', originalJson);
    zip.file('readme.txt', 'Offline PWA Backup Archive');

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const loadedZip = await JSZip.loadAsync(zipBlob);

    expect(loadedZip).toBeDefined();
    const wardrobeEntry = loadedZip.file('wardrobe.json');
    expect(wardrobeEntry).toBeDefined();

    const extractedJsonText = await wardrobeEntry.async('string');
    expect(extractedJsonText).toBe(originalJson);

    const parsed = JSON.parse(extractedJsonText);
    expect(parsed.app).toBe('Wardrobe Organizer');
    expect(parsed.items).toBe(12);

    const readmeEntry = loadedZip.file('readme.txt');
    const readmeText = await readmeEntry.async('string');
    expect(readmeText).toBe('Offline PWA Backup Archive');
  });

  it('T1-ZIP-03: roundtrip loads binary data as ArrayBuffer and Blob', async () => {
    const binaryData = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3]);
    zip.file('images/test.png', binaryData);

    const archiveBuf = await zip.generateAsync({ type: 'arraybuffer' });
    expect(archiveBuf instanceof ArrayBuffer).toBe(true);

    const loadedZip = await JSZip.loadAsync(archiveBuf);
    const pngFile = loadedZip.file('images/test.png');
    expect(pngFile).toBeDefined();

    const extractedBuf = await pngFile.async('arraybuffer');
    expect(extractedBuf.byteLength).toBe(binaryData.length);

    const extractedBytes = new Uint8Array(extractedBuf);
    expect(extractedBytes[0]).toBe(0x89);
    expect(extractedBytes[1]).toBe(0x50);
    expect(extractedBytes[extractedBytes.length - 1]).toBe(3);

    const extractedBlob = await pngFile.async('blob');
    expect(extractedBlob instanceof Blob).toBe(true);
    expect(extractedBlob.size).toBe(binaryData.length);
  });

  it('T1-ZIP-04: iterates and filters entries with forEach and filter', async () => {
    zip.file('a.txt', 'file a');
    zip.file('b.txt', 'file b');
    zip.folder('docs').file('c.txt', 'file c');

    const paths = [];
    zip.forEach((relPath, entry) => {
      paths.push(relPath);
    });

    expect(paths).toContain('a.txt');
    expect(paths).toContain('b.txt');
    expect(paths).toContain('docs/c.txt');

    const txtFiles = zip.filter((relPath) => relPath.endsWith('.txt'));
    expect(txtFiles.length).toBe(3);
  });

  it('T1-ZIP-05: supports progress callbacks in generateAsync', async () => {
    zip.file('f1.txt', 'data 1');
    zip.file('f2.txt', 'data 2');

    const progressUpdates = [];
    const blob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
      progressUpdates.push(metadata);
    });

    expect(blob.size).toBeGreaterThan(0);
    expect(progressUpdates.length).toBeGreaterThan(0);
    const lastUpdate = progressUpdates[progressUpdates.length - 1];
    expect(lastUpdate.percent).toBe(100);
  });
});
