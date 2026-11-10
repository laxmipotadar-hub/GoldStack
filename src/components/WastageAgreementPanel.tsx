import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Scale,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Clock,
  ArrowRight,
  TrendingDown,
  Info,
  RefreshCw,
  PlusCircle,
  Percent,
  BarChart3,
  UserCheck
} from 'lucide-react';
import {
  WastageBenchmark,
  WastageAgreement,
  DesignComplexity,
  Party,
  User,
  Role
} from '../../shared/types.js';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from './Toast.js';
import { WastageHistoryChart } from './WastageHistoryChart.js';

interface WastageAgreementPanelProps {
  karigars: (Party | User)[];
  jewellers?: (Party | User)[];
  selectedKarigarId?: string;
  onAgreementSelected?: (agreement: WastageAgreement) => void;
}

const CATEGORIES = [
  { id: 'RINGS', label: 'Rings • अँगूठी (Band, Solitaire)', defaultComp: 'SIMPLE' as DesignComplexity },
  { id: 'NECKLACES', label: 'Necklaces • हार (Choker, Link)', defaultComp: 'MEDIUM' as DesignComplexity },
  { id: 'BRIDAL_SETS', label: 'Bridal Sets • दुल्हन सेट (Kundan, Polki)', defaultComp: 'COMPLEX' as DesignComplexity },
  { id: 'TEMPLE_JEWELLERY', label: 'Temple Jewellery • मंदिर गहने (Nakshi, Antique)', defaultComp: 'VERY_COMPLEX' as DesignComplexity },
  { id: 'BANGLES', label: 'Bangles • कंगन / चूड़ियाँ (Solid Kada)', defaultComp: 'SIMPLE' as DesignComplexity },
  { id: 'EARRINGS', label: 'Earrings • झुमके (Jhumka, Chandbali)', defaultComp: 'MEDIUM' as DesignComplexity }
];

const COMPLEXITIES: { id: DesignComplexity; label: string; desc: string; hindi: string }[] = [
  { id: 'SIMPLE', label: 'Simple (सरल)', desc: 'Plain cast, die-punch, solid bands', hindi: 'सादा ढलाई' },
  { id: 'MEDIUM', label: 'Medium (मध्यम)', desc: 'Collet setting, hollow domes, link chains', hindi: 'नगीना जड़ाई' },
  { id: 'COMPLEX', label: 'Complex (जटिल)', desc: 'Multi-tier bridal, Kundan, open filigree', hindi: 'बारीक काम' },
  { id: 'VERY_COMPLEX', label: 'Very Complex (अति जटिल)', desc: 'Deep relief Nakshi repousse, antique deities', hindi: 'नक्काशी / देव गहने' }
];

