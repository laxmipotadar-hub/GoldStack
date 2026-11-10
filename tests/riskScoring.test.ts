import { describe, it, expect } from 'vitest';
import {
  calculateOrderRiskScore,
  calculateUrgencyFactor,
  calculateCompletionLagFactor,
  calculateDelaySeverityFactor,
  calculateArtisanHistoryFactor,
  RISK_WEIGHTS
} from '../shared/riskScoring.js';

describe('Order Delay-Risk Scoring Engine (Pure TypeScript)', () => {
  it('should return LOW risk with 0 score when order is 100% completed', () => {
    const res = calculateOrderRiskScore({
      daysRemaining: 5,
      totalMilestones: 6,
      completedMilestones: 6,
      delayedMilestones: 0,
      karigarHistoricalOnTimeRate: 0.9
    });

    expect(res.score).toBe(0.0);
    expect(res.level).toBe('LOW');
    expect(res.percentComplete).toBe(100);
  });

  it('should compute HIGH risk when wedding is 3 days away with delays', () => {
    const res = calculateOrderRiskScore({
      daysRemaining: 3, // High urgency
      totalMilestones: 6,
      completedMilestones: 2, // 33% complete (heavy lag)
      delayedMilestones: 1, // Already lagging
      karigarHistoricalOnTimeRate: 0.8
    });

    expect(res.level).toBe('HIGH');
    expect(res.score).toBeGreaterThan(0.65);
    expect(res.recommendation).toContain('Immediate Jeweller escalation required');
  });

  it('should compute LOW risk for comfortable schedule with high on-time artisan', () => {
    const res = calculateOrderRiskScore({
      daysRemaining: 40, // 40 days to Diwali festival
      totalMilestones: 6,
      completedMilestones: 3, // 50% done
      delayedMilestones: 0,
      karigarHistoricalOnTimeRate: 0.95
    });

    expect(res.level).toBe('LOW');
    expect(res.score).toBeLessThan(0.35);
  });

  it('should compute MEDIUM risk for moderate runway and moderate completion', () => {
    const res = calculateOrderRiskScore({
      daysRemaining: 12,
      totalMilestones: 6,
      completedMilestones: 2,
      delayedMilestones: 0,
      karigarHistoricalOnTimeRate: 0.85
    });

    expect(res.level).toBe('MEDIUM');
    expect(res.score).toBeGreaterThanOrEqual(0.35);
    expect(res.score).toBeLessThanOrEqual(0.65);
  });

  it('should verify the mathematical weights formula', () => {
    const weightsSum =
      RISK_WEIGHTS.urgency +
      RISK_WEIGHTS.completionLag +
      RISK_WEIGHTS.existingDelays +
      RISK_WEIGHTS.artisanReliability;

    expect(weightsSum).toBeCloseTo(1.0, 5);

    const input = {
      daysRemaining: 7,
      totalMilestones: 6,
      completedMilestones: 3,
      delayedMilestones: 1,
      karigarHistoricalOnTimeRate: 0.9
    };

    const res = calculateOrderRiskScore(input);

    const manualSum =
      res.factors.urgencyScore * RISK_WEIGHTS.urgency +
      res.factors.completionScore * RISK_WEIGHTS.completionLag +
      res.factors.delayScore * RISK_WEIGHTS.existingDelays +
      res.factors.historicalScore * RISK_WEIGHTS.artisanReliability;

    expect(res.score).toBeCloseTo(manualSum, 3);
  });

  it('should evaluate individual factor calculations accurately', () => {
    expect(calculateUrgencyFactor(1)).toBe(1.0);
    expect(calculateUrgencyFactor(45)).toBe(0.05);

    expect(calculateCompletionLagFactor(0, 6)).toBe(1.0);
    expect(calculateCompletionLagFactor(6, 6)).toBe(0.0);

    expect(calculateDelaySeverityFactor(0, 6)).toBe(0.0);
    expect(calculateDelaySeverityFactor(1, 6)).toBe(0.5);
    expect(calculateDelaySeverityFactor(3, 6)).toBe(1.0);

    expect(calculateArtisanHistoryFactor(1.0)).toBe(0.0);
    expect(calculateArtisanHistoryFactor(0.8)).toBe(0.2);
  });
});

