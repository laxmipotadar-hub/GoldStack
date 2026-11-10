import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  ShieldCheck,
  Star,
  Clock,
  Flame,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  Share2,
  Copy,
  Check,
  Lock,
  Globe,
  ArrowLeft,
  Sparkles,
  ExternalLink,
  RefreshCw,
  X
} from 'lucide-react';
import { PublicArtisanPassport, PublicPassportResponse } from '../../shared/types.js';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from './Toast.js';
import { useTranslation } from '../i18n/LanguageContext.js';

interface KarigarPassportViewProps {
  karigarId: string;
  onClose?: () => void;
  isModal?: boolean;
}

export const KarigarPassportView: React.FC<KarigarPassportViewProps> = ({
  karigarId,
  onClose,
  isModal = false
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [copied, setCopied] = useState(false);

  // Check if current authenticated user is this artisan
  const isArtisanOwner = user?.role === 'KARIGAR' && user.id === karigarId;

  // 1. Fetch Public Passport Data
  const {
    data: passportRes,
    isLoading,
    error,
    refetch
  } = useQuery<PublicPassportResponse>({
    queryKey: ['artisan-passport', karigarId],
    queryFn: async () => {
      const res = await fetch(`/api/trust-score/passport/${karigarId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Failed to fetch passport (${res.status})`);
      }
      return res.json();
    },
    retry: false
  });

  // 2. Mutation: Toggle Privacy
  const privacyMutation = useMutation({
    mutationFn: async (isPublic: boolean) => {
      const res = await fetch(`/api/trust-score/${karigarId}/privacy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_public: isPublic })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update privacy');
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        'Passport Visibility Updated',
        data.data?.is_public ? 'Your Artisan Passport is now PUBLIC & shareable via QR code.' : 'Your Artisan Passport is now PRIVATE.'
      );
      queryClient.invalidateQueries({ queryKey: ['artisan-passport', karigarId] });
      queryClient.invalidateQueries({ queryKey: ['trust-score', karigarId] });
      queryClient.invalidateQueries({ queryKey: ['trust-scores-all'] });
    },
    onError: (err: any) => {
      toast.error('Privacy Update Failed', err.message);
    }
  });

  const passport = passportRes?.data;
  const isPrivate = error?.message?.includes('private');

  const copyPassportUrl = () => {
    const url = passport?.passport_url || `${window.location.origin}/passport/${karigarId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Passport Link Copied', 'Shareable URL copied to clipboard.');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className={`${isModal ? '' : 'min-h-screen bg-surface-container-low py-6 px-4'}`}>
      <div className={`max-w-2xl mx-auto ${isModal ? '' : 'shadow-2xl'} rounded-3xl overflow-hidden bg-surface-container-lowest border border-outline-variant/30`}>
        {/* Top Gold Certificate Header Bar */}
        <div className="bg-gradient-to-r from-amber-700 via-amber-800 to-amber-950 text-amber-100 p-6 relative overflow-hidden">
          {/* Subtle Golden Pattern Background */}
          <div className="absolute right-0 top-0 w-64 h-64 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-amber-300">
              <Award className="w-4 h-4 text-amber-400" />
              <span>{t('trust.officialVerifiedPassport')}</span>
            </div>

            <div className="flex items-center gap-2">
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-white/10 text-amber-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-4">
              <img
                src={passport?.avatar_url || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150'}
                alt={passport?.karigar_name || 'Artisan'}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-300 shadow-md shrink-0"
              />
              <div>
                <h1 className="font-headline-sm text-xl sm:text-2xl font-extrabold text-white">
                  {passport?.karigar_name || 'Artisan Goldsmith'}
                </h1>
                <p className="text-amber-200 text-xs font-semibold">{passport?.business_name || 'Master Bench Goldsmith'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] bg-brand/80 px-2 py-0.5 rounded text-brand-light font-mono font-bold border border-brand/40">
                    ID: {karigarId.slice(0, 8)}...
                  </span>
                  <span className="text-[10px] bg-success text-white px-2 py-0.5 rounded font-bold">
                    BIS 916 Compliant
                  </span>
                </div>
              </div>
            </div>

            {/* Overall Score Badge */}
            <div className="bg-amber-900/60 p-3 rounded-2xl border border-amber-500/30 text-center sm:text-right shrink-0">
              <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider block">
                Composite Trust Score
              </span>
              <div className="text-3xl font-extrabold text-amber-100 flex items-center justify-center sm:justify-end gap-1">
                <span>{passport ? passport.composite_score.toFixed(2) : '--'}</span>
                <span className="text-xs text-amber-300">/ 5.0</span>
                <Star className="w-5 h-5 text-amber-400 fill-amber-400 ml-0.5" />
              </div>
              <span className="text-[11px] text-amber-200 font-bold block">
                {passport && passport.composite_score >= 4.5 ? 'Elite Tier (A+)' : 'Trusted Tier (A)'}
              </span>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          {isLoading ? (
            <div className="p-12 text-center text-on-surface-variant">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
              <p className="text-sm font-bold">Verifying cryptographic trust passport & QR...</p>
            </div>
          ) : isPrivate ? (
            /* Private Profile Screen */
            <div className="p-8 text-center bg-surface-container-low rounded-2xl border border-outline-variant/30 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-surface-container-high text-on-surface-variant flex items-center justify-center mx-auto">
                <Lock className="w-7 h-7" />
              </div>
              <div>
                <h3 className="font-headline-sm text-lg font-bold text-on-surface">
                  This Artisan Passport is Private
                </h3>
                <p className="text-xs text-on-surface-variant max-w-md mx-auto mt-1">
                  The artisan has enabled privacy mode. Only authorized workshops with active contracts can view detailed benchmarks.
                </p>
              </div>

              {isArtisanOwner && (
                <div className="pt-2">
                  <button
                    onClick={() => privacyMutation.mutate(true)}
                    disabled={privacyMutation.isPending}
                    className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-xs hover:bg-primary/90 transition-all inline-flex items-center gap-1.5"
                  >
                    <Globe className="w-4 h-4" />
                    <span>{t('trust.sharePassport')}</span>
                  </button>
                </div>
              )}
            </div>
          ) : passport ? (
            <>
              {/* Privacy Controls Bar (For Owner) */}
              {isArtisanOwner && (
                <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" />
                    <div>
                      <span className="font-bold text-on-surface block">Passport Visibility:</span>
                      <span className="text-[11px] text-on-surface-variant">
                        {passport.is_public ? 'Public (Anyone with QR/Link can view)' : 'Private (Hidden)'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => privacyMutation.mutate(!passport.is_public)}
                    disabled={privacyMutation.isPending}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      passport.is_public
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                        : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    {passport.is_public ? '✓ Public (Click to hide)' : 'Make Public'}
                  </button>
                </div>
              )}

              {/* QR Code and Verification Strip */}
              <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-2xl bg-success-bg border border-success/30">
                {passport.qr_code_data_url && (
                  <div className="p-2 bg-white rounded-xl shadow-xs border border-success/30 shrink-0">
                    <img
                      src={passport.qr_code_data_url}
                      alt="Artisan QR Passport"
                      className="w-32 h-32 object-contain"
                    />
                  </div>
                )}

                <div className="space-y-2 text-center sm:text-left flex-1">
                  <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-bold text-success">
                    <ShieldCheck className="w-4 h-4 text-success" />
                    <span>{t('trust.officialVerifiedPassport')}</span>
                  </div>
                  <p className="text-xs text-ink">
                    {t('trust.scanQr')}
                  </p>

                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                    <button
                      onClick={copyPassportUrl}
                      className="h-8 px-3 rounded-lg bg-surface-container-lowest text-on-surface text-xs font-bold border border-outline-variant/40 hover:bg-surface-container transition-colors flex items-center gap-1.5 shadow-xs"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? t('common.copied') : t('common.copyLink')}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 5-Factor Bayesian Audit Breakdown */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-headline-sm text-sm font-bold text-on-surface flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-primary" />
                    <span>5-Factor Audit Breakdown</span>
                  </h3>
                  <span className="text-[11px] font-mono text-on-surface-variant">
                    Formula: (v/(v+10))*R + (10/(v+10))*C
                  </span>
                </div>

                <div className="space-y-3">
                  {/* Factor 1: On-Time Delivery */}
                  <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-on-surface flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-secondary" />
                        <span>On-Time Wedding & Occasion Delivery (30% Weight)</span>
                      </span>
                      <span className="font-bold font-mono text-sm text-success">
                        {passport.factors.on_time_delivery.bayesian_score.toFixed(2)} / 5.0
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden mb-1.5">
                      <div
                        className="h-full bg-secondary rounded-full"
                        style={{ width: `${(passport.factors.on_time_delivery.bayesian_score / 5) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-on-surface-variant font-mono">
                      <span>Observed Score: {passport.factors.on_time_delivery.raw_score.toFixed(2)} / 5</span>
                      <span>Sample: {passport.factors.on_time_delivery.sample_size} orders (Guild benchmark: 4.0)</span>
                    </div>
                  </div>

                  {/* Factor 2: Wastage Adherence */}
                  <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-on-surface flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5 text-primary" />
                        <span>Gold Wastage Adherence (25% Weight)</span>
                      </span>
                      <span className="font-bold font-mono text-sm text-success">
                        {passport.factors.wastage_adherence.bayesian_score.toFixed(2)} / 5.0
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden mb-1.5">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${(passport.factors.wastage_adherence.bayesian_score / 5) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-on-surface-variant font-mono">
                      <span>Observed Score: {passport.factors.wastage_adherence.raw_score.toFixed(2)} / 5</span>
                      <span>Sample: {passport.factors.wastage_adherence.sample_size} returns (Guild benchmark: 4.2)</span>
                    </div>
                  </div>

                  {/* Factor 3: Quality Acceptance */}
                  <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-on-surface flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                        <span>Quality & Hallmark Acceptance (20% Weight)</span>
                      </span>
                      <span className="font-bold font-mono text-sm text-success">
                        {passport.factors.quality_acceptance.bayesian_score.toFixed(2)} / 5.0
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden mb-1.5">
                      <div
                        className="h-full bg-success rounded-full"
                        style={{ width: `${(passport.factors.quality_acceptance.bayesian_score / 5) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-on-surface-variant font-mono">
                      <span>Observed Score: {passport.factors.quality_acceptance.raw_score.toFixed(2)} / 5</span>
                      <span>Sample: {passport.factors.quality_acceptance.sample_size} QC checks (Guild benchmark: 4.5)</span>
                    </div>
                  </div>

                  {/* Factor 4: Dispute Frequency */}
                  <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-on-surface flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-warn" />
                        <span>Dispute-Free Passbook Record (15% Weight)</span>
                      </span>
                      <span className="font-bold font-mono text-sm text-success">
                        {passport.factors.dispute_frequency.bayesian_score.toFixed(2)} / 5.0
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden mb-1.5">
                      <div
                        className="h-full bg-warn rounded-full"
                        style={{ width: `${(passport.factors.dispute_frequency.bayesian_score / 5) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-on-surface-variant font-mono">
                      <span>Observed Score: {passport.factors.dispute_frequency.raw_score.toFixed(2)} / 5</span>
                      <span>Sample: {passport.factors.dispute_frequency.sample_size} ledger entries (Guild benchmark: 4.5)</span>
                    </div>
                  </div>

                  {/* Factor 5: Communication Responsiveness */}
                  <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-on-surface flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-secondary" />
                        <span>Dual-Confirmation Turnaround (10% Weight)</span>
                      </span>
                      <span className="font-bold font-mono text-sm text-success">
                        {passport.factors.communication_responsiveness.bayesian_score.toFixed(2)} / 5.0
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden mb-1.5">
                      <div
                        className="h-full bg-secondary-fixed rounded-full"
                        style={{ width: `${(passport.factors.communication_responsiveness.bayesian_score / 5) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-on-surface-variant font-mono">
                      <span>Observed Score: {passport.factors.communication_responsiveness.raw_score.toFixed(2)} / 5</span>
                      <span>Sample: {passport.factors.communication_responsiveness.sample_size} dual-confirmations (Benchmark: 3.8)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cryptographic Ledger Audit Stamp */}
              <div className="p-3 rounded-xl bg-surface-container text-xs flex items-center justify-between font-mono text-on-surface-variant border border-outline-variant/30">
                <span className="flex items-center gap-1 text-[11px]">
                  <ShieldCheck className="w-3.5 h-3.5 text-success" />
                  <span>Audit Engine Version: {passport.calculation_version}</span>
                </span>
                <span className="text-[10px]">
                  Updated: {new Date(passport.issued_at).toLocaleDateString('en-IN')}
                </span>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

