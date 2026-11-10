/**
 * Pure TypeScript Karigar Trust Scoring Engine for GoldStack
 * Computes multi-factor reputation scores from real workshop data (Orders, Milestones, Wastage, Disputes, Response Times)
 * Uses Bayesian smoothing with prior m=10 to solve cold-start distortion.
 */

import {
  TrustFactorBreakdown,
  KarigarTrustFactors,
  KarigarRawMetrics,
  KarigarTrustScoreCalculation
} from './types.js';

export const TRUST_CALCULATION_VERSION = 'v1.0';

/**
 * Prior weight (m) for Bayesian smoothing.
 * Represents pseudo-observations required before an artisan's observed record
 * completely dominates the prior global benchmark.
 */
export const BAYESIAN_PRIOR_WEIGHT = 10;

/**
 * Standard industry guild benchmarks (C) used as prior expectations for cold-start artisans.
 * All factors scaled 0 to 5.
 */
export const DEFAULT_FACTOR_BENCHMARKS = {
  on_time_delivery: 4.0,           // ~80% on-time delivery rate
  wastage_adherence: 4.2,          // ~84% adherence within agreed tolerances
  quality_acceptance: 4.5,         // ~90% first-pass QC hallmark approval
  dispute_frequency: 4.5,          // ~90% smooth, undisputed job completions
  communication_responsiveness: 3.8 // ~4-6 hour average dual-confirmation response
} as const;

/**
 * Factor weighting for composite trust score.
 * Must sum exactly to 1.00 (100%).
 */
export const FACTOR_WEIGHTS = {
  on_time_delivery: 0.30,           // 30% - Delivery predictability (critical for wedding dates)
  wastage_adherence: 0.25,          // 25% - Gold conservation & agreed tolerance compliance
  quality_acceptance: 0.20,         // 20% - First-time craftsmanship & hallmark standards
  dispute_frequency: 0.15,          // 15% - Integrity and low disagreement frequency
  communication_responsiveness: 0.10 // 10% - Timeliness of dual-confirmation ledger signatures
} as const;

export type TrustFactorKey = keyof typeof FACTOR_WEIGHTS;

/**
 * Verifies that factor weights sum to 1.00
 */
export function verifyFactorWeights(): { isValid: boolean; totalWeight: number } {
  const sum = Object.values(FACTOR_WEIGHTS).reduce((acc, w) => acc + w, 0);
  const rounded = Number(sum.toFixed(4));
  return {
    isValid: rounded === 1.0,
    totalWeight: rounded
  };
}

/**
 * Pure Bayesian Average formula:
 * score = (v / (v + m)) * R + (m / (v + m)) * C
 *
 * @param sampleSize v - Observed sample count (orders, returns, transactions)
 * @param rawScore R - Observed mean score (0 - 5)
 * @param globalAverage C - Population benchmark / prior expectation (0 - 5)
 * @param priorWeight m - Strength of prior (default: 10)
 */
export function calculateBayesianAverage(
  sampleSize: number,
  rawScore: number,
  globalAverage: number,
  priorWeight: number = BAYESIAN_PRIOR_WEIGHT
): number {
  if (sampleSize <= 0) {
    return Number(globalAverage.toFixed(2));
  }

  const v = Math.max(0, sampleSize);
  const m = Math.max(1, priorWeight);
  const R = Math.max(0, Math.min(5, rawScore));
  const C = Math.max(0, Math.min(5, globalAverage));

  const weighted = (v / (v + m)) * R + (m / (v + m)) * C;
  return Number(weighted.toFixed(2));
}

/**
 * Computes individual factor breakdown with Bayesian smoothing and weighting.
 */
export function computeFactorBreakdown(
  factorKey: TrustFactorKey,
  rawScore: number,
  sampleSize: number,
  customBenchmark?: number,
  priorWeight: number = BAYESIAN_PRIOR_WEIGHT
): TrustFactorBreakdown {
  const weight = FACTOR_WEIGHTS[factorKey];
  const benchmark = customBenchmark !== undefined ? customBenchmark : DEFAULT_FACTOR_BENCHMARKS[factorKey];
  const boundedRaw = Number(Math.max(0, Math.min(5, rawScore)).toFixed(2));
  const bayesianScore = calculateBayesianAverage(sampleSize, boundedRaw, benchmark, priorWeight);
  const weightedScore = Number((bayesianScore * weight).toFixed(4));

  return {
    raw_score: boundedRaw,
    bayesian_score: bayesianScore,
    weight,
    weighted_score: weightedScore,
    sample_size: sampleSize,
    benchmark
  };
}

/**
 * Derives raw factor scores (0 to 5) from raw activity counters.
 */
