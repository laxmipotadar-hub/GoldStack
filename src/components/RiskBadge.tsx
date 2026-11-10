import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Info, ShieldAlert } from 'lucide-react';
import { RiskLevel, RiskFactors, OrderStatus } from '../../shared/types.js';

interface RiskBadgeProps {
  level?: RiskLevel;
  score?: number;
  percentage?: number;
  factors?: RiskFactors;
  status?: OrderStatus;
  size?: 'sm' | 'md' | 'lg';
  showDetailsPopover?: boolean;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({
  level = 'LOW',
  score,
  percentage,
  factors,
  status,
  size = 'md',
  showDetailsPopover = true
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Compute percentage if not directly provided
  const pct = percentage ?? (score !== undefined ? Math.round(score * 100) : level === 'HIGH' ? 82 : level === 'MEDIUM' ? 45 : 12);

  const getBadgeStyle = () => {
    switch (level) {
      case 'HIGH':
        return {
          container: 'bg-danger-bg text-danger border-danger/30 shadow-xs',
          dot: 'bg-danger animate-ping',
          icon: <ShieldAlert className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />,
          labelEn: 'High Delay Risk',
          labelHi: 'उच्च जोखिम'
        };
      case 'MEDIUM':
        return {
          container: 'bg-warn-bg text-warn border-warn/30 shadow-xs',
          dot: 'bg-warn',
          icon: <AlertTriangle className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />,
          labelEn: 'Medium Watch',
          labelHi: 'मध्यम निगरानी'
        };
      case 'LOW':
      default:
        return {
          container: 'bg-success-bg text-success border-success/30 shadow-xs',
          dot: 'bg-success',
          icon: <CheckCircle2 className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />,
          labelEn: 'On Track',
          labelHi: 'समय पर'
        };
    }
  };

  const style = getBadgeStyle();
  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-medium'
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => showDetailsPopover && setIsOpen(!isOpen)}
        className={`inline-flex items-center rounded-full border transition-all cursor-pointer select-none font-semibold ${style.container} ${sizeClasses[size]}`}
        title="Click to view delay risk score breakdown"
      >
        <span className="relative flex h-2 w-2">
          {level === 'HIGH' && (
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${style.dot}`} />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${level === 'HIGH' ? 'bg-danger' : level === 'MEDIUM' ? 'bg-warn' : 'bg-success'}`} />
        </span>

        {style.icon}

        <span className="flex items-center gap-1 font-mono tracking-tight">
          <span>{pct}%</span>
          <span className="text-[10px] opacity-75 font-sans font-medium">
            ({style.labelHi} / {style.labelEn})
          </span>
        </span>

        {status === 'ESCALATED' && (
          <span className="ml-1 bg-purple-100 text-purple-700 px-1.5 py-0.2 text-[10px] rounded-full border border-purple-200">
            Escalated
          </span>
        )}
      </button>

      {/* Popover Breakdown */}
      {isOpen && showDetailsPopover && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-white rounded-xl shadow-xl border border-stone-200 p-3.5 text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-100">
              <div className="flex items-center gap-1.5 font-bold text-stone-800">
                <Info className="w-3.5 h-3.5 text-amber-600" />
                <span>Delay-Risk Breakdown (जोखिम विश्लेषण)</span>
              </div>
              <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${style.container}`}>
                {pct}% ({level})
              </span>
            </div>

            <p className="text-stone-500 mb-3 text-[11px] leading-relaxed">
              Weighted delay risk evaluated from occasion urgency, milestone lag, past delays, and artisan reliability.
            </p>

            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-[11px] text-stone-600 mb-0.5 font-medium">
                  <span>Occasion Urgency (35%)</span>
                  <span className="font-mono">{factors ? Math.round(factors.urgencyScore * 100) : (level === 'HIGH' ? 85 : 30)}%</span>
                </div>
                <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{ width: `${factors ? factors.urgencyScore * 100 : (level === 'HIGH' ? 85 : 30)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-stone-600 mb-0.5 font-medium">
                  <span>Milestone Lag (25%)</span>
                  <span className="font-mono">{factors ? Math.round(factors.completionScore * 100) : (level === 'HIGH' ? 70 : 25)}%</span>
                </div>
                <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${factors ? factors.completionScore * 100 : (level === 'HIGH' ? 70 : 25)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-stone-600 mb-0.5 font-medium">
                  <span>Delay Cascades (25%)</span>
                  <span className="font-mono">{factors ? Math.round(factors.delayScore * 100) : (level === 'HIGH' ? 80 : 10)}%</span>
                </div>
                <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 rounded-full transition-all"
                    style={{ width: `${factors ? factors.delayScore * 100 : (level === 'HIGH' ? 80 : 10)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-stone-600 mb-0.5 font-medium">
                  <span>Artisan Reliability (15%)</span>
                  <span className="font-mono">{factors ? Math.round(factors.historicalScore * 100) : 15}%</span>
                </div>
                <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all"
                    style={{ width: `${factors ? factors.historicalScore * 100 : 15}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-stone-100 text-[10px] text-stone-400 text-center">
              GoldStack Occasion Protection Engine
            </div>
          </div>
        </>
      )}
    </div>
  );
};