export const WastageAgreementPanel: React.FC<WastageAgreementPanelProps> = ({
  karigars,
  selectedKarigarId: initialKarigarId,
  onAgreementSelected
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const isJeweller = user?.role === 'JEWELLER';
  const isKarigar = user?.role === 'KARIGAR';

  // Sub-tab: Agreements vs Analytics
  const [activeSubTab, setActiveSubTab] = useState<'AGREEMENTS' | 'ANALYTICS'>('AGREEMENTS');
  const [analyticsKarigarId, setAnalyticsKarigarId] = useState<string>(
    isKarigar && user?.id ? user.id : (initialKarigarId || karigars[0]?.id || '')
  );

  // Calculator State
  const [selectedCategory, setSelectedCategory] = useState<string>('RINGS');
  const [selectedComplexity, setSelectedComplexity] = useState<DesignComplexity>('SIMPLE');

  // Proposal Form State (for Jeweller)
  const [orderRef, setOrderRef] = useState<string>('ORD-2026-902');
  const [selectedKarigarId, setSelectedKarigarId] = useState<string>(
    initialKarigarId || karigars[0]?.id || ''
  );
  const [customRate, setCustomRate] = useState<string>('6.5');
  const [isSubmittingProposal, setIsSubmittingProposal] = useState<boolean>(false);

  // Rejection modal/state
  const [rejectingAgreementId, setRejectingAgreementId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('Rate is below workshop minimum loss for this design');

  // 1. Fetch benchmark suggestion based on category & complexity
  const { data: benchmarkData, isLoading: isLoadingBenchmark, refetch: refetchBenchmark } = useQuery<{
    success: boolean;
    data: {
      category: string;
      complexity: DesignComplexity;
      min_pct: number;
      max_pct: number;
      avg_pct: number;
      suggested_pct: number;
      sample_size: number;
      description: string;
      benchmarks: WastageBenchmark[];
    };
  }>({
    queryKey: ['wastageBenchmark', selectedCategory, selectedComplexity],
    queryFn: async () => {
      const res = await fetch(
        `/api/wastage/benchmarks?category=${encodeURIComponent(selectedCategory)}&complexity=${encodeURIComponent(
          selectedComplexity
        )}`
      );
      if (!res.ok) throw new Error('Failed to fetch benchmark');
      return res.json();
    }
  });

  // 2. Fetch existing agreements for this user
  const { data: agreementsData, isLoading: isLoadingAgreements } = useQuery<{
    success: boolean;
    data: WastageAgreement[];
  }>({
    queryKey: ['wastageAgreements', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/wastage/agreements', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch agreements');
      return res.json();
    },
    refetchInterval: 8000
  });

  const benchmark = benchmarkData?.data;
  const agreements = agreementsData?.data || [];

  // Mutation: Propose Agreement (Jeweller)
  const proposeMutation = useMutation({
    mutationFn: async (payload: {
      order_ref: string;
      karigar_id: string;
      agreed_pct: number;
      design_complexity: DesignComplexity;
      category: string;
    }) => {
      const res = await fetch('/api/wastage/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to propose agreement');
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        'Agreement Proposed! • समझौता प्रस्तावित',
        `Proposed ${data.data.agreed_pct}% for order ${data.data.order_ref}. Awaiting artisan acceptance.`
      );
      queryClient.invalidateQueries({ queryKey: ['wastageAgreements'] });
      setOrderRef(`ORD-2026-${Math.floor(100 + Math.random() * 900)}`);
    },
    onError: (err: any) => {
      toast.error('Proposal Failed', err.message);
    }
  });

  // Mutation: Respond to Agreement (Karigar: Accept / Reject)
  const respondMutation = useMutation({
    mutationFn: async (payload: {
      agreement_id: string;
      action: 'ACCEPT' | 'REJECT';
      rejection_reason?: string;
    }) => {
      const res = await fetch('/api/wastage/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to respond to agreement');
      return data;
    },
    onSuccess: (data) => {
      if (data.data.status === 'ACCEPTED') {
        toast.success(
          'Agreement Accepted! • समझौता स्वीकार किया',
          `Wastage rate locked at ${data.data.agreed_pct}% for order ${data.data.order_ref}.`
        );
      } else {
        toast.warning(
          'Agreement Rejected • समझौता अस्वीकार',
          `Order ${data.data.order_ref} marked as rejected.`
        );
      }
      setRejectingAgreementId(null);
      queryClient.invalidateQueries({ queryKey: ['wastageAgreements'] });
    },
    onError: (err: any) => {
      toast.error('Response Failed', err.message);
    }
  });

  const handleProposeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderRef.trim()) {
      toast.error('Order Reference Required', 'Please provide an order number (e.g. ORD-2026-902).');
      return;
    }
    const rateNum = parseFloat(customRate);
    if (isNaN(rateNum) || rateNum <= 0) {
      toast.error('Invalid Rate', 'Please enter a valid wastage percentage.');
      return;
    }

    proposeMutation.mutate({
      order_ref: orderRef.trim(),
      karigar_id: selectedKarigarId || karigars[0]?.id || '',
      agreed_pct: rateNum,
      design_complexity: selectedComplexity,
      category: selectedCategory
    });
  };

  const handleApplyBenchmark = () => {
    if (benchmark) {
      setCustomRate(benchmark.suggested_pct.toFixed(2));
      toast.info('Benchmark Applied', `Set rate to market average: ${benchmark.suggested_pct}%`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-surface-container-high to-surface-container-lowest border border-outline-variant/40 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
              Smart Wastage Engine • स्मार्ट नुकसान समझौता
            </span>
            <span className="text-xs text-secondary font-medium">Dual-Confirmation Protocol</span>
          </div>
          <h2 className="font-headline-sm text-xl font-bold text-on-surface">
            Standard Wastage Benchmarks & Pre-Job Agreements
          </h2>
          <p className="text-xs text-on-surface-variant max-w-2xl mt-1">
            Pre-agree on allowed gold loss (*ghat / tunda*) before job-work begins. Enforces an automatic{' '}
            <strong className="text-primary font-bold">+2.0% tolerance boundary</strong> during return settlement.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="bg-surface-container-lowest px-3 py-2 rounded-xl border border-outline-variant/30 text-right">
            <span className="text-[10px] text-secondary uppercase font-bold block">Current Role</span>
            <span className="font-headline-sm text-xs font-bold text-on-surface flex items-center gap-1.5 justify-end">
              <span className={`w-2 h-2 rounded-full ${isJeweller ? 'bg-brand' : 'bg-success'}`} />
              {user?.role} ({user?.name.split(' ')[0]})
            </span>
          </div>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 border-b border-outline-variant/30 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('AGREEMENTS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeSubTab === 'AGREEMENTS'
              ? 'bg-primary text-on-primary shadow-xs'
              : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Pre-Job Agreements (छीजत समझौते)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('ANALYTICS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeSubTab === 'ANALYTICS'
              ? 'bg-primary text-on-primary shadow-xs'
              : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Wastage Analytics & WMA Chart (कारीगर छीजत विश्लेषण)</span>
        </button>
      </div>

      {/* Sub-Tab 2: Analytics & WMA Chart View */}
      {activeSubTab === 'ANALYTICS' && (
        <div className="space-y-4 animate-in fade-in-50 duration-200">
          {/* Artisan Selector (for Jewellers inspecting workshop artisans) */}
          {isJeweller && (
            <div className="bg-surface-container-lowest p-3.5 rounded-xl border border-outline-variant/30 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-primary" />
                <span>Select Artisan to Inspect (कारीगर चुनें):</span>
              </span>

              <div className="flex items-center gap-2 flex-wrap">
                {karigars.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setAnalyticsKarigarId(k.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      analyticsKarigarId === k.id
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    {k.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <WastageHistoryChart
            karigarId={isKarigar && user?.id ? user.id : analyticsKarigarId}
            karigarName={
              isKarigar && user?.name
                ? user.name
                : karigars.find((k) => k.id === analyticsKarigarId)?.name
            }
            isArtisanView={isKarigar}
          />
        </div>
      )}

      {/* Sub-Tab 1: Agreements & Calculator View */}
      {activeSubTab === 'AGREEMENTS' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in-50 duration-200">
        {/* Left Column: Benchmark Suggestion Calculator (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Category & Complexity Pickers */}
          <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/40 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-xs font-bold text-on-surface flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span>1. Select Jewellery Item & Craftsmanship Level (आभूषण श्रेणी व कारीगरी)</span>
              </span>
              <button
                onClick={() => refetchBenchmark()}
                className="text-xs text-secondary hover:text-primary transition-colors flex items-center gap-1"
                title="Refresh benchmarks"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            </div>

            {/* Category Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      setSelectedComplexity(cat.defaultComp);
                    }}
                    className={`p-2.5 rounded-xl text-left border transition-all text-xs flex flex-col justify-between ${
                      isSelected
                        ? 'bg-primary/10 border-primary text-on-surface font-bold shadow-xs'
                        : 'bg-surface-container hover:bg-surface-container-high border-outline-variant/40 text-on-surface-variant'
                    }`}
                  >
                    <span className="font-bold text-[11px] block">{cat.id.replace('_', ' ')}</span>
                    <span className="text-[10px] opacity-75 truncate">{cat.label.split('•')[1] || cat.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Complexity Cards */}
            <div>
              <span className="text-[11px] font-bold text-secondary uppercase tracking-wider block mb-2">
                Design Complexity Level (जटिलता स्तर)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {COMPLEXITIES.map((c) => {
                  const isSelected = selectedComplexity === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedComplexity(c.id)}
                      className={`p-2.5 rounded-xl text-left border transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'bg-surface-container-high border-primary text-on-surface ring-1 ring-primary'
                          : 'bg-surface-container-low hover:bg-surface-container border-outline-variant/30 text-on-surface-variant'
                      }`}
                    >
                      <span className="font-bold text-xs block">{c.id}</span>
                      <span className="text-[10px] text-primary font-medium">{c.hindi}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Benchmark Output Card */}
            {benchmark && (
              <div className="mt-4 bg-gradient-to-br from-surface-container to-surface-container-high rounded-xl p-4 border border-primary/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-[11px] text-secondary uppercase tracking-wider font-bold">
                    Market Benchmark Range • मानक दर
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-container-lowest text-secondary border border-outline-variant/40 font-medium">
                    {benchmark.sample_size} historical job samples
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 items-center text-center">
                  <div className="bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant/30">
                    <span className="text-[10px] text-secondary uppercase block">Minimum</span>
                    <span className="font-headline-sm text-lg font-bold text-on-surface">{benchmark.min_pct.toFixed(1)}%</span>
                  </div>

                  <div className="bg-primary/10 p-2.5 rounded-lg border border-primary/40 ring-2 ring-primary/20 scale-105 shadow-xs">
                    <span className="text-[10px] text-primary font-bold uppercase block">Suggested Average</span>
                    <span className="font-headline-sm text-2xl font-extrabold text-primary">
                      {benchmark.avg_pct.toFixed(2)}%
                    </span>
                  </div>

                  <div className="bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant/30">
                    <span className="text-[10px] text-secondary uppercase block">Maximum</span>
                    <span className="font-headline-sm text-lg font-bold text-on-surface">{benchmark.max_pct.toFixed(1)}%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-outline-variant/30 text-xs">
                  <span className="text-on-surface-variant text-[11px] italic">
                    {benchmark.description}
                  </span>
                  {isJeweller && (
                    <button
                      type="button"
                      onClick={handleApplyBenchmark}
                      className="px-2.5 py-1 rounded-lg bg-primary text-on-primary text-[11px] font-bold hover:brightness-105 active:scale-95 transition-all flex items-center gap-1 shadow-xs"
                    >
                      <Percent className="w-3 h-3" />
                      <span>Use {benchmark.avg_pct}%</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Jeweller Proposal Form (Only enabled for Jewellers or in demo mode) */}
          {isJeweller && (
            <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/40 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-label-md text-xs font-bold text-on-surface flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <span>2. Propose New Agreement for Job Order (समझौता प्रस्ताव भेजें)</span>
                </span>
                <span className="text-[11px] text-secondary">Step 1 of 2: Awaiting Karigar</span>
              </div>

              <form onSubmit={handleProposeSubmit} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-secondary block mb-1">
                      Order Reference #
                    </label>
                    <input
                      type="text"
                      value={orderRef}
                      onChange={(e) => setOrderRef(e.target.value)}
                      placeholder="e.g. ORD-2026-902"
                      className="w-full h-10 px-3 text-xs font-bold bg-surface-container-low rounded-lg border border-outline-variant/50 focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-secondary block mb-1">
                      Assigned Karigar
                    </label>
                    <select
                      value={selectedKarigarId}
                      onChange={(e) => setSelectedKarigarId(e.target.value)}
                      className="w-full h-10 px-2 text-xs font-bold bg-surface-container-low rounded-lg border border-outline-variant/50 focus:outline-none"
                    >
                      {karigars.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-secondary block mb-1">
                      Proposed Wastage Rate (%)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        max="35"
                        value={customRate}
                        onChange={(e) => setCustomRate(e.target.value)}
                        className="w-full h-10 px-3 pr-8 text-sm font-extrabold text-on-surface bg-surface-container-low rounded-lg border border-outline-variant/50 focus:outline-none"
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-secondary font-bold">%</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-[11px] text-secondary flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>Tolerance threshold: <strong>{(parseFloat(customRate || '0') + 2.0).toFixed(2)}%</strong> (Flagged if actual exceeds this)</span>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingProposal || proposeMutation.isPending}
                    className="h-10 px-4 rounded-xl bg-primary text-on-primary font-bold text-xs hover:brightness-105 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Send Proposal to Artisan</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Right Column: Agreements Queue & Dual-Confirmation Cards (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-headline-sm text-sm font-bold text-on-surface flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span>Active Wastage Agreements ({agreements.length})</span>
            </h3>
            <span className="text-[11px] text-secondary font-medium">Dual-Confirmed</span>
          </div>

          {isLoadingAgreements ? (
            <div className="bg-surface-container-lowest p-8 rounded-2xl border border-outline-variant/30 flex flex-col items-center justify-center text-center">
              <RefreshCw className="w-6 h-6 animate-spin text-primary mb-2" />
              <span className="text-xs text-secondary">Loading wastage contracts...</span>
            </div>
          ) : agreements.length === 0 ? (
            <div className="bg-surface-container-lowest p-8 rounded-2xl border border-outline-variant/30 text-center space-y-2">
              <FileText className="w-8 h-8 text-outline-variant mx-auto mb-1" />
              <p className="text-xs font-bold text-on-surface">No agreements on file</p>
              <p className="text-[11px] text-on-surface-variant">
                Jeweller can propose a benchmarked wastage percentage for upcoming orders.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
              {agreements.map((agr) => {
                const isProposed = agr.status === 'PROPOSED';
                const isAccepted = agr.status === 'ACCEPTED';
                const isRejected = agr.status === 'REJECTED';
                const karigarParty = karigars.find((k) => k.id === agr.karigar_id);

                return (
                  <div
                    key={agr.id}
                    className={`bg-surface-container-lowest rounded-xl p-4 border transition-all space-y-3 ${
                      isProposed
                        ? 'border-amber-400/50 bg-amber-50/20 shadow-xs'
                        : isAccepted
                        ? 'border-success/40'
                        : 'border-danger/30'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-headline-sm text-sm font-extrabold text-on-surface">
                            {agr.order_ref}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                              isAccepted
                                ? 'bg-success-bg text-success'
                                : isProposed
                                ? 'bg-warn-bg text-warn animate-pulse'
                                : 'bg-danger-bg text-danger'
                            }`}
                          >
                            {agr.status === 'PROPOSED' ? 'Awaiting Artisan' : agr.status}
                          </span>
                        </div>
                        <span className="text-[11px] text-secondary block mt-0.5">
                          Artisan: <strong>{karigarParty?.name || agr.karigar_id.slice(0, 8)}</strong>
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-secondary uppercase font-bold block">Agreed Rate</span>
                        <span className="font-headline-sm text-lg font-black text-primary">
                          {agr.agreed_pct.toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    {/* Metadata tags */}
                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      <span className="px-2 py-0.5 rounded-md bg-surface-container text-on-surface-variant font-medium">
                        {agr.category || 'JEWELLERY'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-surface-container text-on-surface-variant font-medium">
                        {agr.design_complexity}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-bold">
                        Tolerance Max: {(agr.agreed_pct + 2.0).toFixed(2)}%
                      </span>
                    </div>

                    {/* Signatures & Timestamps */}
                    <div className="pt-2 border-t border-outline-variant/30 flex items-center justify-between text-[10px] text-secondary">
                      <span>Proposed: {new Date(agr.proposed_at).toLocaleDateString('en-IN')}</span>
                      {agr.responded_at && (
                        <span>
                          {agr.status === 'ACCEPTED' ? '✓ Signed' : '✗ Rejected'}:{' '}
                          {new Date(agr.responded_at).toLocaleDateString('en-IN')}
                        </span>
                      )}
                    </div>

                    {/* Karigar Action Buttons (When status is PROPOSED and viewing as Karigar) */}
                    {isProposed && isKarigar && user?.id === agr.karigar_id && (
                      <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-amber-800">
                          Review Rate: {agr.agreed_pct}%
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              respondMutation.mutate({
                                agreement_id: agr.id,
                                action: 'ACCEPT'
                              });
                            }}
                            disabled={respondMutation.isPending}
                            className="h-8 px-3 rounded-lg bg-[#477b55] text-white text-xs font-bold hover:brightness-105 active:scale-95 transition-all flex items-center gap-1 shadow-xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>स्वीकार करें (Accept)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setRejectingAgreementId(agr.id)}
                            disabled={respondMutation.isPending}
                            className="h-8 px-2.5 rounded-lg bg-surface-container-high hover:bg-error/10 text-error text-xs font-bold active:scale-95 transition-all flex items-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>खारिज (Reject)</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Rejection input expansion */}
                    {rejectingAgreementId === agr.id && (
                      <div className="pt-2 border-t border-error/20 space-y-2">
                        <label className="text-[10px] uppercase font-bold text-error block">
                          Reason for Rejection (अस्वीकृति का कारण)
                        </label>
                        <input
                          type="text"
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          className="w-full h-8 px-2 text-xs bg-surface-container-low rounded border border-error/40 focus:outline-none"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setRejectingAgreementId(null)}
                            className="px-2 py-1 text-[11px] text-secondary hover:text-on-surface"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              respondMutation.mutate({
                                agreement_id: agr.id,
                                action: 'REJECT',
                                rejection_reason: rejectionReason
                              });
                            }}
                            className="px-3 py-1 bg-error text-on-error rounded text-[11px] font-bold"
                          >
                            Confirm Rejection
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Pre-select in Return Gold form */}
                    {isAccepted && onAgreementSelected && (
                      <button
                        type="button"
                        onClick={() => onAgreementSelected(agr)}
                        className="w-full text-center py-1 text-[11px] text-primary hover:underline font-bold"
                      >
                        Use for Return Settlement →
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
};