export function deriveRawFactorScores(metrics: KarigarRawMetrics): {
  on_time_delivery: { score: number; sampleSize: number };
  wastage_adherence: { score: number; sampleSize: number };
  quality_acceptance: { score: number; sampleSize: number };
  dispute_frequency: { score: number; sampleSize: number };
  communication_responsiveness: { score: number; sampleSize: number };
} {
  // 1. On-Time Delivery: 0-5
  // If 0 delivered orders: sampleSize=0, rawScore=benchmark (handled in Bayesian avg)
  let onTimeScore: number = DEFAULT_FACTOR_BENCHMARKS.on_time_delivery;
  const orderSample = metrics.totalOrders;
  if (orderSample > 0) {
    const onTimeRate = Math.min(1, Math.max(0, metrics.onTimeOrders / orderSample));
    onTimeScore = onTimeRate * 5.0;
  }

  // 2. Wastage Adherence: 0-5
  let wastageScore: number = DEFAULT_FACTOR_BENCHMARKS.wastage_adherence;
  const returnSample = metrics.totalReturns;
  if (returnSample > 0) {
    const withinRate = Math.min(1, Math.max(0, metrics.withinToleranceReturns / returnSample));
    const excessPenalty = Math.max(0, Math.min(2.5, (metrics.avgExcessWastagePct / 10) * 1.5));
    wastageScore = Math.max(0, Math.min(5, withinRate * 5.0 - excessPenalty));
  }

  // 3. Quality Acceptance: 0-5
  let qualityScore: number = DEFAULT_FACTOR_BENCHMARKS.quality_acceptance;
  const qcSample = metrics.totalQcReviews;
  if (qcSample > 0) {
    const passRate = Math.min(1, Math.max(0, metrics.passedQcReviews / qcSample));
    qualityScore = passRate * 5.0;
  }

  // 4. Dispute Frequency: 0-5
  let disputeScore: number = DEFAULT_FACTOR_BENCHMARKS.dispute_frequency;
  const disputeSample = metrics.totalTransactions;
  if (disputeSample > 0) {
    const disputeRate = Math.min(1, Math.max(0, metrics.disputedTransactions / disputeSample));
    // 0 disputes = 5.0, 10% disputes = 3.5, 33%+ disputes = 0
    disputeScore = Math.max(0, Math.min(5, 5.0 * (1 - 3.0 * disputeRate)));
  }

  // 5. Communication Responsiveness: 0-5 (Proxy: confirmation turnaround time from 24h deadline)
  let commScore: number = DEFAULT_FACTOR_BENCHMARKS.communication_responsiveness;
  const commSample = metrics.totalConfirmations;
  if (commSample > 0) {
    const avgHours = metrics.avgResponseHours;
    if (avgHours <= 1.0) {
      commScore = 5.0;
    } else if (avgHours >= 24.0) {
      commScore = 1.0;
    } else {
      // Linear interpolation between 1h (5.0) and 24h (1.0)
      commScore = 5.0 - ((avgHours - 1.0) / 23.0) * 4.0;
    }
  }

  return {
    on_time_delivery: { score: Number(onTimeScore.toFixed(2)), sampleSize: orderSample },
    wastage_adherence: { score: Number(wastageScore.toFixed(2)), sampleSize: returnSample },
    quality_acceptance: { score: Number(qualityScore.toFixed(2)), sampleSize: qcSample },
    dispute_frequency: { score: Number(disputeScore.toFixed(2)), sampleSize: disputeSample },
    communication_responsiveness: { score: Number(commScore.toFixed(2)), sampleSize: commSample }
  };
}

/**
 * Computes composite trust score and complete factor breakdown for an artisan.
 */
export function calculateKarigarTrustScore(
  metrics: KarigarRawMetrics,
  benchmarks?: Partial<typeof DEFAULT_FACTOR_BENCHMARKS>,
  priorWeight: number = BAYESIAN_PRIOR_WEIGHT
): KarigarTrustScoreCalculation {
  const activeBenchmarks = {
    ...DEFAULT_FACTOR_BENCHMARKS,
    ...benchmarks
  };

  const raw = deriveRawFactorScores(metrics);

  const factors: KarigarTrustFactors = {
    on_time_delivery: computeFactorBreakdown(
      'on_time_delivery',
      raw.on_time_delivery.score,
      raw.on_time_delivery.sampleSize,
      activeBenchmarks.on_time_delivery,
      priorWeight
    ),
    wastage_adherence: computeFactorBreakdown(
      'wastage_adherence',
      raw.wastage_adherence.score,
      raw.wastage_adherence.sampleSize,
      activeBenchmarks.wastage_adherence,
      priorWeight
    ),
    quality_acceptance: computeFactorBreakdown(
      'quality_acceptance',
      raw.quality_acceptance.score,
      raw.quality_acceptance.sampleSize,
      activeBenchmarks.quality_acceptance,
      priorWeight
    ),
    dispute_frequency: computeFactorBreakdown(
      'dispute_frequency',
      raw.dispute_frequency.score,
      raw.dispute_frequency.sampleSize,
      activeBenchmarks.dispute_frequency,
      priorWeight
    ),
    communication_responsiveness: computeFactorBreakdown(
      'communication_responsiveness',
      raw.communication_responsiveness.score,
      raw.communication_responsiveness.sampleSize,
      activeBenchmarks.communication_responsiveness,
      priorWeight
    )
  };

  // Composite is weighted sum of Bayesian factor scores
  const composite = Object.values(factors).reduce((acc, f) => acc + f.weighted_score, 0);

  const isColdStart =
    metrics.totalOrders === 0 &&
    metrics.totalReturns === 0 &&
    metrics.totalTransactions === 0;

  return {
    composite_score: Number(composite.toFixed(2)),
    total_orders: metrics.totalOrders,
    factors,
    calculation_version: TRUST_CALCULATION_VERSION,
    is_cold_start: isColdStart
  };
}

