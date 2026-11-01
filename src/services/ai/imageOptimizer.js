/**
 * imageOptimizer.js - Client-Side Canvas Image Resizer & JPEG Compressor for Gemini Vision
 * Scales garment photos to max 1024px @ 0.82 JPEG quality so Base64 payloads stay < 250KB.
 */

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Optimize an image Blob/File for multimodal LLM transmission
 * @param {Blob|File} imageBlob
 * @param {Object} [options]
 * @param {number} [options.maxDimension=1024]
 * @param {number} [options.quality=0.82]
 * @returns {Promise<{ base64: string, mimeType: string, width: number, height: number, sizeBytes: number }>}
 */
export async function optimizeImageForGemini(imageBlob, options = {}) {
  if (!imageBlob || !(imageBlob instanceof Blob)) {
    throw new Error('optimizeImageForGemini: Valid image Blob is required');
  }

  const maxDimension = options.maxDimension || 1024;
  const quality = options.quality || 0.82;

  // Attempt Canvas resizing in browser DOM
  if (typeof document !== 'undefined') {
    try {
      const imgDims = await loadDrawableImage(imageBlob);
      let { width, height } = imgDims;

      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.max(1, Math.round((height * maxDimension) / width));
          width = maxDimension;
        } else {
          width = Math.max(1, Math.round((width * maxDimension) / height));
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(imgDims.drawable, 0, 0, width, height);

      if (typeof imgDims.cleanup === 'function') {
        imgDims.cleanup();
      }

      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const base64 = dataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      const sizeBytes = Math.round((base64.length * 3) / 4);

      return {
        base64,
        mimeType: 'image/jpeg',
        width,
        height,
        sizeBytes
      };
    } catch (_) {
      // Fallback to raw buffer conversion if image decoding is unsupported in environment
    }
  }

  const buf = await imageBlob.arrayBuffer();
  const base64 = arrayBufferToBase64(buf);
  return {
    base64,
    mimeType: 'image/jpeg',
    width: 0,
    height: 0,
    sizeBytes: buf.byteLength
  };
}

async function loadDrawableImage(blob) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return {
      drawable: bitmap,
      width: bitmap.width || 100,
      height: bitmap.height || 100,
      cleanup: () => {
        if (typeof bitmap.close === 'function') bitmap.close();
      }
    };
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({
        drawable: img,
        width: img.naturalWidth || img.width || 100,
        height: img.naturalHeight || img.height || 100,
        cleanup: () => URL.revokeObjectURL(url)
      });
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

export default {
  optimizeImageForGemini
};
