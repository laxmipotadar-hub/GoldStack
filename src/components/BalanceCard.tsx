import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Scale,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  Flame,
  Clock,
  PlusCircle,
  CornerDownLeft
} from 'lucide-react';
import { BalanceResponse, Party, User } from '../../shared/types.js';
import { TrustScoreCard } from './TrustScoreCard.js';
import { useTranslation } from '../i18n/LanguageContext.js';

interface BalanceCardProps {
  karigarId: string;
  karigars: (Party | User)[];
  onOpenIssueModal?: () => void;
  onOpenReturnModal?: () => void;
  onOpenPassport?: () => void;
  bullionRatePerGram?: number;
}

export const BalanceCard: React.FC<BalanceCardProps> = ({
  karigarId,
  karigars,
  onOpenIssueModal,
  onOpenReturnModal,
  onOpenPassport,
  bullionRatePerGram = 7420
}) => {
  const { t } = useTranslation();
  const selectedKarigar = karigars.find((k) => k.id === karigarId);

  const { data: balanceRes, isLoading } = useQuery<BalanceResponse>({
    queryKey: ['balance', karigarId],
    queryFn: async () => {
      const res = await fetch(`/api/ledger/balance/${karigarId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch balance');
      return res.json();
    },
    refetchInterval: 10000 // Poll balance periodically
  });

  const balance = balanceRes?.data;
  const netGrams = balance?.net_balance_grams || 0;
  const pureGrams = balance?.net_pure_balance_grams || 0;
  const tolaEquivalent = (netGrams / 11.6638).toFixed(2);
  const approxValue = Math.round(netGrams * bullionRatePerGram);
  const isNegativeBalance = Number(netGrams) < 0;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-card p-5 sm:p-6 shadow-md border border-border">
      {/* Golden Aura Accent */}
      <div className="absolute -right-12 -top-12 w-48 h-48 bg-gradient-to-br from-brand/20 to-transparent rounded-full opacity-60 blur-3xl pointer-events-none" />

      {/* Header Context Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 relative z-10 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-chip flex items-center justify-center text-brand border border-border shadow-inner">
            <Scale className="w-6 h-6 text-brand" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-headline-sm text-lg sm:text-xl font-bold text-ink">
                {selectedKarigar?.name || 'Master Karigar'}
              </h2>
              <span className="bg-chip text-ink border border-border font-label-sm text-[11px] px-2 py-0.5 rounded-full font-bold">
                {selectedKarigar?.businessName || 'Bench #4'}
              </span>
              <TrustScoreCard
                karigarId={karigarId}
                onOpenPassport={onOpenPassport}
              />
            </div>
            <p className="font-label-vernacular text-xs text-muted flex items-center gap-1.5 mt-0.5">
              <span>{t('dashboard.activeKhata')}</span>
              <span>•</span>
              <span className="text-brand font-bold">{t('dashboard.verified22k')}</span>
            </p>
          </div>
        </div>

        {/* Live Scale Calibration indicator */}
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-chip text-ink border border-border text-xs font-label-md shadow-xs">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="font-medium">{t('status.liveVaultScaleSynced')}</span>
          </div>
        </div>
      </div>

      {/* Main Massive Ledger Weight Box */}
      <div className="my-3 py-4 px-4 sm:px-6 rounded-xl bg-chip flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 border border-border">
        <div>
          <span className="font-label-sm text-xs uppercase tracking-wider text-muted block font-bold">
            {t('dashboard.remainingGold')}
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`font-metric-display text-3xl sm:text-4xl font-extrabold tabular-nums tracking-tight ${isNegativeBalance ? 'text-danger' : 'text-ink'}`}>
              {isLoading ? '...' : Number(netGrams).toFixed(3)}
            </span>
            <span className={`font-headline-sm text-xl font-bold ${isNegativeBalance ? 'text-danger' : 'text-brand'}`}>{t('dashboard.grams')}</span>
            <span className="text-xs font-label-md text-muted font-medium ml-1">
              ({tolaEquivalent} {t('dashboard.tola')})
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:items-end">
          <span className="font-label-sm text-xs text-muted uppercase tracking-wider font-semibold">
            {t('dashboard.fineGoldEquivalent')}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Sparkles className="w-4 h-4 text-brand" />
            <span className="font-metric-sub text-lg text-brand font-bold tabular-nums">
              {Number(pureGrams).toFixed(3)} {t('dashboard.fine')}
            </span>
          </div>
          <span className="font-body-sm text-xs text-muted font-semibold mt-0.5">
            {t('dashboard.approxValue', { value: approxValue.toLocaleString('en-IN'), rate: bullionRatePerGram })}
          </span>
        </div>
      </div>

      {/* 3-Column Metric Strip (Received, Returned, Wastage) */}
      <div className="grid grid-cols-3 gap-2.5 pt-1">
        <div className="bg-chip p-3 rounded-xl flex flex-col justify-between border border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="font-label-sm text-[10px] uppercase text-muted font-bold">
              {t('dashboard.goldIssued')}
            </span>
            <ArrowUpRight className="w-4 h-4 text-brand" />
          </div>
          <span className="font-label-vernacular text-[10px] text-muted">{t('dashboard.goldIssuedSub')}</span>
          <span className="font-metric-sub text-base text-ink font-bold tabular-nums mt-1">
            {Number(balance?.total_issued_grams || 0).toFixed(3)}{' '}
            <span className="text-xs font-normal text-muted">g</span>
          </span>
        </div>

        <div className="bg-chip p-3 rounded-xl flex flex-col justify-between border border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="font-label-sm text-[10px] uppercase text-muted font-bold">
              {t('dashboard.goldReturned')}
            </span>
            <ArrowDownLeft className="w-4 h-4 text-brand-light" />
          </div>
          <span className="font-label-vernacular text-[10px] text-muted">{t('dashboard.goldReturnedSub')}</span>
          <span className="font-metric-sub text-base text-ink font-bold tabular-nums mt-1">
            {Number(balance?.total_returned_grams || 0).toFixed(3)}{' '}
            <span className="text-xs font-normal text-muted">g</span>
          </span>
        </div>

        <div className="bg-chip p-3 rounded-xl flex flex-col justify-between border border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="font-label-sm text-[10px] uppercase text-muted font-bold">
              {t('dashboard.allowedWastage')}
            </span>
            <Flame className="w-4 h-4 text-warn" />
          </div>
          <span className="font-label-vernacular text-[10px] text-muted">{t('dashboard.allowedWastageSub')}</span>
          <span className="font-metric-sub text-base text-ink font-bold tabular-nums mt-1">
            {Number(balance?.total_wastage_grams || 0).toFixed(3)}{' '}
            <span className="text-xs font-normal text-muted">g</span>
          </span>
        </div>
      </div>

      {/* Pending Confirmation Warning Banner if any */}
      {(balance?.pending_confirmation_count || 0) > 0 && (
        <div className="mt-4 p-3 rounded-xl bg-warn-bg border border-warn/30 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-warn animate-pulse shrink-0" />
            <Clock className="w-5 h-5 text-warn shrink-0" />
            <div>
              <p className="font-label-md text-xs font-bold text-ink">
                {t('status.pendingConfirmation', { count: balance?.pending_confirmation_count || 0 })}
              </p>
              <p className="font-label-vernacular text-[11px] text-muted">
                {t('status.pendingGramsWaiting', { grams: balance?.pending_confirmation_grams.toFixed(3) })}
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-warn px-2.5 py-1 bg-white border border-warn/30 rounded-full shadow-xs">
            {t('status.actionNeeded')}
          </span>
        </div>
      )}

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-2 gap-3 mt-4 pt-1">
        <button
          type="button"
          onClick={onOpenIssueModal}
          className="h-12 bg-brand hover:bg-brand-light text-white font-bold rounded-xl px-4 flex items-center justify-center gap-2 font-label-md text-sm shadow-sm transition-all active:scale-[0.98]"
        >
          <PlusCircle className="w-4 h-4" />
          <span>{t('nav.issueGold')}</span>
        </button>

        <button
          type="button"
          onClick={onOpenReturnModal}
          className="h-12 bg-white border border-brand text-brand hover:bg-chip font-bold rounded-xl px-4 flex items-center justify-center gap-2 font-label-md text-sm shadow-sm transition-all active:scale-[0.98]"
        >
          <CornerDownLeft className="w-4 h-4 text-brand" />
          <span>{t('nav.returnGold')}</span>
        </button>
      </div>
    </div>
  );
};
