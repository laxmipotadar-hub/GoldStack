/**
 * Pure TypeScript Risk Scoring Engine for Jewellery Occasion Orders
 *
 * Computes delay-risk probability without external ML dependencies for MVP.
 * Evaluates a weighted combination of:
 * 1. Urgency: Days remaining until the customer's wedding/festival occasion date
 * 2. Progress Lag: Percentage of milestones completed vs total milestones
 * 3. Milestone Delays: Count of stages already marked DELAYED or with negative float
 * 4. Artisan Reliability: Historical on-time delivery rate computed from delivered orders
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RiskFactors {
  urgencyScore: number; // 0.0 (lots of time) to 1.0 (extreme urgency)
  completionScore: number; // 0.0 (100% complete) to 1.0 (0% complete)
  delayScore: number; // 0.0 (no delays) to 1.0 (multiple delays)
  historicalScore: number; // 0.0 (100% on-time artisan) to 1.0 (unreliable)
}

export interface RiskScoreInput {
  daysRemaining: number; // Days to occasion
  totalMilestones: number;
  completedMilestones: number;
  delayedMilestones: number;
  karigarHistoricalOnTimeRate?: number; // 0.0 to 1.0 (default: 0.85)
}

export interface RiskScoreResult {
  score: number; // 0.00 to 1.00 (numeric probability)
  percentage: number; // 0 to 100
  level: RiskLevel; // 'LOW' (< 0.35), 'MEDIUM' (0.35 - 0.65), 'HIGH' (> 0.65)
  factors: RiskFactors;
  daysRemaining: number;
  percentComplete: number;
  delayedMilestonesCount: number;
  karigarOnTimeRate: number;
  summary: string;
  recommendation: string;
}

// Weights sum to 1.0
export const RISK_WEIGHTS = {
  urgency: 0.35, // High impact: wedding date deadline cannot move
  completionLag: 0.25, // Unfinished progress ratio
  existingDelays: 0.25, // Cascade impact from already lagged steps
  artisanReliability: 0.15 // Prior bench history
};

/**
 * Evaluates urgency score based on remaining calendar days to customer occasion
 */
export function calculateUrgencyFactor(daysRemaining: number): number {
  if (daysRemaining <= 1) return 1.0; // Imminent deadline
  if (daysRemaining <= 3) return 0.95;
  if (daysRemaining <= 7) return 0.80;
  if (daysRemaining <= 14) return 0.50;
  if (daysRemaining <= 21) return 0.30;
  if (daysRemaining <= 30) return 0.15;
  return 0.05; // Generous runway (> 30 days)
}

/**
 * Calculates milestone completion lag factor
 */
export function calculateCompletionLagFactor(completed: number, total: number): number {
  if (total <= 0) return 0.5;
  const ratio = Math.max(0, Math.min(1, completed / total));
  // If 100% complete, lag factor is 0. If 0% complete, lag factor is 1.0
  return Number((1.0 - ratio).toFixed(4));
}

/**
 * Calculates existing delay severity factor
 */
export function calculateDelaySeverityFactor(delayedCount: number, totalMilestones: number): number {
  if (delayedCount <= 0) return 0.0;
  if (delayedCount === 1) return 0.5;
  if (delayedCount === 2) return 0.8;
  return 1.0; // 3+ milestones delayed indicates systemic workshop bottleneck
}

/**
 * Calculates artisan historical risk factor (1.0 - onTimeRate)
 */
export function calculateArtisanHistoryFactor(onTimeRate: number): number {
  const rate = Math.max(0, Math.min(1, onTimeRate));
  return Number((1.0 - rate).toFixed(4));
}

/**
 * Pure function: Computes comprehensive delay-risk score and classification
 */
export function calculateOrderRiskScore(input: RiskScoreInput): RiskScoreResult {
  const {
    daysRemaining,
    totalMilestones,
    completedMilestones,
    delayedMilestones,
    karigarHistoricalOnTimeRate = 0.85
  } = input;

  // 1. If all milestones are already completed, risk is definitively 0 (LOW)
  if (totalMilestones > 0 && completedMilestones >= totalMilestones) {
    return {
      score: 0.0,
      percentage: 0,
      level: 'LOW',
      factors: {
        urgencyScore: 0.0,
        completionScore: 0.0,
        delayScore: 0.0,
        historicalScore: 0.0
      },
      daysRemaining,
      percentComplete: 100,
      delayedMilestonesCount: 0,
      karigarOnTimeRate: karigarHistoricalOnTimeRate,
      summary: 'Order completed and ready for delivery.',
      recommendation: 'Verify hallmarking certificate and package for auspicious handover.'
    };
  }

  // 2. Compute individual normalized risk factors (each in [0.0, 1.0])
  const urgencyFactor = calculateUrgencyFactor(daysRemaining);
  const completionLagFactor = calculateCompletionLagFactor(completedMilestones, totalMilestones);
  const delayFactor = calculateDelaySeverityFactor(delayedMilestones, totalMilestones);
  const historyFactor = calculateArtisanHistoryFactor(karigarHistoricalOnTimeRate);

  // 3. Compute weighted sum
  const rawScore =
    urgencyFactor * RISK_WEIGHTS.urgency +
    completionLagFactor * RISK_WEIGHTS.completionLag +
    delayFactor * RISK_WEIGHTS.existingDelays +
    historyFactor * RISK_WEIGHTS.artisanReliability;

  const score = Number(Math.max(0, Math.min(1.0, rawScore)).toFixed(4));
  const percentage = Math.round(score * 100);

  // 4. Threshold classification: LOW (< 0.35) | MEDIUM (0.35 - 0.65) | HIGH (> 0.65)
  // Also: If daysRemaining <= 3 and there are existing delays, automatically elevate to HIGH!
  let level: RiskLevel = 'LOW';
  if (score > 0.65 || (daysRemaining <= 4 && delayedMilestones > 0)) {
    level = 'HIGH';
  } else if (score >= 0.35) {
    level = 'MEDIUM';
  }

  const percentComplete =
    totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

  // 5. Contextual summary & recommendation
  let summary = '';
  let recommendation = '';

  if (level === 'HIGH') {
    summary = `High Delay Risk (${percentage}%): ${daysRemaining} days to occasion with ${delayedMilestones} delayed stage(s).`;
    recommendation =
      'Immediate Jeweller escalation required: assign supplementary artisan or fast-track setting & polishing.';
  } else if (level === 'MEDIUM') {
    summary = `Moderate Watch (${percentage}%): ${daysRemaining} days remaining, ${percentComplete}% complete.`;
    recommendation = 'Monitor casting/setting handover closely to prevent critical path slippage.';
  } else {
    summary = `On Track (${percentage}%): Adequate buffer for wedding date delivery.`;
    recommendation = 'Maintain regular bench pace and standard hallmarking QC schedule.';
  }

  return {
    score,
    percentage,
    level,
    factors: {
      urgencyScore: Number(urgencyFactor.toFixed(4)),
      completionScore: Number(completionLagFactor.toFixed(4)),
      delayScore: Number(delayFactor.toFixed(4)),
      historicalScore: Number(historyFactor.toFixed(4))
    },
    daysRemaining,
    percentComplete,
    delayedMilestonesCount: delayedMilestones,
    karigarOnTimeRate: karigarHistoricalOnTimeRate,
    summary,
    recommendation
  };
}
