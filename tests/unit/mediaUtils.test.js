/**
 * Unit Test Suite: WebKit-Safe Media Storage & Media Utilities (Milestone 1)
 * Target: src/utils/mediaUtils.js
 * 
 * Verifies:
 * - ArrayBuffer <-> Blob safe conversions (preserves byte fidelity and MIME)
 * - ArrayBuffer and Uint8Array pass-through
 * - Base64 and DataURL chunked conversions
 * - MIME and extension bidirectional mapping and classifiers
 * - MediaUrlManager lifecycle management (create, revoke, revokeAll, leaks prevention)
 * - createSafeVideoPlayer attributes, playsinline, mobile autoplay muted enforcement
 */

import { describe, it, expect, beforeEach } from '../test-framework.js';
import {
  blobToArrayBuffer,
  arrayBufferToBlob,
  blobToDataUrl,
  dataUrlToBlob,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  getMimeTypeFromFilename,
  getExtensionFromMimeType,
  isImageMime,
  isVideoMime,
  MediaUrlManager,
  createSafeVideoPlayer
} from '../../src/utils/mediaUtils.js';

describe('mediaUtils: ArrayBuffer <-> Blob Conversion', () => {
  it('converts Blob to ArrayBuffer and back to Blob preserving size and MIME', async () => {
    const originalText = 'Hello WebKit Media Storage';
    const originalBlob = new Blob([originalText], { type: 'text/plain' });

    const buffer = await blobToArrayBuffer(originalBlob);
    expect(buffer instanceof ArrayBuffer).toBe(true);
    expect(buffer.byteLength).toBe(originalText.length);

    const restoredBlob = arrayBufferToBlob(buffer, 'text/plain');
    expect(restoredBlob.type).toBe('text/plain');
    expect(restoredBlob.size).toBe(originalText.length);
  });

  it('handles ArrayBuffer and Uint8Array pass-through cleanly', async () => {
    const bytes = new Uint8Array([10, 20, 30, 40]);
    const bufferFromView = await blobToArrayBuffer(bytes);
    expect(bufferFromView.byteLength).toBe(4);

    const bufferFromBuffer = await blobToArrayBuffer(bytes.buffer);
    expect(bufferFromBuffer.byteLength).toBe(4);
  });

  it('throws TypeError on null or undefined input to blobToArrayBuffer', async () => {
    let errorCaught = false;
    try {
      await blobToArrayBuffer(null);
    } catch (e) {
      errorCaught = true;
      expect(e instanceof TypeError).toBe(true);
    }
    expect(errorCaught).toBe(true);
  });

  it('throws TypeError on null or undefined input to arrayBufferToBlob', () => {
    let errorCaught = false;
    try {
      arrayBufferToBlob(null);
    } catch (e) {
      errorCaught = true;
      expect(e instanceof TypeError).toBe(true);
    }
    expect(errorCaught).toBe(true);
  });

  it('defaults mimeType to application/octet-stream if omitted or empty', () => {
    const buf = new ArrayBuffer(8);
    const blob1 = arrayBufferToBlob(buf);
    expect(blob1.type).toBe('application/octet-stream');

    const blob2 = arrayBufferToBlob(buf, '');
    expect(blob2.type).toBe('application/octet-stream');
  });
});

describe('mediaUtils: Base64 and DataURL Conversions', () => {
  it('encodes and decodes ArrayBuffer to Base64 accurately with chunking', () => {
    const data = new Uint8Array([1, 2, 3, 255, 0, 128]);
    const base64 = arrayBufferToBase64(data.buffer);
    expect(typeof base64).toBe('string');
    expect(base64.length).toBeGreaterThan(0);

    const decodedBuf = base64ToArrayBuffer(base64);
    const decodedBytes = new Uint8Array(decodedBuf);
    expect(decodedBytes.length).toBe(6);
    expect(decodedBytes[0]).toBe(1);
    expect(decodedBytes[3]).toBe(255);
  });

  it('converts Blob to DataURL and back to Blob', async () => {
    const blob = new Blob(['PNG_MOCK_IMAGE_DATA'], { type: 'image/png' });
    const dataUrl = await blobToDataUrl(blob);
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);

    const reconstituted = dataUrlToBlob(dataUrl);
    expect(reconstituted.type).toBe('image/png');
    expect(reconstituted.size).toBe(blob.size);
  });
});

describe('mediaUtils: MIME and Extension Detection', () => {
  it('correctly maps extensions to MIME types', () => {
    expect(getMimeTypeFromFilename('garment.mov')).toBe('video/quicktime');
    expect(getMimeTypeFromFilename('fit.mp4')).toBe('video/mp4');
    expect(getMimeTypeFromFilename('photo.jpg')).toBe('image/jpeg');
    expect(getMimeTypeFromFilename('photo.png')).toBe('image/png');
    expect(getMimeTypeFromFilename('clip.webm')).toBe('video/webm');
    expect(getMimeTypeFromFilename('unknown.xyz')).toBe('application/octet-stream');
  });

  it('correctly maps MIME types to extensions', () => {
    expect(getExtensionFromMimeType('video/quicktime')).toBe('.mov');
    expect(getExtensionFromMimeType('video/mp4')).toBe('.mp4');
    expect(getExtensionFromMimeType('image/jpeg')).toBe('.jpg');
    expect(getExtensionFromMimeType('image/png')).toBe('.png');
    expect(getExtensionFromMimeType('video/webm')).toBe('.webm');
    expect(getExtensionFromMimeType('application/octet-stream')).toBe('.bin');
  });

  it('accurately classifies image and video MIME types', () => {
    expect(isImageMime('image/jpeg')).toBe(true);
    expect(isImageMime('image/png')).toBe(true);
    expect(isImageMime('video/mp4')).toBe(false);

    expect(isVideoMime('video/quicktime')).toBe(true);
    expect(isVideoMime('video/mp4')).toBe(true);
    expect(isVideoMime('image/jpeg')).toBe(false);
  });
});

