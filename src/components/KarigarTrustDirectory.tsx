import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  Star,
  Award,
  Clock,
  Flame,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  ArrowUpDown,
  RefreshCw,
  Search,
  ExternalLink,
  PlusCircle,
  Sparkles,
  UserCheck
} from 'lucide-react';
import { KarigarTrustScore, TrustScoreListResponse, Party, User } from '../../shared/types.js';
import { useToast } from './Toast.js';

interface KarigarTrustDirectoryProps {
  karigars: (Party | User)[];
  currentParty: Party | User;
  onSelectKarigarForJob?: (karigarId: string) => void;
  onOpenPassportModal?: (karigarId: string) => void;
}

type SortField = 'composite_score' | 'on_time' | 'wastage' | 'quality' | 'disputes' | 'total_orders';

export const KarigarTrustDirectory: React.FC<KarigarTrustDirectoryProps> = ({
  karigars,
  currentParty,
  onSelectKarigarForJob,
  onOpenPassportModal
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('composite_score');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

  // Fetch all trust scores
  const { data: scoresRes, isLoading, refetch } = useQuery<TrustScoreListResponse>({
    queryKey: ['trust-scores-all'],
    queryFn: async () => {
      const res = await fetch('/api/trust-score');
      if (!res.ok) throw new Error('Failed to load artisan trust scores');
      return res.json();
    }
  });

  // Mutation: Recalculate all trust scores
  const recalculateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/trust-score/recalculate', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to recalculate trust scores');
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(
        'Trust Scores Recalculated',
        `Recalculated Bayesian trust scores for ${data.data?.recalculated_count || 0} artisans using v1.0 engine.`
      );
      queryClient.invalidateQueries({ queryKey: ['trust-scores-all'] });
      queryClient.invalidateQueries({ queryKey: ['trust-score'] });
    },
    onError: (err: any) => {
      toast.error('Recalculation Failed', err.message);
    }
  });

  const scores = scoresRes?.data || [];

  // Sort and filter artisans
  const filteredAndSorted = [...scores].filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = s.karigar_name?.toLowerCase().includes(q);
    const benchMatch = s.business_name?.toLowerCase().includes(q);
    return nameMatch || benchMatch;
  }).sort((a, b) => {
    let valA = 0;
    let valB = 0;

    switch (sortField) {
      case 'composite_score':
        valA = a.composite_score;
        valB = b.composite_score;
        break;
      case 'on_time':
        valA = a.factors.on_time_delivery.bayesian_score;
        valB = b.factors.on_time_delivery.bayesian_score;
        break;
      case 'wastage':
        valA = a.factors.wastage_adherence.bayesian_score;
        valB = b.factors.wastage_adherence.bayesian_score;
        break;
      case 'quality':
        valA = a.factors.quality_acceptance.bayesian_score;
        valB = b.factors.quality_acceptance.bayesian_score;
        break;
      case 'disputes':
        valA = a.factors.dispute_frequency.bayesian_score;
        valB = b.factors.dispute_frequency.bayesian_score;
        break;
      case 'total_orders':
        valA = a.total_orders;
        valB = b.total_orders;
        break;
    }

    return sortOrder === 'DESC' ? valB - valA : valA - valB;
  });

  const avgComposite = scores.length > 0
    ? Number((scores.reduce((acc, s) => acc + s.composite_score, 0) / scores.length).toFixed(2))
    : 4.2;

  const topTierCount = scores.filter((s) => s.composite_score >= 4.5).length;

  return (
    <div className="space-y-6">
      {/* Top Banner: Decision View Purpose */}
      <div className="rounded-2xl bg-surface-container-lowest p-5 sm:p-6 shadow-sm border border-outline-variant/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-headline-sm text-lg sm:text-xl font-bold text-on-surface">
                Artisan Trust Decision Directory
              </h2>
              <p className="text-xs text-on-surface-variant">
                &ldquo;Who do I trust with my precious gold?&rdquo; • Bayesian audited performance rankings
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => recalculateMutation.mutate()}
            disabled={recalculateMutation.isPending}
            className="h-10 px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-label-md font-bold transition-all flex items-center gap-2 border border-outline-variant/30"
            title="Recalculate Bayesian average scores across all orders, wastage logs, and dual confirmations"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${recalculateMutation.isPending ? 'animate-spin' : ''}`} />
            <span>Recalculate Scores</span>
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/30 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-on-surface-variant font-bold block">Artisans on Bench</span>
            <span className="text-2xl font-extrabold text-on-surface">{scores.length}</span>
            <span className="text-[11px] text-primary block mt-0.5">Active Master Goldsmiths</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-primary">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/30 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-on-surface-variant font-bold block">Workshop Average Trust</span>
            <span className="text-2xl font-extrabold text-success flex items-center gap-1">
              {avgComposite} <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
            </span>
            <span className="text-[11px] text-success font-bold block mt-0.5">Guild Benchmark: 4.0</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-success-bg flex items-center justify-center text-success">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/30 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-on-surface-variant font-bold block">Elite Artisans (Grade A+)</span>
            <span className="text-2xl font-extrabold text-primary">{topTierCount}</span>
            <span className="text-[11px] text-on-surface-variant block mt-0.5">&ge; 4.5 Certified Score</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Sorting Bar */}
      <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/30 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Search artisan name, bench #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 text-xs bg-surface-container-low rounded-xl border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface"
          />
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs text-on-surface-variant font-bold flex items-center gap-1 shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Sort By:</span>
          </span>

          {[
            { id: 'composite_score', label: 'Overall Trust Score' },
            { id: 'on_time', label: 'On-Time (30%)' },
            { id: 'wastage', label: 'Wastage (25%)' },
            { id: 'quality', label: 'Quality (20%)' },
            { id: 'disputes', label: 'Disputes (15%)' }
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => {
                if (sortField === opt.id) {
                  setSortOrder(sortOrder === 'DESC' ? 'ASC' : 'DESC');
                } else {
                  setSortField(opt.id as SortField);
                  setSortOrder('DESC');
                }
              }}
              className={`h-8 px-3 rounded-lg text-xs font-label-md font-semibold transition-all shrink-0 flex items-center gap-1 ${
                sortField === opt.id
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span>{opt.label}</span>
              {sortField === opt.id && (
                <span className="text-[10px]">{sortOrder === 'DESC' ? '↓' : '↑'}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Artisan Cards Grid */}
      {isLoading ? (
        <div className="p-12 text-center text-on-surface-variant bg-surface-container-lowest rounded-2xl border border-outline-variant/30">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
          <p className="font-label-md text-sm">Evaluating Bayesian artisan trust rankings...</p>
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="p-12 text-center text-on-surface-variant bg-surface-container-lowest rounded-2xl border border-outline-variant/30">
          <p className="font-headline-sm text-base text-on-surface mb-1">No artisans found</p>
          <p className="text-xs">No artisan matching &ldquo;{searchQuery}&rdquo;.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAndSorted.map((artisan, index) => {
            const isTopTier = artisan.composite_score >= 4.5;
            const rank = index + 1;

            return (
              <div
                key={artisan.karigar_id}
                className="bg-surface-container-lowest rounded-2xl p-5 shadow-xs border border-outline-variant/30 hover:border-primary/50 transition-all flex flex-col justify-between relative overflow-hidden group"
              >
                {/* Rank Ribbon */}
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-outline-variant/20">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-surface-container-high text-on-surface font-mono font-bold text-xs flex items-center justify-center">
                      #{rank}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                      isTopTier ? 'bg-success-bg text-success border border-success/30' : 'bg-surface-container text-on-surface'
                    }`}>
                      {isTopTier ? 'Elite Certified' : 'Verified Artisan'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 font-bold">
                    <span className="text-xl font-extrabold text-success">
                      {artisan.composite_score.toFixed(2)}
                    </span>
                    <span className="text-xs text-on-surface-variant">/ 5.0</span>
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500 ml-0.5" />
                  </div>
                </div>

                {/* Karigar Profile */}
                <div className="flex items-start gap-3 mb-4">
                  <img
                    src={artisan.avatar_url || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150'}
                    alt={artisan.karigar_name}
                    className="w-12 h-12 rounded-xl object-cover border border-outline-variant/40 shrink-0 shadow-inner"
                  />
                  <div>
                    <h3 className="font-headline-sm text-base font-bold text-on-surface group-hover:text-primary transition-colors">
                      {artisan.karigar_name}
                    </h3>
                    <p className="text-xs text-on-surface-variant">{artisan.business_name}</p>
                    <span className="inline-block mt-1 text-[10px] text-primary font-bold">
                      {artisan.total_orders} Orders Completed
                    </span>
                  </div>
                </div>

                {/* 5 Factor Mini Bars */}
                <div className="space-y-2 mb-5 bg-surface-container-low p-3 rounded-xl border border-outline-variant/20 text-xs">
                  {/* On-Time */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span className="text-on-surface flex items-center gap-1">
                        <Clock className="w-3 h-3 text-secondary" />
                        <span>On-Time Delivery (30%)</span>
                      </span>
                      <span className="font-bold font-mono">
                        {artisan.factors.on_time_delivery.bayesian_score.toFixed(1)}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                      <div
                        className="h-full bg-secondary rounded-full"
                        style={{ width: `${(artisan.factors.on_time_delivery.bayesian_score / 5) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Wastage */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span className="text-on-surface flex items-center gap-1">
                        <Flame className="w-3 h-3 text-primary" />
                        <span>Wastage Adherence (25%)</span>
                      </span>
                      <span className="font-bold font-mono">
                        {artisan.factors.wastage_adherence.bayesian_score.toFixed(1)}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${(artisan.factors.wastage_adherence.bayesian_score / 5) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Quality */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span className="text-on-surface flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-success" />
                        <span>Quality Acceptance (20%)</span>
                      </span>
                      <span className="font-bold font-mono">
                        {artisan.factors.quality_acceptance.bayesian_score.toFixed(1)}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                      <div
                        className="h-full bg-success rounded-full"
                        style={{ width: `${(artisan.factors.quality_acceptance.bayesian_score / 5) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Disputes */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span className="text-on-surface flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        <span>Dispute Free Record (15%)</span>
                      </span>
                      <span className="font-bold font-mono">
                        {artisan.factors.dispute_frequency.bayesian_score.toFixed(1)}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                      <div
                        className="h-full bg-amber-600 rounded-full"
                        style={{ width: `${(artisan.factors.dispute_frequency.bayesian_score / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div className="flex items-center gap-2 pt-2 border-t border-outline-variant/20">
                  {onOpenPassportModal && (
                    <button
                      onClick={() => onOpenPassportModal(artisan.karigar_id)}
                      className="flex-1 h-9 px-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-label-md font-bold transition-all flex items-center justify-center gap-1 border border-outline-variant/30"
                    >
                      <QrCode className="w-3.5 h-3.5 text-primary" />
                      <span>Passport & QR</span>
                    </button>
                  )}

                  {onSelectKarigarForJob && (
                    <button
                      onClick={() => onSelectKarigarForJob(artisan.karigar_id)}
                      className="flex-1 h-9 px-2 rounded-xl bg-primary hover:bg-primary/90 text-on-primary text-xs font-label-md font-bold transition-all flex items-center justify-center gap-1 shadow-xs"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Assign Gold</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

