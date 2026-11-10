import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingDown,
  TrendingUp,
  Minus,
  Sparkles,
  Info,
  RefreshCw,
  Award,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';
import { KarigarWastageAnalytics, KarigarReturnVariancePoint } from '../../shared/types.js';

interface WastageHistoryChartProps {
  karigarId: string;
  karigarName?: string;
  isArtisanView?: boolean;
}

/**
 * WastageHistoryChart Component
 *
 * Visualizes per-artisan wastage analytics using an ultra-lightweight Hand-Rolled SVG engine:
 * 1. ZERO external bundle overhead (0 kB vs Chart.js ~200 kB gzipped).
 * 2. Vector clarity: scales crisply to any mobile workshop bench tablet or high-DPI display.
 * 3. Shows Weighted Moving Average (WMA) trendline alongside actual return data points.
 * 4. Renders benchmark tolerance corridors (+2.0% buffer) and category comparisons.
 */
export const WastageHistoryChart: React.FC<WastageHistoryChartProps> = ({
  karigarId,
  karigarName,
  isArtisanView = false
}) => {
  const [limit, setLimit] = useState<number>(10);
  const [hoveredPoint, setHoveredPoint] = useState<KarigarReturnVariancePoint | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const {
    data: analyticsRes,
    isLoading,
    isError,
    refetch,
    isFetching
  } = useQuery<{ success: boolean; data: KarigarWastageAnalytics }>({
    queryKey: ['karigar-wastage-analytics', karigarId, limit],
    queryFn: async () => {
      const res = await fetch(`/api/wastage/analytics/${karigarId}?limit=${limit}`, {
        credentials: 'include'
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to fetch wastage analytics');
      }
      return res.json();
    },
    enabled: Boolean(karigarId)
  });

  const analytics = analyticsRes?.data;
  const trend = analytics?.varianceTrend || [];

  // Chart coordinate calculations
  const svgWidth = 720;
  const svgHeight = 240;
  const padLeft = 45;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 40;

  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  // Compute dynamic Y scale (percentage)
  const maxDataVal = Math.max(
    ...trend.map((p) => Math.max(p.actualWastagePct, p.agreedWastagePct + 2.0, p.rollingWmaPct)),
    10.0
  );
  const yMax = Math.ceil((maxDataVal + 1.5) / 2) * 2; // snap to even ceiling
  const yMin = 0;

  const getY = (val: number) => {
    const clamped = Math.max(yMin, Math.min(yMax, val));
    return padTop + chartH - ((clamped - yMin) / (yMax - yMin)) * chartH;
  };

  const getX = (index: number) => {
    if (trend.length <= 1) return padLeft + chartW / 2;
    return padLeft + (index / (trend.length - 1)) * chartW;
  };

  // Build SVG path strings
  const actualPointsStr = trend.map((p, i) => `${getX(i)},${getY(p.actualWastagePct)}`).join(' ');
  const wmaPointsStr = trend.map((p, i) => `${getX(i)},${getY(p.rollingWmaPct)}`).join(' ');
  const agreedPointsStr = trend.map((p, i) => `${getX(i)},${getY(p.agreedWastagePct)}`).join(' ');

  // Shaded area under actual line
  const areaPath =
    trend.length > 0
      ? `M ${getX(0)},${getY(yMin)} ` +
        trend.map((p, i) => `L ${getX(i)},${getY(p.actualWastagePct)}`).join(' ') +
        ` L ${getX(trend.length - 1)},${getY(yMin)} Z`
      : '';

  // Grid tick values
  const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];

  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-xs p-5 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/20 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-headline-sm text-lg font-bold text-on-surface">
              Artisan Wastage Analytics & WMA History
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              Pure SVG Engine
            </span>
          </div>
          <p className="font-label-vernacular text-xs text-secondary font-medium mt-0.5">
            {karigarName || analytics?.karigarName || 'कारीगर'} का भारित चल औसत छीजत एवं विचलन विश्लेषण
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Limit selector */}
          <div className="flex items-center bg-surface-container-low rounded-xl p-1 border border-outline-variant/30 text-xs">
            <span className="text-[11px] text-on-surface-variant px-2 font-medium">Show:</span>
            {[5, 10, 20].map((n) => (
              <button
                key={n}
                onClick={() => setLimit(n)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  limit === n
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 w-8 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-all active:scale-95"
            title="Refresh analytics data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto" />
          <p className="text-xs text-on-surface-variant font-medium">
            Computing weighted moving average & category benchmarks...
          </p>
        </div>
      ) : isError ? (
        <div className="p-4 rounded-xl bg-error-container/20 border border-error/30 text-error text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Unable to load artisan wastage analytics. Please verify permissions and try again.</span>
        </div>
      ) : !analytics || trend.length === 0 ? (
        <div className="p-8 text-center text-on-surface-variant bg-surface-container-low rounded-xl space-y-2">
          <Info className="w-8 h-8 text-secondary mx-auto" />
          <h4 className="font-bold text-sm text-on-surface">No Return History Recorded Yet</h4>
          <p className="text-xs max-w-md mx-auto">
            Once this artisan completes gold return entries with hallmarking and wastage settlement, their
            rolling weighted moving average and design category benchmarks will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* KPI Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* KPI 1: Rolling WMA */}
            <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary block">
                Rolling WMA Wastage
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-bold text-primary">
                  {analytics.rollingAverageWastagePct.toFixed(2)}%
                </span>
                <span className="text-[10px] text-on-surface-variant font-medium">(भारित औसत)</span>
              </div>
              <p className="text-[10px] text-on-surface-variant">
                Recent returns weighted higher ($w_i = i$)
              </p>
            </div>

            {/* KPI 2: Simple Arithmetic Mean */}
            <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-secondary block">
                Simple Mean Wastage
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-bold text-on-surface">
                  {analytics.simpleAverageWastagePct.toFixed(2)}%
                </span>
                <span className="text-[10px] text-on-surface-variant font-medium">(सरल औसत)</span>
              </div>
              <p className="text-[10px] text-on-surface-variant">
                Across {analytics.totalReturnsCount} total returns
              </p>
            </div>

            {/* KPI 3: Net Variance */}
            <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-secondary block">
                Avg Variance vs Agreement
              </span>
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`font-mono text-2xl font-bold ${
                    analytics.averageVariancePct <= 0 ? 'text-[#477b55]' : 'text-amber-700'
                  }`}
                >
                  {analytics.averageVariancePct > 0 ? '+' : ''}
                  {analytics.averageVariancePct.toFixed(2)}%
                </span>
              </div>
              <p className="text-[10px] text-on-surface-variant">
                {analytics.averageVariancePct <= 0 ? '🟢 Gold Savings' : '🟡 Above Agreed Rate'}
              </p>
            </div>

            {/* KPI 4: Trend Direction */}
            <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-secondary block">
                Craftsmanship Trend
              </span>
              <div className="flex items-center gap-1.5 pt-0.5">
                {analytics.varianceTrendDirection === 'IMPROVING' ? (
                  <>
                    <TrendingDown className="w-5 h-5 text-[#477b55]" />
                    <span className="font-bold text-sm text-[#477b55]">Improving (सुधार)</span>
                  </>
                ) : analytics.varianceTrendDirection === 'WORSENING' ? (
                  <>
                    <TrendingUp className="w-5 h-5 text-error" />
                    <span className="font-bold text-sm text-error">Worsening (छीजत वृद्धि)</span>
                  </>
                ) : (
                  <>
                    <Minus className="w-5 h-5 text-secondary" />
                    <span className="font-bold text-sm text-secondary">Stable (स्थिर)</span>
                  </>
                )}
              </div>
              <p className="text-[10px] text-on-surface-variant">Over last {trend.length} settlements</p>
            </div>
          </div>

          {/* SVG Chart Container */}
          <div className="relative bg-surface-container-low/70 rounded-2xl p-4 border border-outline-variant/30">
            {/* Chart Legend */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs mb-2 px-1">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-primary" />
                  <span className="font-medium text-on-surface text-[11px]">
                    Actual Wastage % (वास्तविक छीजत)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-0.5 border-t-2 border-dashed border-purple-600" />
                  <span className="font-medium text-purple-700 text-[11px]">
                    Weighted Moving Avg (WMA)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-amber-400/30 border border-amber-500/50" />
                  <span className="font-medium text-amber-700 text-[11px]">Agreed Rate</span>
                </div>
              </div>

              <span className="text-[11px] text-on-surface-variant font-mono">
                Showing last {trend.length} returns
              </span>
            </div>

            {/* The SVG Canvas */}
            <div className="w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-auto min-w-[560px]"
                style={{ overflow: 'visible' }}
              >
                <defs>
                  {/* Gold gradient fill under actual returns curve */}
                  <linearGradient id="wastageAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c59a3f" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#c59a3f" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Y-axis grid lines & labels */}
                {yTicks.map((tickVal, i) => {
                  const y = getY(tickVal);
                  return (
                    <g key={i}>
                      <line
                        x1={padLeft}
                        y1={y}
                        x2={padLeft + chartW}
                        y2={y}
                        stroke="currentColor"
                        className="text-outline-variant/30"
                        strokeDasharray={i === 0 ? '' : '3 3'}
                      />
                      <text
                        x={padLeft - 6}
                        y={y + 3}
                        textAnchor="end"
                        className="text-[10px] fill-on-surface-variant font-mono"
                      >
                        {tickVal.toFixed(1)}%
                      </text>
                    </g>
                  );
                })}

                {/* Area under Actual Line */}
                {areaPath && <path d={areaPath} fill="url(#wastageAreaGrad)" />}

                {/* Agreed Rate Guide Line */}
                {agreedPointsStr && (
                  <polyline
                    points={agreedPointsStr}
                    fill="none"
                    stroke="#d97706"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    opacity="0.6"
                  />
                )}

                {/* Weighted Moving Average (WMA) Line */}
                {wmaPointsStr && (
                  <polyline
                    points={wmaPointsStr}
                    fill="none"
                    stroke="#7c3aed"
                    strokeWidth="2.5"
                    strokeDasharray="5 3"
                  />
                )}

                {/* Actual Wastage Line */}
                {actualPointsStr && (
                  <polyline
                    points={actualPointsStr}
                    fill="none"
                    stroke="#c59a3f"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}

                {/* Data Points */}
                {trend.map((point, i) => {
                  const cx = getX(i);
                  const cy = getY(point.actualWastagePct);
                  const isHovered = hoveredPoint?.id === point.id;
                  const isExceeding = point.reviewRequired;

                  return (
                    <g
                      key={point.id || i}
                      className="cursor-pointer transition-transform"
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredPoint(point);
                        setHoverPos({ x: rect.left, y: rect.top });
                      }}
                      onMouseLeave={() => setHoveredPoint(null)}
                    >
                      {/* Pulse ring for review required */}
                      {isExceeding && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 12 : 8}
                          fill="#ef4444"
                          opacity="0.2"
                          className="animate-ping"
                        />
                      )}

                      {/* Main node dot */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 6 : 4.5}
                        fill={isExceeding ? '#ef4444' : '#c59a3f'}
                        stroke="#ffffff"
                        strokeWidth="2"
                        className="transition-all"
                      />

                      {/* X-axis tick label (Order ref) */}
                      <text
                        x={cx}
                        y={padTop + chartH + 16}
                        textAnchor="middle"
                        className={`text-[9px] font-mono transition-colors ${
                          isHovered ? 'fill-primary font-bold' : 'fill-on-surface-variant'
                        }`}
                      >
                        {point.orderRef.replace('ORD-', '')}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Hover Tooltip Overlay */}
            {hoveredPoint && (
              <div className="mt-3 p-3 rounded-xl bg-surface-container-highest border border-outline-variant/40 shadow-md text-xs animate-in fade-in-50 duration-150 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  <div>
                    <span className="font-bold text-on-surface font-mono">{hoveredPoint.orderRef}</span>
                    <span className="text-[11px] text-on-surface-variant ml-2 font-medium">
                      ({hoveredPoint.category}) • {new Date(hoveredPoint.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-on-surface-variant block">Actual Loss:</span>
                    <strong className="text-on-surface">
                      {hoveredPoint.actualWastagePct}% ({hoveredPoint.actualWastageGrams}g)
                    </strong>
                  </div>

                  <div>
                    <span className="text-[10px] text-on-surface-variant block">Agreed Rate:</span>
                    <strong className="text-amber-700">{hoveredPoint.agreedWastagePct}%</strong>
                  </div>

                  <div>
                    <span className="text-[10px] text-on-surface-variant block">Variance:</span>
                    <strong
                      className={hoveredPoint.variancePct <= 0 ? 'text-[#477b55]' : 'text-error'}
                    >
                      {hoveredPoint.variancePct > 0 ? '+' : ''}
                      {hoveredPoint.variancePct}%
                    </strong>
                  </div>

                  <div>
                    <span className="text-[10px] text-purple-700 block">WMA at Job:</span>
                    <strong className="text-purple-700">{hoveredPoint.rollingWmaPct.toFixed(2)}%</strong>
                  </div>
                </div>

                {hoveredPoint.reviewRequired && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-error-container text-on-error-container flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Review Required (&gt; agreed + 2%)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Category Benchmark Comparisons */}
          {analytics.categoryComparisons && analytics.categoryComparisons.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="font-headline-sm text-sm font-bold text-on-surface flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <span>Category Craftsmanship vs Standard Benchmarks (श्रेणीवार छीजत तुलना)</span>
                </h4>
                <span className="text-[11px] text-on-surface-variant">
                  Industry tolerance corridor comparison
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {analytics.categoryComparisons.map((cat) => (
                  <div
                    key={cat.category}
                    className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-on-surface">{cat.categoryLabel}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          cat.performanceRating === 'EXCELLENT'
                            ? 'bg-[#477b55]/10 text-[#477b55] border border-[#477b55]/30'
                            : cat.performanceRating === 'HIGH_WASTAGE'
                            ? 'bg-error-container text-on-error-container'
                            : 'bg-surface-container-high text-on-surface'
                        }`}
                      >
                        {cat.performanceRating === 'EXCELLENT'
                          ? '🌟 Excellent (उत्कृष्ट)'
                          : cat.performanceRating === 'HIGH_WASTAGE'
                          ? '⚠️ High Wastage'
                          : '✓ Standard (मानक)'}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between text-xs font-mono">
                      <span className="text-on-surface-variant text-[11px]">
                        Artisan WMA: <strong className="text-primary">{cat.karigarWmaPct}%</strong>
                      </span>
                      <span className="text-[11px] text-on-surface-variant">
                        Benchmark: {cat.benchmarkMinPct}% – {cat.benchmarkMaxPct}% (avg {cat.benchmarkAvgPct}%)
                      </span>
                    </div>

                    {/* Visual Range Bar */}
                    <div className="relative h-2.5 bg-surface-container-high rounded-full overflow-hidden">
                      {/* Target benchmark range indicator */}
                      <div
                        className="absolute h-full bg-primary/20"
                        style={{
                          left: `${(cat.benchmarkMinPct / 24) * 100}%`,
                          width: `${((cat.benchmarkMaxPct - cat.benchmarkMinPct) / 24) * 100}%`
                        }}
                      />
                      {/* Karigar performance marker */}
                      <div
                        className="absolute top-0 bottom-0 w-2 bg-primary rounded-full shadow-xs"
                        style={{
                          left: `${Math.min(96, (cat.karigarWmaPct / 24) * 100)}%`
                        }}
                        title={`Artisan WMA: ${cat.karigarWmaPct}%`}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-on-surface-variant pt-1 border-t border-outline-variant/20">
                      <span>Jobs Analyzed: {cat.sampleCount}</span>
                      <span>
                        Delta vs Avg:{' '}
                        <strong
                          className={cat.deltaVsBenchmarkAvg <= 0 ? 'text-[#477b55]' : 'text-amber-700'}
                        >
                          {cat.deltaVsBenchmarkAvg > 0 ? '+' : ''}
                          {cat.deltaVsBenchmarkAvg}%
                        </strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Best & Worst Returns Highlights */}
          {analytics.bestReturn && analytics.worstReturn && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-[#477b55]/5 border border-[#477b55]/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-[#477b55]" />
                  <div>
                    <span className="text-[10px] font-bold text-[#477b55] uppercase block">
                      Best Craftsmanship (न्यूनतम छीजत)
                    </span>
                    <span className="font-mono font-bold text-on-surface">
                      {analytics.bestReturn.orderRef}
                    </span>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <span className="text-[11px] font-bold text-[#477b55] block">
                    {analytics.bestReturn.actualWastagePct}% loss
                  </span>
                  <span className="text-[10px] text-on-surface-variant">
                    variance: {analytics.bestReturn.variancePct}%
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  <div>
                    <span className="text-[10px] font-bold text-amber-700 uppercase block">
                      Highest Wastage Job (अधिकतम छीजत)
                    </span>
                    <span className="font-mono font-bold text-on-surface">
                      {analytics.worstReturn.orderRef}
                    </span>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <span className="text-[11px] font-bold text-amber-700 block">
                    {analytics.worstReturn.actualWastagePct}% loss
                  </span>
                  <span className="text-[10px] text-on-surface-variant">
                    variance: {analytics.worstReturn.variancePct}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

