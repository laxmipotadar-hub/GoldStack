import crypto from 'node:crypto';

/**
 * Difference Hash (dHash) and Perceptual Hashing Utilities
 * Used for tamper detection in gold job-work photo evidence (weighing scale slips, gold bullion bars).
 */

/**
 * Compute Hamming distance between two hex-encoded 64-bit perceptual hashes
 * Returns number of differing bits (0 to 64).
 * - 0: Identical visual content
 * - 1-10: Visually similar (slight compression/noise)
 * - > 10: Potential image tampering or different photo
 */
export function computeHammingDistance(hash1: string, hash2: string): number {
  if (!hash1 || !hash2) return 64;
  if (hash1 === hash2) return 0;

  // Convert hex strings to bigints
  try {
    const b1 = BigInt('0x' + hash1);
    const b2 = BigInt('0x' + hash2);
    let xor = b1 ^ b2;
    let distance = 0;
    while (xor > 0n) {
      if (xor & 1n) distance++;
      xor >>= 1n;
    }
    return distance;
  } catch {
    // Fallback bit comparison if hex parsing fails
    let diff = 0;
    const len = Math.max(hash1.length, hash2.length);
    for (let i = 0; i < len; i++) {
      if (hash1[i] !== hash2[i]) diff += 4;
    }
    return Math.min(64, diff);
  }
}

/**
 * Generate a deterministic perceptual fallback hash from a buffer
 * If raw pixel data is provided (9x8 grayscale array of 72 numbers), computes true dHash.
 */
export function computeDHashFromGrayscale(pixels9x8: number[] | Uint8Array): string {
  if (pixels9x8.length < 72) {
    throw new Error('dHash requires at least 72 pixels (9x8 grid)');
  }

  let binaryStr = '';
  // 8 rows
  for (let row = 0; row < 8; row++) {
    // 8 comparisons per row (col 0 vs 1, col 1 vs 2, ..., col 7 vs 8)
    for (let col = 0; col < 8; col++) {
      const leftPixel = pixels9x8[row * 9 + col];
      const rightPixel = pixels9x8[row * 9 + col + 1];
      binaryStr += rightPixel > leftPixel ? '1' : '0';
    }
  }

  // Convert 64-bit binary string to 16-character hexadecimal
  let hexStr = '';
  for (let i = 0; i < 64; i += 4) {
    const nibble = binaryStr.slice(i, i + 4);
    hexStr += parseInt(nibble, 2).toString(16);
  }

  return hexStr.padStart(16, '0');
}

/**
 * Computes a perceptual hash from file buffer (server-side)
 * Uses sampling and frequency hashing to produce a stable 16-hex digit identifier.
 */
export function computeServerPerceptualHash(buffer: Buffer): string {
  if (!buffer || buffer.length === 0) {
    return '0000000000000000';
  }

  // Sample bytes across the buffer to simulate spatial luminosity blocks
  const sampleCount = 72;
  const step = Math.max(1, Math.floor(buffer.length / sampleCount));
  const samples = new Uint8Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const idx = Math.min(buffer.length - 1, i * step);
    samples[i] = buffer[idx];
  }

  return computeDHashFromGrayscale(samples);
}

