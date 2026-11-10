/**
 * Browser Perceptual Hashing (dHash) Utility
 * Generates 64-bit difference hash for tamper detection of jewellery photo evidence
 */

export async function generateClientPerceptualHash(imageSource: File | Blob | HTMLImageElement): Promise<string> {
  let img: HTMLImageElement;

  if (imageSource instanceof HTMLImageElement) {
    img = imageSource;
  } else {
    img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(imageSource);
      const element = new Image();
      element.onload = () => {
        URL.revokeObjectURL(url);
        resolve(element);
      };
      element.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image for perceptual hashing'));
      };
      element.src = url;
    });
  }

  // Draw on a 9-column, 8-row canvas
  const canvas = document.createElement('canvas');
  canvas.width = 9;
  canvas.height = 8;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  ctx.drawImage(img, 0, 0, 9, 8);
  const imageData = ctx.getImageData(0, 0, 9, 8);
  const data = imageData.data;

  // Compute 9x8 grayscale luminance values
  const grays: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Standard ITU-R BT.601 luma formula
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    grays.push(gray);
  }

  // Compare adjacent pixels in each row: 8 comparisons * 8 rows = 64 bits
  let binary = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = grays[row * 9 + col];
      const right = grays[row * 9 + col + 1];
      binary += right > left ? '1' : '0';
    }
  }

  // Format as 16-character hex string
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    const nibble = binary.slice(i, i + 4);
    hex += parseInt(nibble, 2).toString(16);
  }

  return hex.padStart(16, '0');
}

/**
 * Compare two perceptual hashes and return similarity percentage (0% to 100%)
 */
export function getPerceptualSimilarity(hashA: string, hashB: string): number {
  if (!hashA || !hashB) return 0;
  if (hashA === hashB) return 100;

  try {
    const b1 = BigInt('0x' + hashA);
    const b2 = BigInt('0x' + hashB);
    let xor = b1 ^ b2;
    let differingBits = 0;
    while (xor > 0n) {
      if (xor & 1n) differingBits++;
      xor >>= 1n;
    }
    const similarity = ((64 - differingBits) / 64) * 100;
    return Math.max(0, Math.round(similarity));
  } catch {
    return 0;
  }
}

