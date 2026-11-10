import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  CheckCircle,
  AlertOctagon,
  Clock,
  MapPin,
  ShieldCheck,
  Scale,
  Sparkles,
  Camera,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import {
  LedgerEntry,
  GoldLedgerEntry,
  Party,
  User,
  ConfirmLedgerRequest,
  ConfirmTransactionResponse
} from '../../shared/types.js';
import { SignaturePad } from './SignaturePad.js';
import { useToast } from './Toast.js';
import { RaiseDisputeModal } from './RaiseDisputeModal.js';

interface ConfirmationModalProps {
  entry: LedgerEntry;
  currentParty: Party | User;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  entry,
  currentParty,
  onClose,
  onSuccess
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [signature, setSignature] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [showDisputeInput, setShowDisputeInput] = useState(false);
  const [showFormalDisputeModal, setShowFormalDisputeModal] = useState(false);
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number; isExpired: boolean }>({
    hours: 24,
    minutes: 0,
    seconds: 0,
    isExpired: false
  });

  // Calculate remaining countdown time from 24h deadline
  useEffect(() => {
    const updateCountdown = () => {
      const deadline = new Date(entry.confirmation_deadline).getTime();
      const now = Date.now();
      const diff = deadline - now;

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isExpired: true });
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ hours, minutes, seconds, isExpired: false });
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [entry.confirmation_deadline]);

  const confirmMutation = useMutation({
    mutationFn: async (payload: ConfirmLedgerRequest) => {
      const res = await fetch('/api/ledger/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Confirmation failed');
      }
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(
        'Dual Confirmation Verified',
        `Block #${entry.sequence_number} is cryptographically locked on the chain.`
      );
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['ledgerHistory'] });
      queryClient.invalidateQueries({ queryKey: ['chainVerification'] });
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: any) => {
      toast.error('Action Failed', err.message);
    }
  });

  const handleConfirm = () => {
    if (!signature) {
      toast.error('Signature Required', 'Please provide your digital signature to confirm receipt.');
      return;
    }

    confirmMutation.mutate({
      ledger_id: entry.id,
      party: currentParty.role,
      signature,
      action: 'CONFIRM'
    });
  };

  const handleReject = () => {
    if (!disputeReason.trim()) {
      toast.error('Reason Required', 'Please provide a dispute reason explaining why the weight or terms differ.');
      return;
    }

    confirmMutation.mutate({
      ledger_id: entry.id,
      party: currentParty.role,
      signature: 'DISPUTED_REJECTED',
      action: 'REJECT',
      dispute_reason: disputeReason
    });
  };

  const isConfirmed = entry.status === 'CONFIRMED';
  const isDisputed = entry.status === 'DISPUTED';
  const isEscalated = entry.status === 'ESCALATED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/40 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-outline-variant/30 bg-surface-container-low shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-headline-sm text-lg font-bold text-on-surface">Dual Confirmation Review</h3>
                <span className="font-label-sm text-xs px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-bold">
                  Block #{entry.sequence_number}
                </span>
              </div>
              <p className="font-label-vernacular text-xs text-on-surface-variant">
                द्विपक्षीय सत्यापन एवं डिजिटल हस्ताक्षर
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* Status & 24h Countdown Strip */}
          <div
            className={`p-3.5 rounded-xl flex items-center justify-between text-xs border ${isConfirmed
                ? 'bg-success-bg border-success/30 text-success'
                : entry.status === 'REVIEW_REQUIRED'
                  ? 'bg-warn-bg border-warn/30 text-warn animate-pulse'
                  : isDisputed
                    ? 'bg-danger-bg border-danger/30 text-danger'
                    : isEscalated
                      ? 'bg-danger-bg border-danger text-danger'
                      : 'bg-warn-bg border-warn/30 text-warn'
              }`}
          >
            <div className="flex items-center gap-2 font-bold">
              {isConfirmed ? (
                <>
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span>Dual Signed & Confirmed (पूर्ण सत्यापित)</span>
                </>
              ) : entry.status === 'REVIEW_REQUIRED' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-warn animate-pulse" />
                  <AlertOctagon className="w-4 h-4 text-warn" />
                  <span>Excess Wastage Review Required (अति नुकसान समीक्षा आवश्यक)</span>
                </>
              ) : isDisputed ? (
                <>
                  <AlertOctagon className="w-4 h-4 text-danger" />
                  <span>Entry Disputed (विवादित प्रविष्टि)</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-warn animate-pulse" />
                  <Clock className="w-4 h-4 text-warn" />
                  <span>Awaiting Counterparty Signature (पुष्टि की प्रतीक्षा)</span>
                </>
              )}
            </div>

            {!isConfirmed && !isDisputed && (
              <div className="flex items-center gap-1 font-mono font-bold">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {timeLeft.isExpired
                    ? '24h EXPIRED (Escalated)'
                    : `${String(timeLeft.hours).padStart(2, '0')}:${String(timeLeft.minutes).padStart(2, '0')}:${String(
                      timeLeft.seconds
                    ).padStart(2, '0')} Left`}
                </span>
              </div>
            )}
          </div>

          {/* Wastage Variance Card in Modal */}
          {entry.metadata?.wastageVariance && (
            <div className="bg-warn-bg border border-warn/30 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-warn" />
                  <ShieldCheck className="w-4 h-4 text-warn" />
                  <span>Smart Wastage Analysis (नुकसान विश्लेषण)</span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${entry.metadata.exceedsAllowedWastage ? 'bg-danger text-white' : 'bg-success text-white'
                    }`}
                >
                  {entry.metadata.exceedsAllowedWastage ? 'Exceeds Agreed + 2%' : 'Within Agreement'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
                <div className="bg-card p-2 rounded-lg border border-border">
                  <span className="text-[10px] text-muted block">Agreed Rate</span>
                  <span className="font-bold text-ink">{entry.metadata.agreedWastagePct}%</span>
                </div>
                <div className="bg-card p-2 rounded-lg border border-border">
                  <span className="text-[10px] text-muted block">Actual Loss</span>
                  <span className="font-bold text-brand">
                    {entry.metadata.actualWastagePct}% ({entry.metadata.wastageVariance.actual_wastage_grams}g)
                  </span>
                </div>
                <div className="bg-card p-2 rounded-lg border border-border">
                  <span className="text-[10px] text-muted block">Allowed Loss</span>
                  <span className="font-bold text-ink">{entry.metadata.allowedWastageGrams}g</span>
                </div>
                <div className="bg-card p-2 rounded-lg border border-border">
                  <span className="text-[10px] text-muted block">Variance</span>
                  <span
                    className={`font-bold ${entry.metadata.exceedsAllowedWastage ? 'text-danger' : 'text-success'
                      }`}
                  >
                    {Number(entry.metadata.varianceGrams) >= 0 ? '+' : ''}{entry.metadata.varianceGrams}g ({Number(entry.metadata.variancePct) >= 0 ? '+' : ''}{entry.metadata.variancePct}%)
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Settlement Payment Voucher Card in Modal */}
          {entry.transaction_type === 'ADJUSTMENT' && entry.metadata?.settlement_number && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>Job-Work Settlement Voucher (हिसाब वाउचर)</span>
                </span>
                <span className="px-2 py-0.5 rounded font-bold text-[10px] uppercase bg-emerald-700 text-white">
                  Settlement #{entry.metadata.settlement_number}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
                <div className="bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/30">
                  <span className="text-[10px] text-secondary block">Net Paid</span>
                  <span className="font-bold text-emerald-700">₹{Number(entry.metadata.net_payable).toLocaleString('en-IN')}</span>
                </div>
                <div className="bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/30">
                  <span className="text-[10px] text-secondary block">Gold Rate Snapshot</span>
                  <span className="font-bold text-on-surface">₹{Number(entry.metadata.gold_rate || 7420).toLocaleString('en-IN')}/g</span>
                </div>
                <div className="bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/30">
                  <span className="text-[10px] text-secondary block">Payment Mode</span>
                  <span className="font-bold text-primary font-mono">{entry.metadata.payment_method || 'CASH'}</span>
                </div>
                <div className="bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/30">
                  <span className="text-[10px] text-secondary block">Reference / UTR</span>
                  <span className="font-bold text-on-surface font-mono truncate block" title={String(entry.metadata.payment_reference || 'N/A')}>
                    {String(entry.metadata.payment_reference || 'N/A')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Core Weight & Purity Grid */}
          <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/30 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-2">
              <span className="text-[10px] uppercase text-on-surface-variant font-bold block">Gross Weight</span>
              <span className="font-metric-display text-2xl font-extrabold text-on-surface tabular-nums">
                {Number(entry.weight_grams).toFixed(3)}
              </span>
              <span className="text-xs text-primary font-bold ml-0.5">g</span>
            </div>

            <div className="p-2">
              <span className="text-[10px] uppercase text-on-surface-variant font-bold block">Purity</span>
              <span className="font-headline-sm text-xl font-bold text-on-surface">
                {entry.purity_karat}K
              </span>
              <span className="text-[10px] text-on-surface-variant block">Hallmarked</span>
            </div>

            <div className="p-2">
              <span className="text-[10px] uppercase text-on-surface-variant font-bold block">Pure 24K Equiv.</span>
              <span className="font-metric-sub text-lg font-bold text-primary tabular-nums">
                {Number(entry.pure_weight_grams).toFixed(3)} g
              </span>
            </div>

            <div className="p-2">
              <span className="text-[10px] uppercase text-on-surface-variant font-bold block">Type</span>
              <span
                className={`inline-block mt-1 font-label-sm text-xs px-2 py-0.5 rounded font-bold ${entry.transaction_type === 'ISSUE'
                    ? 'bg-secondary-fixed text-on-secondary-fixed'
                    : entry.transaction_type === 'RETURN'
                      ? 'bg-primary-fixed text-on-primary-fixed'
                      : entry.transaction_type === 'ADJUSTMENT'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-surface-container-high text-primary'
                  }`}
              >
                {entry.transaction_type}
              </span>
            </div>
          </div>

          {/* Cryptographic Hash Chain Info */}
          <div className="bg-surface-container-lowest rounded-xl p-3 border border-outline-variant/30 text-xs space-y-1.5 font-mono">
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant font-sans font-bold">Transaction SHA-256 Hash:</span>
              <span className="text-primary truncate max-w-[280px]" title={entry.transaction_hash}>
                {entry.transaction_hash}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant font-sans font-bold">Previous Block Hash:</span>
              <span className="text-secondary truncate max-w-[280px]" title={entry.previous_hash}>
                {entry.previous_hash}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant font-sans font-bold">Timestamp:</span>
              <span className="text-on-surface">{new Date(entry.timestamp).toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Photo Evidence & Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-surface-container-low rounded-xl p-3 border border-outline-variant/30">
              <span className="font-label-sm text-xs font-bold text-on-surface flex items-center gap-1.5 mb-2">
                <Camera className="w-3.5 h-3.5 text-primary" />
                <span>Photo Evidence (फोटो साक्ष्य)</span>
              </span>
              {entry.photo_evidence_url ? (
                <div className="relative h-32 rounded-lg overflow-hidden bg-black/5">
                  <img src={entry.photo_evidence_url} alt="Photo Evidence" className="w-full h-full object-cover" />
                  {entry.perceptual_hash && (
                    <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-2 py-0.5 rounded-full font-mono">
                      dHash: {entry.perceptual_hash.slice(0, 10)}...
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-32 rounded-lg bg-surface-container flex items-center justify-center text-xs text-on-surface-variant">
                  No Photo Attached
                </div>
              )}
            </div>

            <div className="bg-surface-container-low rounded-xl p-3 border border-outline-variant/30 flex flex-col justify-between">
              <div>
                <span className="font-label-sm text-xs font-bold text-on-surface flex items-center gap-1.5 mb-2">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  <span>GPS Geolocation Tag</span>
                </span>
                {entry.gps_lat && entry.gps_lng ? (
                  <div className="space-y-1">
                    <p className="font-mono text-sm text-on-surface font-bold">
                      {Number(entry.gps_lat).toFixed(6)}° N, {Number(entry.gps_lng).toFixed(6)}° E
                    </p>
                    <p className="text-xs text-on-surface-variant">Captured at physical bullion handover counter</p>
                    <a
                      href={`https://www.google.com/maps?q=${entry.gps_lat},${entry.gps_lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                    >
                      <span>View on Google Maps</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-on-surface-variant">No GPS coordinates recorded</p>
                )}
              </div>

              {/* First Party Signature Preview */}
              <div className="pt-2 border-t border-outline-variant/30">
                <span className="text-[10px] uppercase font-bold text-on-surface-variant block">
                  Initiator Signature ({entry.initiated_by})
                </span>
                {entry.signature_jeweller || entry.signature_karigar ? (
                  <img
                    src={(entry.signature_jeweller || entry.signature_karigar)!}
                    alt="Initiator Signature"
                    className="h-10 max-w-[120px] object-contain mt-1 bg-surface-container-lowest rounded border border-outline-variant/40 p-1"
                  />
                ) : (
                  <span className="text-xs text-on-surface-variant">Not available</span>
                )}
              </div>
            </div>
          </div>

          {/* If already confirmed, display both signatures side by side */}
          {isConfirmed && (
            <div className="bg-card rounded-xl p-4 border border-border">
              <h4 className="font-label-md text-xs font-bold text-ink mb-3 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-success" />
                <span>Verified Dual Signatures (दोनों पक्षों के प्रमाणित हस्ताक्षर)</span>
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-chip p-2 rounded-lg border border-border text-center">
                  <span className="text-[10px] uppercase font-bold text-muted block mb-1">
                    Jeweller Signature
                  </span>
                  {entry.signature_jeweller ? (
                    <img src={entry.signature_jeweller} alt="Jeweller" className="h-12 mx-auto object-contain" />
                  ) : (
                    <span className="text-xs text-muted">Pending</span>
                  )}
                </div>

                <div className="bg-chip p-2 rounded-lg border border-border text-center">
                  <span className="text-[10px] uppercase font-bold text-muted block mb-1">
                    Karigar Signature
                  </span>
                  {entry.signature_karigar ? (
                    <img src={entry.signature_karigar} alt="Karigar" className="h-12 mx-auto object-contain" />
                  ) : (
                    <span className="text-xs text-muted">Pending</span>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-border flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowFormalDisputeModal(true)}
                  className="px-3 py-1.5 rounded-lg border border-danger/30 text-danger hover:bg-danger-bg text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <AlertOctagon className="w-3.5 h-3.5" />
                  <span>Raise Dispute (विवाद दर्ज करें)</span>
                </button>
              </div>
            </div>
          )}

          {/* If pending confirmation, show counterparty signature pad and actions */}
          {!isConfirmed && !isDisputed && (
            <div className="space-y-4 pt-2">
              {!showDisputeInput ? (
                <>
                  <div className="bg-card rounded-xl p-4 border border-border">
                    <SignaturePad
                      onSignatureChange={setSignature}
                      label={`Counterparty Signature (${currentParty.name})`}
                      sublabel="Sign to verify and accept custody of gold stated above"
                      signatoryName={currentParty.name}
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowFormalDisputeModal(true)}
                      className="h-12 flex-1 bg-white border border-danger text-danger hover:bg-danger-bg font-label-md text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                    >
                      <AlertOctagon className="w-4 h-4 text-danger" />
                      <span>Raise Dispute (विवाद दर्ज करें)</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleConfirm}
                      disabled={confirmMutation.isPending || !signature}
                      className="h-12 flex-[2] bg-brand hover:bg-brand-light text-white font-label-md text-sm font-bold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50"
                    >
                      {confirmMutation.isPending ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      <span>Confirm & Lock Ledger (पुष्टि करें)</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="bg-card rounded-xl p-4 border border-danger/30 space-y-3">
                  <h4 className="font-label-md text-xs font-bold text-danger flex items-center gap-1.5">
                    <AlertOctagon className="w-4 h-4" />
                    <span>State Reason for Dispute (विवाद का कारण दर्ज करें)</span>
                  </h4>
                  <textarea
                    rows={3}
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder="e.g. Weight displayed on digital scale differs by -0.450g; or karat tested below 22K..."
                    className="w-full bg-white rounded-xl p-3 text-sm text-ink border border-border focus:outline-none focus:ring-2 focus:ring-danger/40"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDisputeInput(false)}
                      className="px-4 py-2 text-xs font-bold text-muted hover:bg-chip rounded-lg"
                    >
                      Back (वापस)
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowFormalDisputeModal(true)}
                      className="px-4 py-2 bg-brand hover:bg-brand-light text-white text-xs font-bold rounded-lg shadow-sm"
                    >
                      Open Formal Dispute (औपचारिक विवाद)
                    </button>
                    <button
                      type="button"
                      onClick={handleReject}
                      disabled={confirmMutation.isPending || !disputeReason.trim()}
                      className="px-5 py-2.5 bg-danger hover:bg-danger/90 text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50"
                    >
                      {confirmMutation.isPending ? 'Submitting...' : 'Submit Dispute (अस्वीकार)'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Formal Dispute Modal Integration */}
      {showFormalDisputeModal && (
        <RaiseDisputeModal
          targetType="LEDGER_ENTRY"
          targetId={entry.id}
          targetReference={`Block #${entry.sequence_number}`}
          onClose={() => setShowFormalDisputeModal(false)}
          onSuccess={() => {
            setShowFormalDisputeModal(false);
            if (onSuccess) onSuccess();
            onClose();
          }}
        />
      )}
    </div>
  );
};

