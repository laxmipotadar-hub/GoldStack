import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Receipt,
  PlusCircle,
  Filter,
  RefreshCw,
  Scale,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  DollarSign,
  HelpCircle,
  X
} from 'lucide-react';
import {
  Settlement,
  SettlementStatus,
  CreateSettlementRequest,
  Party,
  User as UserModel,
  CustomerOrder,
  PaymentMethod,
  SettlementAgingReport,
  SettlementAgingBucket,
  SettlementAgingItem
} from '../../shared/types.js';
import { calculateSettlement } from '../../shared/settlementCalculation.js';
import { SettlementCard } from './SettlementCard.js';
import { useToast } from './Toast.js';
import { useAuth } from '../context/AuthContext.js';

interface SettlementPanelProps {
  karigars: (Party | UserModel)[];
  selectedKarigarId?: string;
  onSelectKarigar?: (id: string) => void;
}

export const SettlementPanel: React.FC<SettlementPanelProps> = ({
  karigars,
  selectedKarigarId,
  onSelectKarigar
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const isJeweller = user?.role === 'JEWELLER';
  const isKarigar = user?.role === 'KARIGAR';

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showAgingReport, setShowAgingReport] = useState<boolean>(false);
  const [selectedAgingBucket, setSelectedAgingBucket] = useState<'ALL' | '0-7' | '8-15' | '16-30' | '>30'>('ALL');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);

  // New Settlement Form State
  const [targetKarigarId, setTargetKarigarId] = useState<string>(
    selectedKarigarId || (karigars[0]?.id || '')
  );
  const [linkedOrderId, setLinkedOrderId] = useState<string>('');
  const [issuedGrams, setIssuedGrams] = useState<number>(50.0);
  const [returnedGrams, setReturnedGrams] = useState<number>(47.0);
  const [agreedWastagePct, setAgreedWastagePct] = useState<number>(6.0);
  const [makingChargePerGram, setMakingChargePerGram] = useState<number>(650.0);
  const [advances, setAdvances] = useState<number>(10000.0);
  const [notes, setNotes] = useState<string>('');

  // 1. Fetch Current Bullion Gold Rate
  const { data: rateRes } = useQuery<{ success: boolean; data: { rate_per_gram_24k: number; formatted: string } }>({
    queryKey: ['bullionRateCurrent'],
    queryFn: async () => {
      const res = await fetch('/api/rates/current');
      if (!res.ok) throw new Error('Failed to fetch bullion rate');
      return res.json();
    }
  });

  const currentRate = rateRes?.data?.rate_per_gram_24k || 7420.0;

  // 2. Fetch Orders for Karigar (to link)
  const { data: ordersRes } = useQuery<{ success: boolean; data: CustomerOrder[] }>({
    queryKey: ['ordersForSettlement', targetKarigarId],
    queryFn: async () => {
      const res = await fetch('/api/orders', { credentials: 'include' });
      if (!res.ok) return { success: true, data: [] };
      return res.json();
    },
    enabled: isJeweller && isCreateModalOpen
  });

  const availableOrders = ordersRes?.data || [];

  // 3. Fetch Settlements List
  const { data: settlementsRes, isLoading, refetch } = useQuery<{ success: boolean; data: Settlement[] }>({
    queryKey: ['settlements', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      const res = await fetch(`/api/settlements?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch settlements');
      return res.json();
    }
  });

  const settlements = settlementsRes?.data || [];

  // Live calculation preview for modal
  const livePreview = calculateSettlement({
    issuedGrams: Number(issuedGrams) || 0,
    returnedGrams: Number(returnedGrams) || 0,
    agreedWastagePct: Number(agreedWastagePct) || 0,
    goldRatePerGram24K: currentRate,
    makingChargePerGram: Number(makingChargePerGram) || 0,
    advances: Number(advances) || 0
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (payload: CreateSettlementRequest) => {
      const res = await fetch('/api/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to generate settlement');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      toast.success('हिसाब प्रस्ताव भेजा गया (Settlement Proposed)', data.message);
      setIsCreateModalOpen(false);
    },
    onError: (err: any) => {
      toast.error('हिसाब निर्माण विफल (Failed)', err.message);
    }
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const res = await fetch(`/api/settlements/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to approve settlement');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      toast.success('हिसाब स्वीकृत (Approved)', data.message);
    },
    onError: (err: any) => {
      toast.error('स्वीकृति त्रुटि (Error)', err.message);
    }
  });

  const disputeMutation = useMutation({
    mutationFn: async ({ id, dispute_reason }: { id: string; dispute_reason: string }) => {
      const res = await fetch(`/api/settlements/${id}/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dispute_reason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to dispute settlement');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      toast.warning('आपत्ति दर्ज (Dispute Registered)', data.message);
    },
    onError: (err: any) => {
      toast.error('आपत्ति दर्ज करने में विफल (Failed)', err.message);
    }
  });

  const payMutation = useMutation({
    mutationFn: async ({
      id,
      paymentMethod,
      reference,
      notes
    }: {
      id: string;
      paymentMethod: PaymentMethod;
      reference?: string;
      notes?: string;
    }) => {
      const res = await fetch(`/api/settlements/${id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          payment_method: paymentMethod,
          payment_reference: reference,
          notes
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to execute payment');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      queryClient.invalidateQueries({ queryKey: ['settlementAging'] });
      queryClient.invalidateQueries({ queryKey: ['ledgerHistory'] });
      queryClient.invalidateQueries({ queryKey: ['chainVerification'] });
      toast.success('भुगतान पूर्ण (Paid & Settled)', data.message);
    },
    onError: (err: any) => {
      toast.error('भुगतान निष्पादन विफल (Payment Failed)', err.message);
    }
  });

  // 4. Fetch Outstanding Settlements Aging Report (Jewellers Only)
  const { data: agingRes, isLoading: isAgingLoading, refetch: refetchAging } = useQuery<{
    success: boolean;
    data: SettlementAgingReport;
  }>({
    queryKey: ['settlementAging'],
    queryFn: async () => {
      const res = await fetch('/api/settlements/aging', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch aging report');
      return res.json();
    },
    enabled: isJeweller
  });

  const agingReport = agingRes?.data;

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetKarigarId) {
      toast.warning('कारीगर चुनें', 'कृपया हिसाब के लिए कारीगर चुनें');
      return;
    }

    createMutation.mutate({
      karigar_id: targetKarigarId,
      order_id: linkedOrderId || null,
      issued_grams: Number(issuedGrams),
      returned_grams: Number(returnedGrams),
      agreed_wastage_pct: Number(agreedWastagePct),
      making_charge_per_gram: Number(makingChargePerGram),
      advances: Number(advances),
      notes: notes.trim() || undefined
    });
  };

  // Metrics
  const totalSettledCount = settlements.filter((s) => s.status === 'PAID').length;
  const awaitingCount = settlements.filter((s) => s.status === 'AWAITING_KARIGAR' || s.status === 'AWAITING_JEWELLER').length;
  const disputedCount = settlements.filter((s) => s.status === 'DISPUTED').length;
  const totalPaidAmount = settlements
    .filter((s) => s.status === 'PAID')
    .reduce((sum, s) => sum + s.net_payable, 0);

  return (
    <div className="space-y-6">
      {/* Header and Summary Banner */}
      <div className="bg-gradient-to-r from-amber-900 via-stone-900 to-amber-950 text-white rounded-2xl p-5 sm:p-6 shadow-md border border-amber-800/40">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="w-6 h-6 text-amber-400" />
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                कारीगर हिसाब-किताब (Job-Work Settlements)
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-stone-300">
              पारदर्शी, द्विपक्षीय पुष्टि-आधारित मजदूरी एवं घटत हिसाब (Dual-confirmed explainable passbook settlements)
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-amber-800/50 border border-amber-500/30 rounded-xl px-3.5 py-2 text-right">
              <span className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider block">
                24K बुलियन दर (Bullion Rate)
              </span>
              <span className="text-sm sm:text-base font-extrabold text-white">
                ₹ {currentRate.toLocaleString('en-IN')}/g
              </span>
            </div>

            {isJeweller && (
              <>
                <button
                  type="button"
                  onClick={() => setShowAgingReport(!showAgingReport)}
                  className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm border transition-all ${
                    showAgingReport
                      ? 'bg-amber-400 text-stone-950 border-amber-300 shadow-md'
                      : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>उगाही विश्लेषण (Aging Report)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-950 font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all active:scale-95"
                >
                  <PlusCircle className="w-4 h-4 text-stone-950" />
                  <span>नया हिसाब बनाएं (New Settlement)</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Aggregate Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-white/10 text-xs">
          <div>
            <span className="text-stone-400 block text-[11px]">कुल हिसाब (Total)</span>
            <span className="text-lg font-bold text-white">{settlements.length}</span>
          </div>
          <div>
            <span className="text-amber-300 block text-[11px]">स्वीकृति प्रतीक्षित (Awaiting)</span>
            <span className="text-lg font-bold text-amber-300">{awaitingCount}</span>
          </div>
          <div>
            <span className="text-rose-400 block text-[11px]">आपत्तियां (Disputed)</span>
            <span className="text-lg font-bold text-rose-400">{disputedCount}</span>
          </div>
          <div>
            <span className="text-emerald-400 block text-[11px]">चुकता राशि (Total Settled)</span>
            <span className="text-lg font-bold text-emerald-400">₹ {totalPaidAmount.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      {/* Jeweller Aging Report Panel */}
      {isJeweller && showAgingReport && (
        <div className="bg-white rounded-2xl border border-amber-300/80 shadow-md p-5 space-y-4 animate-in fade-in-50 duration-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-3">
            <div>
              <h3 className="font-bold text-base sm:text-lg text-stone-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-700" />
                <span>बकाया हिसाब उगाही बही (Outstanding Settlements Aging Report)</span>
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                समय अवधि अनुसार लंबित देनदारी एवं कारीगर बकाया (0-7 / 8-15 / 16-30 / &gt;30 दिन)
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 text-right">
                <span className="text-[10px] text-stone-500 uppercase font-semibold block">कुल बकाया (Outstanding)</span>
                <span className="text-sm sm:text-base font-extrabold text-amber-950">
                  ₹ {(agingReport?.total_outstanding_amount || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => refetchAging()}
                className="p-2 text-stone-500 hover:text-stone-900 rounded-lg hover:bg-stone-100"
                title="Refresh Aging Report"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Simple Clean Aging Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-chip text-ink border-b border-border uppercase font-bold text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">समय अवधि (Age Bucket)</th>
                  <th className="py-2.5 px-3">वर्णन (Description)</th>
                  <th className="py-2.5 px-3 text-center">लंबित बिल (Count)</th>
                  <th className="py-2.5 px-3 text-right">बकाया राशि (Outstanding)</th>
                  <th className="py-2.5 px-3 text-right">हिस्सा (% Share)</th>
                  <th className="py-2.5 px-3 text-center">कार्रवाई (Action)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {(['0-7', '8-15', '16-30', '>30'] as const).map((bKey) => {
                  const bucket = agingReport?.buckets[bKey];
                  const count = bucket?.count || 0;
                  const amt = bucket?.total_amount || 0;
                  const totalAmt = agingReport?.total_outstanding_amount || 1;
                  const pct = totalAmt > 0 ? ((amt / totalAmt) * 100).toFixed(1) : '0.0';

                  const badgeColors = {
                    '0-7': 'bg-emerald-100 text-emerald-800 border-emerald-300',
                    '8-15': 'bg-blue-100 text-blue-800 border-blue-300',
                    '16-30': 'bg-amber-100 text-amber-800 border-amber-300',
                    '>30': 'bg-rose-100 text-rose-800 border-rose-300'
                  }[bKey];

                  const isSelected = selectedAgingBucket === bKey;

                  return (
                    <tr
                      key={bKey}
                      className={`hover:bg-amber-50/40 transition-colors ${isSelected ? 'bg-amber-50/60 font-semibold' : ''}`}
                    >
                      <td className="py-3 px-3">
                        <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-bold border ${badgeColors}`}>
                          {bucket?.label || bKey}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-stone-600 font-medium">
                        {bucket?.label_hi || bKey}
                      </td>
                      <td className="py-3 px-3 text-center font-bold font-mono">
                        {count}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-stone-900 font-mono">
                        ₹ {amt.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-3 text-right text-stone-500 font-mono">
                        {pct}%
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedAgingBucket(isSelected ? 'ALL' : bKey)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-amber-900 bg-amber-100/70 hover:bg-amber-200/70 rounded border border-amber-300 transition-colors"
                        >
                          {isSelected ? 'छुपाएं (Hide)' : `देखें (${count})`}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Drill-down settlements in selected bucket */}
          {selectedAgingBucket !== 'ALL' && agingReport && (
            <div className="mt-4 p-4 bg-card border border-border rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs text-stone-800">
                  {agingReport.buckets[selectedAgingBucket].label} ({agingReport.buckets[selectedAgingBucket].label_hi}) की प्रविष्टियां:
                </h4>
                <button
                  onClick={() => setSelectedAgingBucket('ALL')}
                  className="text-xs text-stone-500 hover:text-stone-800 font-medium"
                >
                  ✕ बंद करें
                </button>
              </div>

              {agingReport.buckets[selectedAgingBucket].settlements.length === 0 ? (
                <p className="text-xs text-stone-500 italic">इस समय अवधि में कोई बकाया बिल नहीं है।</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[10px] uppercase font-bold text-stone-500 border-b border-stone-200">
                      <tr>
                        <th className="py-2 px-2 text-left">हिसाब #</th>
                        <th className="py-2 px-2 text-left">कारीगर</th>
                        <th className="py-2 px-2 text-center">लंबित दिन</th>
                        <th className="py-2 px-2 text-right">देय राशि</th>
                        <th className="py-2 px-2 text-center">स्थिति</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200/60">
                      {agingReport.buckets[selectedAgingBucket].settlements.map((s) => (
                        <tr key={s.id} className="hover:bg-white/80">
                          <td className="py-2 px-2 font-mono font-bold text-stone-900">{s.settlement_number}</td>
                          <td className="py-2 px-2 text-stone-700">{s.karigar_name || 'Ramesh Soni'}</td>
                          <td className="py-2 px-2 text-center font-mono font-bold text-amber-900">{s.age_days} दिन</td>
                          <td className="py-2 px-2 text-right font-mono font-bold text-stone-900">₹ {s.net_payable.toLocaleString('en-IN')}</td>
                          <td className="py-2 px-2 text-center">
                            <span className="px-2 py-0.5 text-[10px] rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-semibold">
                              {s.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filter and Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-stone-200">
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          <Filter className="w-3.5 h-3.5 text-stone-400 mr-1" />
          {['ALL', 'AWAITING_KARIGAR', 'PAID', 'DISPUTED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                statusFilter === st
                  ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {st === 'ALL' && 'सभी (All)'}
              {st === 'AWAITING_KARIGAR' && 'प्रतीक्षित (Awaiting)'}
              {st === 'PAID' && 'चुकता (Paid)'}
              {st === 'DISPUTED' && 'आपत्ति (Disputed)'}
            </button>
          ))}
        </div>

        <button
          onClick={() => refetch()}
          className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900 px-2 py-1 rounded"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>रिफ्रेश</span>
        </button>
      </div>

      {/* Settlements List */}
      {isLoading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-stone-200 text-stone-500 text-xs">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-600 mb-2" />
          <span>हिसाब-किताब लोड हो रहा है...</span>
        </div>
      ) : settlements.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-stone-200 text-stone-500">
          <Receipt className="w-8 h-8 text-stone-300 mx-auto mb-2" />
          <p className="font-semibold text-stone-800 text-sm">कोई हिसाब उपलब्ध नहीं है</p>
          <p className="text-xs text-stone-500 mt-0.5">
            {isJeweller
              ? 'कारीगर के लिए नया हिसाब बनाने के लिए "नया हिसाब बनाएं" बटन दबाएं।'
              : 'अभी आपके खाते में कोई सक्रिय हिसाब लंबित नहीं है।'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {settlements.map((settlement) => (
            <SettlementCard
              key={settlement.id}
              settlement={settlement}
              currentUser={user}
              onApprove={async (id, notes) => {
                await approveMutation.mutateAsync({ id, notes });
              }}
              onDispute={async (id, reason) => {
                await disputeMutation.mutateAsync({ id, dispute_reason: reason });
              }}
              onMarkPaid={async (id, paymentMethod, reference, notes) => {
                await payMutation.mutateAsync({ id, paymentMethod, reference, notes });
              }}
              isApproving={approveMutation.isPending}
              isDisputing={disputeMutation.isPending}
              isPaying={payMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Generate Settlement Modal (Jeweller Only) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-stone-300 shadow-2xl overflow-hidden my-8">
            <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-900 to-stone-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-amber-400" />
                  <span>नया हिसाब प्रस्ताव (Propose Settlement)</span>
                </h3>
                <p className="text-xs text-stone-300 mt-0.5">
                  सोना वापसी, मजदूरी एवं घटत का पारदर्शी बिल तैयार करें
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 text-stone-300 hover:text-white rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-4 sm:p-6 space-y-4">
              {/* Karigar Selection */}
              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1">
                  कारीगर चुनें (Select Karigar) *
                </label>
                <select
                  required
                  value={targetKarigarId}
                  onChange={(e) => setTargetKarigarId(e.target.value)}
                  className="w-full text-xs p-2.5 border border-stone-300 rounded-lg bg-stone-50 font-medium text-stone-900 focus:bg-white focus:outline-amber-600"
                >
                  {karigars.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name} ({k.businessName || 'Master Goldsmith'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Optional Order Link */}
              {availableOrders.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-stone-800 mb-1">
                    आर्डर से जोड़ें (Link to Occasion Order - Optional)
                  </label>
                  <select
                    value={linkedOrderId}
                    onChange={(e) => setLinkedOrderId(e.target.value)}
                    className="w-full text-xs p-2.5 border border-stone-300 rounded-lg bg-stone-50 text-stone-900"
                  >
                    <option value="">-- कोई आर्डर नहीं (No Order Linked) --</option>
                    {availableOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        #{o.order_number} • {o.customer_name_encrypted} ({o.occasion_type})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Weights and Rates Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-800 mb-1">
                    जारी सोना (Issued Gold) [g] *
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    required
                    value={issuedGrams}
                    onChange={(e) => setIssuedGrams(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs p-2 border border-stone-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800 mb-1">
                    वापसी सोना (Returned Gold) [g] *
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    required
                    value={returnedGrams}
                    onChange={(e) => setReturnedGrams(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs p-2 border border-stone-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800 mb-1">
                    तय घटत (Agreed Wastage %) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    required
                    value={agreedWastagePct}
                    onChange={(e) => setAgreedWastagePct(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs p-2 border border-stone-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800 mb-1">
                    मजदूरी दर (Making Rate) [₹/g] *
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    required
                    value={makingChargePerGram}
                    onChange={(e) => setMakingChargePerGram(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs p-2 border border-stone-300 rounded-lg font-mono"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-stone-800 mb-1">
                    पूर्व में दी गई पेशगी (Advances Paid) [₹]
                  </label>
                  <input
                    type="number"
                    step="100"
                    min="0"
                    value={advances}
                    onChange={(e) => setAdvances(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs p-2 border border-stone-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              {/* Live Preview Box */}
              <div className="bg-card border border-border rounded-xl p-3.5 space-y-2 text-xs">
                <span className="font-bold text-ink flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                  <Sparkles className="w-3.5 h-3.5 text-brand" />
                  <span>तुरंत हिसाब पूर्वावलोकन (Live Settlement Preview @ ₹{currentRate.toLocaleString('en-IN')}/g)</span>
                </span>

                <div className="grid grid-cols-2 gap-2 text-ink pt-1">
                  <div>
                    अनुमत घटत: <span className="font-mono font-bold">{livePreview.allowed_wastage_grams.toFixed(3)}g</span>
                  </div>
                  <div>
                    वास्तविक घटत: <span className="font-mono font-bold">{livePreview.actual_wastage_grams.toFixed(3)}g</span>
                  </div>
                  <div>
                    अतिरिक्त कटौती: <span className="font-mono font-bold text-danger">₹{livePreview.wastage_adjustment.toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    मजदूरी कुल: <span className="font-mono font-bold text-ink">₹{livePreview.making_charges.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-border flex items-center justify-between font-bold text-ink text-sm">
                  <span>अंतिम देय राशि (Net Payable):</span>
                  <span className="font-mono text-base font-black text-brand">
                    ₹{livePreview.net_payable.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-muted hover:bg-chip border border-border rounded-lg"
                >
                  रद्द करें (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-5 py-2 text-xs font-bold text-white bg-brand hover:bg-brand-light rounded-lg shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>
                    {createMutation.isPending ? 'तैयार कर रहे हैं...' : 'हिसाब प्रस्ताव भेजें (Propose Settlement)'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