describe('mediaUtils: MediaUrlManager Lifecycle', () => {
  let mgr;

  beforeEach(() => {
    mgr = new MediaUrlManager();
  });

  it('creates and tracks Object URLs for Blobs', () => {
    const blob = new Blob(['media data'], { type: 'text/plain' });
    const url = mgr.createUrl(blob);

    expect(typeof url).toBe('string');
    expect(url.startsWith('blob:')).toBe(true);
    expect(mgr.size).toBe(1);
    expect(mgr.getActiveCount()).toBe(1);
    expect(mgr.has(url)).toBe(true);
    expect(mgr.getActiveUrls().length).toBe(1);
    expect(mgr.getActiveUrls()[0]).toBe(url);
  });

  it('returns empty string when given null or undefined blob', () => {
    expect(mgr.createUrl(null)).toBe('');
    expect(mgr.createUrl(undefined)).toBe('');
    expect(mgr.size).toBe(0);
    expect(mgr.getActiveCount()).toBe(0);
    expect(mgr.getActiveUrls().length).toBe(0);
  });

  it('revokes a specific URL and removes it from tracking', () => {
    const blob = new Blob(['media data'], { type: 'text/plain' });
    const url = mgr.createUrl(blob);

    expect(mgr.has(url)).toBe(true);
    const revoked = mgr.revoke(url);
    expect(revoked).toBe(true);
    expect(mgr.has(url)).toBe(false);
    expect(mgr.size).toBe(0);
    expect(mgr.getActiveCount()).toBe(0);
    expect(mgr.getActiveUrls().length).toBe(0);

    // Second revoke returns false
    expect(mgr.revoke(url)).toBe(false);
  });

  it('revokes all active URLs in revokeAll()', () => {
    const blob1 = new Blob(['one'], { type: 'text/plain' });
    const blob2 = new Blob(['two'], { type: 'text/plain' });
    const blob3 = new Blob(['three'], { type: 'text/plain' });

    mgr.createUrl(blob1);
    mgr.createUrl(blob2);
    mgr.createUrl(blob3);

    expect(mgr.size).toBe(3);
    expect(mgr.getActiveCount()).toBe(3);
    expect(mgr.getActiveUrls().length).toBe(3);
    const count = mgr.revokeAll();
    expect(count).toBe(3);
    expect(mgr.size).toBe(0);
    expect(mgr.getActiveCount()).toBe(0);
    expect(mgr.activeUrls.length).toBe(0);
    expect(mgr.getActiveUrls().length).toBe(0);
  });

  it('clears all active URLs using clear() alias', () => {
    const blob1 = new Blob(['one'], { type: 'text/plain' });
    const blob2 = new Blob(['two'], { type: 'text/plain' });

    mgr.createUrl(blob1);
    mgr.createUrl(blob2);

    expect(mgr.getActiveCount()).toBe(2);
    const count = mgr.clear();
    expect(count).toBe(2);
    expect(mgr.getActiveCount()).toBe(0);
    expect(mgr.getActiveUrls().length).toBe(0);
  });
});

describe('mediaUtils: createSafeVideoPlayer Attributes & Safeguards', () => {
  it('creates HTMLVideoElement with WebKit and Blink playsinline safeguards', () => {
    const video = createSafeVideoPlayer('blob:http://localhost/test-video', 'video/quicktime', 'blob:http://localhost/poster');

    expect(video.tagName.toLowerCase()).toBe('video');
    expect(video.hasAttribute('playsinline')).toBe(true);
    expect(video.hasAttribute('webkit-playsinline')).toBe(true);
    expect(video.getAttribute('preload')).toBe('metadata');
    expect(video.hasAttribute('controls')).toBe(true);
    expect(video.getAttribute('controlsList')).toBe('nodownload noplaybackrate');
    expect(video.hasAttribute('disablePictureInPicture')).toBe(true);
    expect(video.className).toBe('garment-fit-video');
    expect(video.poster).toBe('blob:http://localhost/poster');

    // Child source check
    const source = video.querySelector('source');
    expect(source !== null).toBe(true);
    expect(source.src).toBe('blob:http://localhost/test-video');
    expect(source.type).toBe('video/quicktime');
  });

  it('enforces muted attribute when autoplay is requested per mobile policy', () => {
    const video = createSafeVideoPlayer('blob:http://localhost/video2', 'video/mp4', '', { autoplay: true });
    expect(video.autoplay).toBe(true);
    expect(video.muted).toBe(true);
  });

  it('applies custom options cleanly', () => {
    const video = createSafeVideoPlayer('blob:http://localhost/video3', 'video/webm', '', {
      controls: false,
      preload: 'none',
      loop: true,
      className: 'custom-video-class'
    });

    expect(video.hasAttribute('controls')).toBe(false);
    expect(video.getAttribute('preload')).toBe('none');
    expect(video.loop).toBe(true);
    expect(video.className).toBe('custom-video-class');
  });
});
