import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Link,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Flame,
  ArrowUpRight,
  ArrowDownLeft,
  Copy,
  Check,
  Camera,
  MapPin,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Bug,
  RotateCcw,
  Receipt,
  CreditCard,
  AlertOctagon
} from 'lucide-react';
import {
  LedgerEntry,
  GoldLedgerEntry,
  LedgerHistoryFilter,
  PaginatedResult,
  ChainVerificationResult,
  Party,
  User,
  Role
} from '../../shared/types.js';
import { ConfirmationModal } from './ConfirmationModal.js';
import { RaiseDisputeModal } from './RaiseDisputeModal.js';
import { useToast } from './Toast.js';
import { useTranslation } from '../i18n/LanguageContext.js';

interface LedgerViewProps {
  karigars: (Party | User)[];
  currentParty: Party | User;
  selectedKarigarId?: string;
  onSelectKarigar?: (id: string) => void;
}

export const LedgerView: React.FC<LedgerViewProps> = ({
  karigars,
  currentParty,
  selectedKarigarId,
  onSelectKarigar
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ISSUE' | 'RETURN' | 'WASTAGE' | 'ADJUSTMENT'>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [selectedEntryForReview, setSelectedEntryForReview] = useState<GoldLedgerEntry | null>(null);
  const [disputeTargetEntry, setDisputeTargetEntry] = useState<GoldLedgerEntry | null>(null);

  // 1. Fetch Paginated Ledger History
  const { data: historyRes, isLoading, refetch } = useQuery<PaginatedResult<GoldLedgerEntry>>({
    queryKey: ['ledgerHistory', selectedKarigarId, activeFilter, statusFilter, searchTerm, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedKarigarId) params.append('karigar_id', selectedKarigarId);
      if (activeFilter !== 'ALL') params.append('transaction_type', activeFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (searchTerm) params.append('search', searchTerm);
      params.append('page', currentPage.toString());
      params.append('limit', '8');
      params.append('sort_order', 'DESC');

      const res = await fetch(`/api/ledger/history?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load ledger history');
      return res.json();
    }
  });

  // 2. Fetch Cryptographic Hash Chain Verification
  const { data: verificationRes, isLoading: isVerifying, refetch: verifyChain } = useQuery<{
    success: boolean;
    data: ChainVerificationResult;
  }>({
    queryKey: ['chainVerification'],
    queryFn: async () => {
      const res = await fetch('/api/ledger/verify-chain', { method: 'POST' });
      if (!res.ok) throw new Error('Verification failed');
      return res.json();
    }
  });

  // 3. Simulate Tamper Mutation (Audit Test Feature)
  const tamperMutation = useMutation({
    mutationFn: async ({ seq, weight }: { seq: number; weight: number }) => {
      const res = await fetch('/api/ledger/simulate-tamper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequenceNumber: seq, weightGrams: weight })
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast.warning(
        'Simulated Tamper Applied',
        `Block #${data.tamperedBlock?.sequence_number} weight changed to 999.99g. Verifying chain...`
      );
      queryClient.invalidateQueries({ queryKey: ['ledgerHistory'] });
      queryClient.invalidateQueries({ queryKey: ['chainVerification'] });
    }
  });

  // 4. Reset Tamper Mutation
  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ledger/reset-chain', { method: 'POST' });
      return res.json();
    },
    onSuccess: () => {
      toast.success('Chain Restored', 'Ledger chain restored to verified genuine state.');
      queryClient.invalidateQueries({ queryKey: ['ledgerHistory'] });
      queryClient.invalidateQueries({ queryKey: ['chainVerification'] });
    }
  });

  const copyToClipboard = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const chain = verificationRes?.data;
  const isChainValid = chain?.isValid ?? true;

  return (
    <div className="flex flex-col gap-5">
      {/* Cryptographic Chain Integrity Banner */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border transition-all ${
          isChainValid
            ? 'bg-success-bg border-success/30 text-success'
            : 'bg-danger-bg border-danger/50 text-danger'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isChainValid ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
              }`}
            >
              {isChainValid ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-headline-sm text-base sm:text-lg font-bold">
                  {isChainValid ? t('status.chainVerifiedTitle') : t('status.chainTamperTitle')}
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isChainValid ? 'bg-success text-white' : 'bg-danger text-white animate-pulse'
                  }`}
                >
                  {isChainValid ? t('status.chainIntact') : t('status.chainCompromised')}
                </span>
              </div>
              <p className="text-xs opacity-90 mt-0.5">
                {isChainValid
                  ? `All ${chain?.totalBlocks || 0} blocks validated. Linked to Genesis hash: ${chain?.genesisHash.slice(
                      0,
                      8
                    )}...`
                  : `Tamper pinpointed at Block #${chain?.tamperedBlock?.sequence_number}: ${chain?.tamperedBlock?.reason}`}
              </p>
            </div>
          </div>

          {/* Audit Verification & Demo Controls */}
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              onClick={() => verifyChain()}
              disabled={isVerifying}
              className="h-9 px-3 bg-white hover:bg-chip text-ink text-xs font-label-md font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors border border-border"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
              <span>{t('status.verifyingChain')}</span>
            </button>

            {isChainValid ? (
              <button
                onClick={() => tamperMutation.mutate({ seq: 2, weight: 999.99 })}
                disabled={tamperMutation.isPending}
                className="h-9 px-3 bg-chip hover:bg-danger-bg hover:text-danger text-ink text-xs font-label-md font-bold rounded-lg transition-colors flex items-center gap-1"
                title="Simulate illegal modification to test chain verification detection"
              >
                <Bug className="w-3.5 h-3.5" />
                <span>Simulate Tamper</span>
              </button>
            ) : (
              <button
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="h-9 px-3 bg-success text-white hover:bg-success/90 text-xs font-label-md font-bold rounded-lg transition-colors flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore Chain</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Karigar Switcher Pill */}
          {onSelectKarigar && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => onSelectKarigar('')}
                className={`h-9 px-3 rounded-full text-xs font-label-md font-bold transition-all shrink-0 ${
                  !selectedKarigarId
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                }`}
              >
                All Karigars
              </button>
              {karigars.map((k) => (
                <button
                  key={k.id}
                  onClick={() => onSelectKarigar(k.id)}
                  className={`h-9 px-3 rounded-full text-xs font-label-md font-bold transition-all shrink-0 ${
                    selectedKarigarId === k.id
                      ? 'bg-primary text-on-primary shadow-xs'
                      : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                  }`}
                >
                  {k.name.split(' ')[0]} ({k.businessName?.split('•')[0].trim() || 'Bench'})
                </button>
              ))}
            </div>
          )}

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Search hash, order #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-xs bg-surface-container-low rounded-xl border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface"
            />
          </div>
        </div>

        {/* Transaction Type Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pt-1">
          {[
            { id: 'ALL', label: 'All Transactions' },
            { id: 'ISSUE', label: 'Gold Given' },
            { id: 'RETURN', label: 'Gold Returned' },
            { id: 'WASTAGE', label: 'Wastage' },
            { id: 'ADJUSTMENT', label: 'Payment' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveFilter(tab.id as any);
                setCurrentPage(1);
              }}
              className={`h-8 px-3 rounded-lg text-xs font-label-md font-semibold transition-all shrink-0 ${
                activeFilter === tab.id
                  ? 'bg-on-surface text-surface shadow-xs'
                  : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
              }`}
            >
              {tab.label}
            </button>
          ))}

          {/* Status selector */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="h-8 px-2 text-xs bg-surface-container-low rounded-lg border border-outline-variant/50 text-on-surface font-label-md ml-auto"
          >
            <option value="ALL">All Statuses</option>
            <option value="CONFIRMED">Confirmed Only</option>
            <option value="PENDING_CONFIRMATION">Pending Confirmation</option>
            <option value="REVIEW_REQUIRED">Review Required</option>
            <option value="DISPUTED">Disputed</option>
            <option value="ESCALATED">Escalated (24h+)</option>
          </select>
        </div>
      </div>

      {/* Transaction Blocks List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="p-12 text-center text-on-surface-variant bg-surface-container-lowest rounded-2xl border border-outline-variant/30">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
            <p className="font-label-md text-sm">Loading ledger blockchain entries...</p>
          </div>
        ) : historyRes?.data?.length === 0 ? (
          <div className="p-12 text-center text-on-surface-variant bg-surface-container-lowest rounded-2xl border border-outline-variant/30">
            <p className="font-headline-sm text-base text-on-surface mb-1">No transactions found</p>
            <p className="text-xs">No gold entries match the selected filters.</p>
          </div>
        ) : (
          historyRes?.data.map((entry) => {
            const isConfirmed = entry.status === 'CONFIRMED';
            const isPending = entry.status === 'PENDING_CONFIRMATION';
            const isDisputed = entry.status === 'DISPUTED';
            const isEscalated = entry.status === 'ESCALATED';

            return (
              <div
                key={entry.id}
                className="group bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-xs border border-outline-variant/30 hover:border-primary/50 transition-all relative overflow-hidden"
              >
                {/* Visual Blockchain Hash Link Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-3 border-b border-outline-variant/20 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="font-bold font-sans text-xs px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface">
                      Block #{entry.sequence_number}
                    </span>
                    <span className="text-on-surface-variant">•</span>
                    <span className="text-on-surface-variant font-sans">
                      {new Date(entry.timestamp).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-on-surface-variant font-sans">Hash:</span>
                    <span className="text-primary font-bold">{entry.transaction_hash.slice(0, 10)}...</span>
                    <button
                      onClick={() => copyToClipboard(entry.transaction_hash)}
                      className="p-1 hover:bg-surface-container rounded text-on-surface-variant transition-colors"
                      title="Copy full SHA-256 hash"
                    >
                      {copiedHash === entry.transaction_hash ? (
                        <Check className="w-3.5 h-3.5 text-success" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Main Block Content */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left: Transaction Type & Details */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${
                        entry.transaction_type === 'ISSUE'
                          ? 'bg-secondary-fixed text-on-secondary-fixed'
                          : entry.transaction_type === 'RETURN'
                          ? 'bg-primary-fixed text-on-primary-fixed'
                          : entry.transaction_type === 'ADJUSTMENT'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-surface-container-high text-primary'
                      }`}
                    >
                      {entry.transaction_type === 'ISSUE' ? (
                        <ArrowUpRight className="w-6 h-6" />
                      ) : entry.transaction_type === 'RETURN' ? (
                        <ArrowDownLeft className="w-6 h-6" />
                      ) : entry.transaction_type === 'ADJUSTMENT' ? (
                        <Receipt className="w-6 h-6" />
                      ) : (
                        <Flame className="w-6 h-6" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-headline-sm text-base font-bold text-on-surface">
                          {entry.transaction_type === 'ISSUE'
                            ? 'Gold Issued'
                            : entry.transaction_type === 'RETURN'
                            ? 'Gold Returned'
                            : entry.transaction_type === 'ADJUSTMENT'
                            ? 'Payment Adjustment'
                            : 'Wastage Settled'}
                        </h4>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-surface-container font-label-md font-bold text-on-surface">
                          {entry.purity_karat}K
                        </span>
                        {entry.transaction_type === 'ADJUSTMENT' && entry.metadata?.payment_method && (
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                            {entry.metadata.payment_method}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {entry.order_id ? (
                          <span className="font-semibold text-on-surface">{entry.order_id} • </span>
                        ) : null}
                        <span>{(entry.metadata?.itemDescription as string) || (entry.metadata?.notes as string) || 'Jewellery job-work transfer'}</span>
                      </p>

                      {/* Photo evidence and GPS indicators */}
                      <div className="flex items-center gap-3 text-[11px] text-on-surface-variant mt-2">
                        {entry.photo_evidence_url && (
                          <span className="flex items-center gap-1 text-primary">
                            <Camera className="w-3.5 h-3.5" />
                            <span>Photo Verified</span>
                          </span>
                        )}
                        {entry.gps_lat && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            <span>GPS Tagged</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Weight Metrics & Status */}
                  <div className="flex flex-row sm:flex-col items-baseline sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-outline-variant/20">
                    {entry.transaction_type === 'ADJUSTMENT' && entry.metadata?.net_payable !== undefined ? (
                      <div className="flex flex-col items-end">
                        <div className="flex items-baseline gap-0.5 text-emerald-700 font-extrabold text-xl">
                          <span>₹</span>
                          <span>{Number(entry.metadata.net_payable).toLocaleString('en-IN')}</span>
                        </div>
                        <span className="text-[11px] text-on-surface-variant font-mono">
                          Eq: {Number(entry.weight_grams).toFixed(3)}g @ ₹{entry.metadata.gold_rate || 7420}/g
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span
                          className={`font-metric-display text-2xl font-extrabold tabular-nums ${
                            entry.transaction_type === 'ISSUE' ? 'text-primary' : 'text-secondary'
                          }`}
                        >
                          {entry.transaction_type === 'ISSUE' ? '+' : '-'}
                          {Number(entry.weight_grams).toFixed(3)}
                        </span>
                        <span className="text-xs font-bold text-on-surface-variant">g</span>
                      </div>
                    )}

                    <span className="text-[11px] text-on-surface-variant">
                      Fine 24K: <strong>{Number(entry.pure_weight_grams).toFixed(3)} g</strong>
                    </span>

                    {/* Status Pill */}
                    <div className="mt-2">
                      {isConfirmed && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-success-bg text-success border border-success/30">
                          <CheckCircle2 className="w-3 h-3 text-success" />
                          <span>{t('common.verified')}</span>
                        </span>
                      )}
                      {isPending && (
                        <button
                          onClick={() => setSelectedEntryForReview(entry)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-warn-bg text-warn border border-warn/30 hover:bg-warn/20 transition-all shadow-xs"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-warn animate-pulse" />
                          <Clock className="w-3 h-3 text-warn" />
                          <span>Review & Sign</span>
                        </button>
                      )}
                      {entry.status === 'REVIEW_REQUIRED' && (
                        <button
                          onClick={() => setSelectedEntryForReview(entry)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-warn-bg text-warn border border-warn/40 transition-all shadow-xs animate-pulse"
                          title="Wastage exceeds agreed rate + 2%. Requires Jeweller review."
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-warn" />
                          <AlertTriangle className="w-3 h-3 text-warn" />
                          <span>Review Excess Wastage</span>
                        </button>
                      )}
                      {isDisputed && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-danger-bg text-danger border border-danger/30">
                          <AlertTriangle className="w-3 h-3 text-danger" />
                          <span>Disputed</span>
                        </span>
                      )}
                      {isEscalated && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-danger-bg text-danger border border-danger/30">
                          <span>24h Escalated</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Smart Wastage Variance Details */}
                {entry.metadata?.wastageVariance && (
                  <div className="mt-3 pt-2.5 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-muted text-[11px] uppercase tracking-wider flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-brand" />
                        <span>Wastage Agreement:</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-chip text-ink font-semibold text-[11px] border border-border">
                        Agreed: <strong>{entry.metadata.agreedWastagePct}%</strong>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-chip text-ink font-semibold text-[11px] border border-border">
                        Actual Loss: <strong className={entry.metadata.exceedsAllowedWastage ? 'text-danger' : 'text-brand'}>
                          {entry.metadata.actualWastagePct}% ({entry.metadata.wastageVariance.actual_wastage_grams}g)
                        </strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 font-bold text-[11px]">
                      <span className="text-muted">Variance:</span>
                      <span
                        className={`px-2 py-0.5 rounded ${
                          entry.metadata.exceedsAllowedWastage
                            ? 'bg-danger-bg text-danger border border-danger/30'
                            : 'bg-success-bg text-success border border-success/30'
                        }`}
                      >
                        {Number(entry.metadata.varianceGrams) >= 0 ? '+' : ''}{entry.metadata.varianceGrams}g ({Number(entry.metadata.variancePct) >= 0 ? '+' : ''}{entry.metadata.variancePct}%)
                      </span>
                    </div>
                  </div>
                )}

                {/* Settlement Payment Details */}
                {entry.transaction_type === 'ADJUSTMENT' && entry.metadata?.settlement_number && (
                  <div className="mt-3 pt-2.5 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-emerald-800 text-[11px] uppercase tracking-wider flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Settlement #{entry.metadata.settlement_number}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface font-semibold text-[11px]">
                        Method: <strong>{entry.metadata.payment_method || 'CASH'}</strong>
                      </span>
                      {entry.metadata.payment_reference && entry.metadata.payment_reference !== 'N/A' && (
                        <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface font-semibold text-[11px]">
                          Ref: <strong className="font-mono">{entry.metadata.payment_reference}</strong>
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Passbook Adjusted & Settled
                    </div>
                  </div>
                )}

                {/* Inspect & Dispute Links */}
                <div className="mt-3 pt-2 border-t border-outline-variant/15 flex items-center justify-between text-xs">
                  <span className="font-mono text-[10px] text-on-surface-variant truncate max-w-[200px]">
                    Prev Hash: {entry.previous_hash.slice(0, 16)}...
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setDisputeTargetEntry(entry)}
                      className="text-rose-700 hover:text-rose-900 font-semibold flex items-center gap-1 hover:underline"
                    >
                      <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                      <span>Raise Dispute</span>
                    </button>
                    <button
                      onClick={() => setSelectedEntryForReview(entry)}
                      className="text-primary font-bold hover:underline flex items-center gap-1"
                    >
                      <span>Inspect Evidence & Signatures</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls */}
      {historyRes?.pagination && historyRes.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/30 text-xs font-label-md">
          <span className="text-on-surface-variant">
            Page <strong>{historyRes.pagination.page}</strong> of{' '}
            <strong>{historyRes.pagination.totalPages}</strong> ({historyRes.pagination.total} records)
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={!historyRes.pagination.hasPrevPage}
              className="h-8 px-3 rounded-lg bg-surface-container-high text-on-surface disabled:opacity-40 flex items-center gap-1 font-bold"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <button
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={!historyRes.pagination.hasNextPage}
              className="h-8 px-3 rounded-lg bg-surface-container-high text-on-surface disabled:opacity-40 flex items-center gap-1 font-bold"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Dual Confirmation & Inspection Modal */}
      {selectedEntryForReview && (
        <ConfirmationModal
          entry={selectedEntryForReview}
          currentParty={currentParty}
          onClose={() => setSelectedEntryForReview(null)}
          onSuccess={() => {
            setSelectedEntryForReview(null);
            refetch();
          }}
        />
      )}

      {/* Raise Dispute Modal */}
      {disputeTargetEntry && (
        <RaiseDisputeModal
          targetType="LEDGER_ENTRY"
          targetId={disputeTargetEntry.id}
          targetReference={`Block #${disputeTargetEntry.sequence_number}`}
          onClose={() => setDisputeTargetEntry(null)}
          onSuccess={() => {
            setDisputeTargetEntry(null);
            refetch();
          }}
        />
      )}
    </div>
  );
};

