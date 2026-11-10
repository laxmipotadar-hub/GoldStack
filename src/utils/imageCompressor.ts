/**
 * Client-Side Image Compression Utility
 * Enforces requirement: Max 2MB, Max 1080p (1920x1080) while preserving aspect ratio.
 */
import { CompressionResult } from '../../shared/types.js';

export type { CompressionResult };

export async function compressImage(
  file: File,
  maxDimension = 1920,
  maxSizeBytes = 2 * 1024 * 1024 // 2 MB
): Promise<CompressionResult> {
  const originalSizeBytes = file.size;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to parse image data'));
      img.onload = async () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Downscale to 1080p bounds if needed
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Canvas 2D context unavailable'));
        }

        // Draw image onto canvas
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Compress to JPEG with iteratively decreasing quality if > 2MB
        let quality = 0.88;
        let blob: Blob | null = null;
        let dataUrl = '';

        for (let attempt = 0; attempt < 5; attempt++) {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
          blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', quality));

          if (blob.size <= maxSizeBytes || quality <= 0.4) {
            break;
          }
          quality -= 0.15;
        }

        if (!blob) {
          return reject(new Error('Compression failed to generate blob'));
        }

        const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
          type: 'image/jpeg',
          lastModified: Date.now()
        });

        resolve({
          file: compressedFile,
          blob,
          dataUrl,
          originalSizeBytes,
          compressedSizeBytes: blob.size,
          width,
          height,
          compressionRatio: Number((blob.size / originalSizeBytes).toFixed(2))
        });
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}

