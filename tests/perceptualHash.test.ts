import { describe, it, expect } from 'vitest';
import {
  computeHammingDistance,
  computeDHashFromGrayscale
} from '../server/crypto/perceptualHash.js';
import { getPerceptualSimilarity } from '../src/utils/perceptualHash.js';

describe('Perceptual Hashing & Tamper Detection', () => {
  it('should return 0 Hamming distance and 100% similarity for identical perceptual hashes', () => {
    const hash = 'a4b7f091c3d2e1a8';
    expect(computeHammingDistance(hash, hash)).toBe(0);
    expect(getPerceptualSimilarity(hash, hash)).toBe(100);
  });

  it('should detect differing visual contents with higher Hamming distance', () => {
    const hashA = '0000000000000000';
    const hashB = 'ffffffffffffffff';

    const distance = computeHammingDistance(hashA, hashB);
    expect(distance).toBe(64); // Complete bitwise inversion
    expect(getPerceptualSimilarity(hashA, hashB)).toBe(0);
  });

  it('should correctly compute 16-hex digit dHash from 9x8 grayscale matrix', () => {
    // 72 values: 9 columns x 8 rows
    // Construct pattern where right pixel is always brighter than left pixel
    const ascendingRow = [10, 20, 30, 40, 50, 60, 70, 80, 90];
    const grid: number[] = [];
    for (let r = 0; r < 8; r++) {
      grid.push(...ascendingRow);
    }

    const dHash = computeDHashFromGrayscale(grid);
    // 8 comparisons per row all true => 8 ones => 0xFF per row => 'ffffffffffffffff'
    expect(dHash).toBe('ffffffffffffffff');
  });

  it('should tolerate minor bit changes (similarity > 90% for slight compression noise)', () => {
    const originalHash = 'a4b7f091c3d2e1a8';
    // Flip 2 bits
    const slightNoiseHash = 'a4b7f091c3d2e1aa';

    const distance = computeHammingDistance(originalHash, slightNoiseHash);
    expect(distance).toBeLessThanOrEqual(5);

    const similarity = getPerceptualSimilarity(originalHash, slightNoiseHash);
    expect(similarity).toBeGreaterThan(90);
  });
});

