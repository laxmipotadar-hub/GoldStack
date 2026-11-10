/**
 * Pure TypeScript Wastage Analytics Engine
 * Implements Weighted Moving Average (WMA), trend calculations,
 * and benchmark variance statistics for jewellery job-work.
 */

/**
 * Calculates the Weighted Moving Average (WMA) of a series of numbers.
 * In a chronological sequence [x1, x2, ..., xN] where x1 is oldest and xN is most recent:
 * Linearly increasing weights [1, 2, ..., N] are applied so the most recent return
 * has the highest weight (N), and the oldest has weight 1.
 *
 * Formula:
 *   WMA = (sum_{i=1}^N (w_i * x_i)) / (sum_{i=1}^N w_i)
 * where w_i defaults to i (1-indexed).
 *
 * @param values Array of numbers in chronological order (oldest to newest)
 * @param customWeights Optional explicit weights matching values length
 * @returns Weighted moving average rounded or exact number, 0 for empty array
 */
export function calculateWeightedMovingAverage(values: number[], customWeights?: number[]): number {
  if (!values || values.length === 0) {
    return 0;
  }

  if (values.length === 1) {
    return Number(values[0].toFixed(4));
  }

  let weights: number[];

  if (customWeights && customWeights.length > 0) {
    if (customWeights.length !== values.length) {
      throw new Error(
        `Custom weights length (${customWeights.length}) must match values length (${values.length})`
      );
    }
    weights = customWeights;
  } else {
    // Default linear weights: 1, 2, 3, ..., N (oldest to most recent)
    weights = values.map((_, idx) => idx + 1);
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    const w = weights[i];
    if (isNaN(val) || isNaN(w)) continue;
    weightedSum += val * w;
    totalWeight += w;
  }

  if (totalWeight <= 0) {
    throw new Error('Sum of weights must be strictly greater than zero');
  }

  const result = weightedSum / totalWeight;
  return Number(result.toFixed(4));
}

/**
 * Computes a rolling Weighted Moving Average across a time series using a sliding window.
 * Returns an array of the same length, where each element is the WMA of up to windowSize previous points.
 *
 * @param values Chronological series of numbers
 * @param windowSize Maximum number of points to include in rolling window (default: 5)
 */
export function calculateRollingWma(values: number[], windowSize = 5): number[] {
  if (!values || values.length === 0) return [];
  const size = Math.max(1, windowSize);
  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const startIdx = Math.max(0, i - size + 1);
    const windowSlice = values.slice(startIdx, i + 1);
    result.push(calculateWeightedMovingAverage(windowSlice));
  }

  return result;
}

/**
 * Calculates Simple Moving Average (SMA) / arithmetic mean
 */
export function calculateSimpleAverage(values: number[]): number {
  if (!values || values.length === 0) return 0;
  const sum = values.reduce((acc, curr) => acc + curr, 0);
  return Number((sum / values.length).toFixed(4));
}

/**
 * Evaluates the direction of variance trend over recent returns
 * Negative change in variance (reducing wastage relative to agreement) is IMPROVING.
 * Positive change in variance (increasing excess wastage) is WORSENING.
 */
export function determineTrendDirection(
  variances: number[]
): 'IMPROVING' | 'STABLE' | 'WORSENING' {
  if (!variances || variances.length < 2) return 'STABLE';

  // Compare recent half vs older half
  const mid = Math.floor(variances.length / 2);
  const olderHalf = variances.slice(0, mid);
  const recentHalf = variances.slice(mid);

  const olderAvg = calculateSimpleAverage(olderHalf);
  const recentAvg = calculateSimpleAverage(recentHalf);

  // Delta: recent - older
  // E.g. If variance was +1.2% and is now +0.2%, delta = -1.0% -> IMPROVING
  const delta = recentAvg - olderAvg;

  if (delta < -0.2) return 'IMPROVING';
  if (delta > 0.2) return 'WORSENING';
  return 'STABLE';
}

