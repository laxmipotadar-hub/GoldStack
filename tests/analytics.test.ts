import { describe, it, expect } from 'vitest';
import {
  calculateWeightedMovingAverage,
  calculateRollingWma,
  calculateSimpleAverage,
  determineTrendDirection
} from '../shared/analytics.js';

describe('Weighted Moving Average (WMA) & Wastage Analytics Engine', () => {
  describe('calculateWeightedMovingAverage', () => {
    it('should return 0 for an empty array', () => {
      expect(calculateWeightedMovingAverage([])).toBe(0);
    });

    it('should return the exact single value when array has 1 element', () => {
      expect(calculateWeightedMovingAverage([7.5])).toBe(7.5);
    });

    it('should calculate linear WMA weighting most recent values higher', () => {
      // Series in chronological order: [10, 20, 30]
      // Weights: [1, 2, 3], sum = 6
      // Weighted sum: 10*1 + 20*2 + 30*3 = 10 + 40 + 90 = 140
      // 140 / 6 = 23.3333
      const wma = calculateWeightedMovingAverage([10, 20, 30]);
      expect(wma).toBeCloseTo(23.3333, 3);

      // Simple average would be 20, WMA must be strictly greater because 30 is most recent
      const sma = calculateSimpleAverage([10, 20, 30]);
      expect(sma).toBe(20);
      expect(wma).toBeGreaterThan(sma);
    });

    it('should weight recent low wastage heavily for a decreasing wastage trend', () => {
      // Series in chronological order: [30, 20, 10]
      // Weights: [1, 2, 3], sum = 6
      // Weighted sum: 30*1 + 20*2 + 10*3 = 30 + 40 + 30 = 100
      // 100 / 6 = 16.6667
      const wma = calculateWeightedMovingAverage([30, 20, 10]);
      expect(wma).toBeCloseTo(16.6667, 3);

      // Simple average would be 20, WMA must be strictly lower because 10 is most recent
      const sma = calculateSimpleAverage([30, 20, 10]);
      expect(sma).toBe(20);
      expect(wma).toBeLessThan(sma);
    });

    it('should return identical value when all elements in array are equal', () => {
      expect(calculateWeightedMovingAverage([6.5, 6.5, 6.5, 6.5])).toBe(6.5);
    });

    it('should compute exact result with realistic jewellery wastage percentages', () => {
      // Four consecutive returns: 7.2%, 6.8%, 6.4%, 5.9% (artisan improving craftsmanship)
      // Weights: 1, 2, 3, 4 (sum = 10)
      // Weighted sum: 7.2*1 + 6.8*2 + 6.4*3 + 5.9*4 = 7.2 + 13.6 + 19.2 + 23.6 = 63.6
      // WMA = 63.6 / 10 = 6.36%
      const values = [7.2, 6.8, 6.4, 5.9];
      const wma = calculateWeightedMovingAverage(values);
      expect(wma).toBe(6.36);
    });

    it('should accept custom explicit weights', () => {
      const values = [10, 20];
      const weights = [0.25, 0.75]; // sum = 1.0
      // 10*0.25 + 20*0.75 = 2.5 + 15 = 17.5
      const wma = calculateWeightedMovingAverage(values, weights);
      expect(wma).toBe(17.5);
    });

    it('should throw error if custom weights length does not match values length', () => {
      expect(() => calculateWeightedMovingAverage([10, 20, 30], [1, 2])).toThrow(
        /Custom weights length \(2\) must match values length \(3\)/
      );
    });

    it('should throw error if sum of weights is zero or negative', () => {
      expect(() => calculateWeightedMovingAverage([10, 20], [0, 0])).toThrow(
        /Sum of weights must be strictly greater than zero/
      );
    });
  });

  describe('calculateRollingWma', () => {
    it('should return empty array for empty input', () => {
      expect(calculateRollingWma([])).toEqual([]);
    });

    it('should compute rolling WMA over a sliding window', () => {
      const series = [10, 20, 30, 40];
      // Window size 2:
      // index 0: [10] -> 10
      // index 1: [10, 20] -> (10*1 + 20*2) / 3 = 50 / 3 = 16.6667
      // index 2: [20, 30] -> (20*1 + 30*2) / 3 = 80 / 3 = 26.6667
      // index 3: [30, 40] -> (30*1 + 40*2) / 3 = 110 / 3 = 36.6667
      const rolling = calculateRollingWma(series, 2);
      expect(rolling).toHaveLength(4);
      expect(rolling[0]).toBe(10);
      expect(rolling[1]).toBeCloseTo(16.6667, 3);
      expect(rolling[2]).toBeCloseTo(26.6667, 3);
      expect(rolling[3]).toBeCloseTo(36.6667, 3);
    });
  });

  describe('calculateSimpleAverage', () => {
    it('should calculate correct arithmetic mean', () => {
      expect(calculateSimpleAverage([5, 10, 15])).toBe(10);
      expect(calculateSimpleAverage([])).toBe(0);
    });
  });

  describe('determineTrendDirection', () => {
    it('should recognize an IMPROVING trend when variance is reducing', () => {
      // Early returns had high positive variance (excess loss), recent returns have low or negative variance
      const variances = [2.5, 2.0, 1.5, 0.4, -0.2, -0.5];
      expect(determineTrendDirection(variances)).toBe('IMPROVING');
    });

    it('should recognize a WORSENING trend when variance is increasing', () => {
      // Early returns had low variance, recent returns have rising excess loss
      const variances = [-0.5, 0.1, 0.4, 1.8, 2.4, 3.1];
      expect(determineTrendDirection(variances)).toBe('WORSENING');
    });

    it('should return STABLE when variance changes are minimal', () => {
      const variances = [0.2, 0.3, 0.25, 0.22, 0.28];
      expect(determineTrendDirection(variances)).toBe('STABLE');
    });
  });
});

