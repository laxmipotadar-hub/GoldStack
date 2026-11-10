import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheck,
  Star,
  ChevronDown,
  ChevronUp,
  Award,
  Clock,
  Flame,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { KarigarTrustScore, TrustScoreResponse } from '../../shared/types.js';
import { useTranslation } from '../i18n/LanguageContext.js';

interface TrustScoreCardProps {
  karigarId: string;
  onOpenPassport?: () => void;
  compact?: boolean;
}

export const TrustScoreCard: React.FC<TrustScoreCardProps> = ({
  karigarId,
  onOpenPassport,
  compact = false
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: scoreRes, isLoading } = useQuery<TrustScoreResponse>({
    queryKey: ['trust-score', karigarId],
    queryFn: async () => {
      const res = await fetch(`/api/trust-score/${karigarId}`);
      if (!res.ok) throw new Error('Failed to load trust score');
      return res.json();
    },
    enabled: Boolean(karigarId)
  });

  const trust = scoreRes?.data;
  const score = trust?.composite_score ?? 4.2;

  // Grade badge styling based on 0-5 composite
  const getGradeInfo = (s: number) => {
    if (s >= 4.5) return { grade: 'Grade A+', label: t('trust.gradeAPlus'), bg: 'bg-success-bg text-success border-success/40', starColor: 'text-amber-500 fill-amber-500' };
    if (s >= 4.0) return { grade: 'Grade A', label: t('trust.gradeA'), bg: 'bg-success-bg text-success border-success/30', starColor: 'text-amber-500 fill-amber-500' };
    if (s >= 3.0) return { grade: 'Grade B', label: t('trust.gradeB'), bg: 'bg-warn-bg text-warn border-warn/30', starColor: 'text-amber-500' };
    return { grade: 'Grade C', label: t('trust.gradeC'), bg: 'bg-danger-bg text-danger border-danger/40', starColor: 'text-danger' };
  };

  const gradeInfo = getGradeInfo(score);

  if (isLoading) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-xs animate-pulse">
        <span className="w-2.5 h-2.5 rounded-full bg-primary/40" />
        <span className="text-on-surface-variant text-[11px]">Computing Trust Score...</span>
      </div>
    );
  }

  return (
    <div className="relative inline-block text-left">
      {/* Clickable Header Badge */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border transition-all text-xs font-label-md font-bold hover:shadow-xs ${gradeInfo.bg}`}
        title="View 5-factor Bayesian trust audit breakdown"
      >
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-success" />
          <span>{t('trust.trustScore')}</span>
          <span className="font-extrabold text-sm">{score.toFixed(1)}</span>
          <Star className={`w-3.5 h-3.5 ${gradeInfo.starColor}`} />
        </span>

        <span className="text-[10px] opacity-75 hidden sm:inline">({gradeInfo.grade})</span>

        {isExpanded ? <ChevronUp className="w-3 h-3 opacity-60" /> : <ChevronDown className="w-3 h-3 opacity-60" />}
      </button>

      {/* Expanded Factor Breakdown Dropdown / Popover */}
      {isExpanded && trust && (
        <div className="absolute right-0 sm:left-0 top-full mt-2 w-80 sm:w-96 bg-surface-container-lowest rounded-2xl shadow-xl border border-outline-variant/40 p-4 z-50 animate-in fade-in-50 zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20 mb-3">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-primary" />
              <div>
                <h4 className="font-headline-sm text-sm font-bold text-on-surface">
                  {t('trust.viewArtisanTrust')}
                </h4>
                <p className="text-[10px] text-on-surface-variant font-mono">
                  Bayesian Prior m=10 • {trust.calculation_version}
                </p>
              </div>
            </div>

            <div className="text-right">
              <div className="text-base font-extrabold text-success flex items-center gap-0.5 justify-end">
                <span>{trust.composite_score.toFixed(2)}</span>
                <span className="text-xs text-on-surface-variant">/ 5.0</span>
              </div>
              <span className="text-[10px] font-bold text-primary block">{gradeInfo.label}</span>
            </div>
          </div>

          {/* 5-Factor Horizontal Bars Breakdown */}
          <div className="space-y-2.5 text-xs">
            {/* 1. On-Time Delivery (30%) */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-semibold text-on-surface flex items-center gap-1">
                  <Clock className="w-3 h-3 text-secondary" />
                  <span>{t('trust.onTimeDelivery')}</span>
                  <span className="text-[10px] text-on-surface-variant">30%</span>
                </span>
                <span className="font-bold font-mono">
                  {trust.factors.on_time_delivery.bayesian_score.toFixed(2)}
                  <span className="text-on-surface-variant font-normal"> / 5.0</span>
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                <div
                  className="h-full bg-secondary rounded-full transition-all duration-500"
                  style={{ width: `${(trust.factors.on_time_delivery.bayesian_score / 5) * 100}%` }}
                />
              </div>
            </div>

            {/* 2. Wastage Adherence (25%) */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-semibold text-on-surface flex items-center gap-1">
                  <Flame className="w-3 h-3 text-primary" />
                  <span>{t('trust.wastageAdherence')}</span>
                  <span className="text-[10px] text-on-surface-variant">25%</span>
                </span>
                <span className="font-bold font-mono">
                  {trust.factors.wastage_adherence.bayesian_score.toFixed(2)}
                  <span className="text-on-surface-variant font-normal"> / 5.0</span>
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${(trust.factors.wastage_adherence.bayesian_score / 5) * 100}%` }}
                />
              </div>
            </div>

            {/* 3. Quality & Hallmark (20%) */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-semibold text-on-surface flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-success" />
                  <span>{t('trust.qualityAcceptance')}</span>
                  <span className="text-[10px] text-on-surface-variant">20%</span>
                </span>
                <span className="font-bold font-mono">
                  {trust.factors.quality_acceptance.bayesian_score.toFixed(2)}
                  <span className="text-on-surface-variant font-normal"> / 5.0</span>
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                <div
                  className="h-full bg-success rounded-full transition-all duration-500"
                  style={{ width: `${(trust.factors.quality_acceptance.bayesian_score / 5) * 100}%` }}
                />
              </div>
            </div>

            {/* 4. Dispute Frequency (15%) */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-semibold text-on-surface flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  <span>{t('trust.disputeFrequency')}</span>
                  <span className="text-[10px] text-on-surface-variant">15%</span>
                </span>
                <span className="font-bold font-mono">
                  {trust.factors.dispute_frequency.bayesian_score.toFixed(2)}
                  <span className="text-on-surface-variant font-normal"> / 5.0</span>
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                <div
                  className="h-full bg-amber-600 rounded-full transition-all duration-500"
                  style={{ width: `${(trust.factors.dispute_frequency.bayesian_score / 5) * 100}%` }}
                />
              </div>
            </div>

            {/* 5. Communication Responsiveness (10%) */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-semibold text-on-surface flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-secondary" />
                  <span>{t('trust.communication')}</span>
                  <span className="text-[10px] text-on-surface-variant">10%</span>
                </span>
                <span className="font-bold font-mono">
                  {trust.factors.communication_responsiveness.bayesian_score.toFixed(2)}
                  <span className="text-on-surface-variant font-normal"> / 5.0</span>
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                <div
                  className="h-full bg-secondary-fixed rounded-full transition-all duration-500"
                  style={{ width: `${(trust.factors.communication_responsiveness.bayesian_score / 5) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Action Link to Shareable Public Profile Passport */}
          <div className="mt-4 pt-3 border-t border-outline-variant/20 flex items-center justify-between">
            <span className="text-[10px] text-on-surface-variant font-mono">
              {t('trust.totalOrdersAudited', { count: trust.total_orders })}
            </span>

            {onOpenPassport && (
              <button
                onClick={() => {
                  setIsExpanded(false);
                  onOpenPassport();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-label-md font-bold hover:bg-primary/90 transition-all shadow-xs"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>{t('trust.artisanPassportQr')}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

