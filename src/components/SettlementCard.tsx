import React, { useState } from 'react';
import {
  FileText,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Receipt,
  User,
  ArrowRight,
  Sparkles,
  Scale,
  DollarSign,
  AlertOctagon,
  Calendar,
  CreditCard
} from 'lucide-react';
import { Settlement, SettlementLineItem, Party, User as UserModel, PaymentMethod } from '../../shared/types.js';
import { RaiseDisputeModal } from './RaiseDisputeModal.js';

interface SettlementCardProps {
  settlement: Settlement;
  currentUser: UserModel | Party | null;
  onApprove: (id: string, notes?: string) => Promise<void>;
  onDispute: (id: string, reason: string) => Promise<void>;
  onMarkPaid?: (id: string, paymentMethod: PaymentMethod, reference?: string, notes?: string) => Promise<void>;
  isApproving?: boolean;
  isDisputing?: boolean;
  isPaying?: boolean;
}

export const SettlementCard: React.FC<SettlementCardProps> = ({
  settlement,
  currentUser,
  onApprove,
  onDispute,
  onMarkPaid,
  isApproving = false,
  isDisputing = false,
  isPaying = false
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [showDisputeInput, setShowDisputeInput] = useState<boolean>(false);
  const [showFormalDisputeModal, setShowFormalDisputeModal] = useState<boolean>(false);
  const [disputeReason, setDisputeReason] = useState<string>('');
  const [approvalNotes, setApprovalNotes] = useState<string>('');
  const [showApproveConfirm, setShowApproveConfirm] = useState<boolean>(false);
  const [showPayModal, setShowPayModal] = useState<boolean>(false);
  const [selectedPayMethod, setSelectedPayMethod] = useState<PaymentMethod>('UPI');
  const [payReference, setPayReference] = useState<string>('');
  const [payNotes, setPayNotes] = useState<string>('');

  const isKarigar = currentUser?.role === 'KARIGAR';
  const isJeweller = currentUser?.role === 'JEWELLER';

  const canApprove =
    (isKarigar && settlement.status === 'AWAITING_KARIGAR') ||
    (isJeweller && settlement.status === 'AWAITING_JEWELLER');

  const canDispute =
    settlement.status !== 'PAID' &&
    settlement.status !== 'DISPUTED' &&
    ((isKarigar && settlement.karigar_id === currentUser?.id) ||
      (isJeweller && settlement.jeweller_id === currentUser?.id));

  const formatCurrency = (amt: number) => {
    return `₹ ${Math.abs(amt).toLocaleString('en-IN')}`;
  };

  const getStatusBadge = () => {
    switch (settlement.status) {
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>चुकता (Paid & Settled)</span>
          </span>
        );
      case 'AWAITING_KARIGAR':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
            <span>कारीगर पुष्टि प्रतीक्षित (Awaiting Karigar)</span>
          </span>
        );
      case 'AWAITING_JEWELLER':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>ज्वैलर पुष्टि प्रतीक्षित (Awaiting Jeweller)</span>
          </span>
        );
      case 'DISPUTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">
            <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
            <span>आपत्ति दर्ज (Disputed)</span>
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-800 border border-stone-300">
            <Clock className="w-3.5 h-3.5 text-stone-600" />
            <span>प्रक्रियाधीन (Pending)</span>
          </span>
        );
    }
  };

  const handleDisputeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeReason.trim()) return;
    await onDispute(settlement.id, disputeReason.trim());
    setShowDisputeInput(false);
  };

  const handleApproveSubmit = async () => {
    await onApprove(settlement.id, approvalNotes.trim() || undefined);
    setShowApproveConfirm(false);
  };

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden mb-4">
      {/* Passbook Card Header */}
      <div className="p-4 sm:p-5 border-b border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-100/70 border border-amber-300 rounded-lg text-amber-900">
              <Receipt className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-stone-900 tracking-tight text-base sm:text-lg">
                  {settlement.settlement_number}
                </h3>
                {settlement.order_number && (
                  <span className="text-xs bg-stone-200/80 text-stone-700 font-medium px-2 py-0.5 rounded border border-stone-300">
                    आर्डर #{settlement.order_number}
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                <Calendar className="w-3.5 h-3.5" />
                दिनांक (Date): {new Date(settlement.created_at).toLocaleDateString('hi-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                })}
              </p>
            </div>
          </div>
          <div>{getStatusBadge()}</div>
        </div>

        {/* Counterparties & Rate Snapshot Info */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 text-xs text-stone-600 mt-2 bg-white/70 p-2.5 rounded-lg border border-amber-200/50">
          <div className="flex flex-wrap items-center gap-y-1 gap-x-3">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-stone-800">ज्वैलर:</span>
              <span className="text-stone-700">{settlement.jeweller_name || 'Lalit Soni'}</span>
            </div>
            <ArrowRight className="w-3 h-3 text-stone-400 hidden sm:inline" />
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-stone-800">कारीगर:</span>
              <span className="text-stone-700">{settlement.karigar_name || 'Ramesh Soni'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] bg-amber-50 text-amber-900 border border-amber-300 font-medium px-2 py-0.5 rounded-md">
              दर (Rate Snapshot): ₹{(settlement.gold_rate || 7420).toLocaleString('en-IN')}/g
            </span>
            {settlement.payment_method && (
              <span className="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                <CreditCard className="w-3 h-3" />
                <span>{settlement.payment_method}</span>
                {settlement.payment_reference && <span className="font-mono text-[10px]">({settlement.payment_reference})</span>}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Primary Financial Numbers */}
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-white p-3 rounded-lg border border-stone-200 shadow-2xs">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block">
              मजदूरी (Making)
            </span>
            <span className="text-sm sm:text-base font-bold text-stone-800">
              {formatCurrency(settlement.making_charges)}
            </span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-stone-200 shadow-2xs">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block">
              कटौती (Deductions)
            </span>
            <span className={`text-sm sm:text-base font-bold ${
              settlement.wastage_adjustment > 0 || settlement.shortage_penalty > 0
                ? 'text-rose-600'
                : 'text-stone-600'
            }`}>
              {formatCurrency(settlement.wastage_adjustment + settlement.shortage_penalty)}
            </span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-stone-200 shadow-2xs">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block">
              पेशगी (Advances)
            </span>
            <span className="text-sm sm:text-base font-bold text-amber-700">
              {formatCurrency(settlement.advances)}
            </span>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-amber-100/70 p-3 rounded-lg border border-amber-300 shadow-2xs">
            <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">
              कुल देय (Net Payable)
            </span>
            <span className="text-base sm:text-lg font-black text-amber-950">
              {formatCurrency(settlement.net_payable)}
            </span>
          </div>
        </div>

        {/* Dispute banner if active */}
        {settlement.status === 'DISPUTED' && settlement.dispute_reason && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-800">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-900">आपत्ति विवरण (Dispute Reason):</p>
              <p className="mt-0.5">{settlement.dispute_reason}</p>
            </div>
          </div>
        )}

        {/* Expandable Line-Item Breakdown Drawer Toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between py-2 px-3 text-xs font-semibold text-amber-900 bg-amber-50/70 hover:bg-amber-100/70 rounded-lg border border-amber-200 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-amber-700" />
            <span>
              {isExpanded ? 'विस्तृत हिसाब छुपाएं (Hide Breakdown)' : 'विस्तृत पासबुक हिसाब देखें (View Explainable Breakdown)'}
            </span>
          </span>
          <span className="flex items-center gap-1 text-stone-500">
            <span>{settlement.line_items.length} प्रविष्टियां</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>

        {/* Expanded Drawer (Passbook Style Line-by-Line Table) */}
        {isExpanded && (
          <div className="mt-3 bg-white rounded-lg border border-stone-200 overflow-hidden divide-y divide-stone-100">
            <div className="p-3 bg-stone-50 text-[11px] font-bold text-stone-600 uppercase tracking-wider flex justify-between">
              <span>विवरण (Line Item & Formula)</span>
              <span>रकम (Amount)</span>
            </div>

            {settlement.line_items.map((item: SettlementLineItem) => {
              const isNegative = item.amount < 0 || item.type === 'DEBIT';
              const isZero = item.amount === 0;

              return (
                <div key={item.id} className="p-3 flex items-start justify-between gap-4 text-xs hover:bg-stone-50/50">
                  <div>
                    <p className="font-semibold text-stone-800">{item.titleHi || item.titleEn}</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">{item.description}</p>
                    {item.rate !== undefined && item.quantity !== undefined && (
                      <span className="inline-block mt-1 text-[10px] bg-stone-100 text-stone-600 font-mono px-1.5 py-0.5 rounded border border-stone-200">
                        {item.quantity} {item.unit || 'g'} × ₹{item.rate.toLocaleString('en-IN')}/{item.unit || 'g'}
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`font-bold font-mono text-xs sm:text-sm ${
                        isNegative
                          ? 'text-rose-600'
                          : isZero
                          ? 'text-stone-400'
                          : 'text-emerald-700'
                      }`}
                    >
                      {isNegative ? '-' : isZero ? '' : '+'}
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                </div>
              );
            })}

            <div className="p-3 bg-amber-50/40 flex items-center justify-between text-xs font-bold text-stone-900 border-t-2 border-amber-200">
              <span>अंतिम देय राशि (Final Net Payable):</span>
              <span className="text-sm font-black text-amber-950 font-mono">
                {formatCurrency(settlement.net_payable)}
              </span>
            </div>
          </div>
        )}

        {/* Dual Approval Audit Signatures */}
        <div className="mt-4 pt-3 border-t border-stone-200/80 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-stone-600">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-stone-400" />
            <span>
              ज्वैलर स्वीकृति:{' '}
              {settlement.jeweller_approved_at ? (
                <strong className="text-emerald-700">
                  {new Date(settlement.jeweller_approved_at).toLocaleDateString('hi-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </strong>
              ) : (
                <span className="text-stone-400">प्रतीक्षित (Pending)</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-stone-400" />
            <span>
              कारीगर स्वीकृति:{' '}
              {settlement.karigar_approved_at ? (
                <strong className="text-emerald-700">
                  {new Date(settlement.karigar_approved_at).toLocaleDateString('hi-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </strong>
              ) : (
                <span className="text-stone-400">प्रतीक्षित (Pending)</span>
              )}
            </span>
          </div>
        </div>

        {/* Dual Approval & Payment Action Buttons */}
        <div className="mt-4 pt-3 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2">
          {settlement.status === 'PAID' ? (
            <div className="w-full p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900">
              <span className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>भुगतान पूर्ण ({settlement.payment_method || 'BANK'}{settlement.payment_reference ? ` Ref: ${settlement.payment_reference}` : ''})</span>
              </span>
              <span className="text-[11px] font-medium text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-300 shadow-2xs">
                लेज़र में ADJUSTMENT ब्लॉक सुरक्षित
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {canDispute && !showDisputeInput && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowFormalDisputeModal(true)}
                      className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <AlertOctagon className="w-3.5 h-3.5" />
                      <span>Raise Dispute (विवाद दर्ज करें)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDisputeInput(true)}
                      className="px-2.5 py-1.5 text-xs text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
                      title="Quick flag note"
                    >
                      सरल आपत्ति
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                {isJeweller && onMarkPaid && !showPayModal && (
                  <button
                    type="button"
                    onClick={() => setShowPayModal(true)}
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-amber-800 hover:bg-amber-900 rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>भुगतान दर्ज करें (Mark as Paid)</span>
                  </button>
                )}

                {canApprove && !showApproveConfirm && (
                  <button
                    type="button"
                    onClick={() => setShowApproveConfirm(true)}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>हिसाब स्वीकार करें (Approve)</span>
                  </button>
                )}
              </div>
            </>
          )}

          {canApprove && showApproveConfirm && (
            <div className="w-full mt-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <p className="text-xs text-emerald-900 font-medium mb-2">
                क्या आप ₹{settlement.net_payable.toLocaleString('en-IN')} के अंतिम हिसाब की पुष्टि करते हैं?
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowApproveConfirm(false)}
                  className="px-2.5 py-1 text-xs text-stone-600 hover:bg-stone-100 rounded"
                >
                  रद्द करें (Cancel)
                </button>
                <button
                  type="button"
                  disabled={isApproving}
                  onClick={handleApproveSubmit}
                  className="px-3 py-1 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded shadow-xs disabled:opacity-50"
                >
                  {isApproving ? 'पुष्टि हो रही है...' : 'हाँ, पुष्टि करें (Confirm)'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mark as Paid Execution Form (Jeweller) */}
        {showPayModal && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (onMarkPaid) {
                await onMarkPaid(settlement.id, selectedPayMethod, payReference.trim() || undefined, payNotes.trim() || undefined);
                setShowPayModal(false);
              }
            }}
            className="mt-3 p-3.5 bg-gradient-to-br from-amber-50 to-stone-50 border border-amber-300 rounded-xl space-y-3"
          >
            <div className="flex items-center justify-between border-b border-amber-200 pb-2">
              <span className="font-bold text-xs text-amber-950 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-amber-700" />
                <span>भुगतान निष्पादन (Execute Settlement Payment: ₹{settlement.net_payable.toLocaleString('en-IN')})</span>
              </span>
              <span className="text-[10px] text-stone-500 font-medium">Single Source of Truth</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">भुगतान माध्यम (Method) *</label>
                <select
                  value={selectedPayMethod}
                  onChange={(e) => setSelectedPayMethod(e.target.value as PaymentMethod)}
                  className="w-full p-2 border border-stone-300 rounded-lg bg-white font-medium text-stone-900"
                >
                  <option value="UPI">UPI (Google Pay / PhonePe / Paytm)</option>
                  <option value="BANK">Bank Transfer (NEFT / RTGS / IMPS)</option>
                  <option value="CASH">Cash (नकद वाउचर)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">संदर्भ संख्या (Ref / UTR / Voucher #)</label>
                <input
                  type="text"
                  placeholder="उदा. UPI/2026/9821 या UTR..."
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  className="w-full p-2 border border-stone-300 rounded-lg bg-white text-stone-900 font-mono text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-stone-700 mb-1">टिप्पणी (Notes - Optional)</label>
                <input
                  type="text"
                  placeholder="उदा. पूरा हिसाब चुकता किया गया..."
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full p-2 border border-stone-300 rounded-lg bg-white text-stone-900 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowPayModal(false)}
                className="px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 rounded-lg"
              >
                रद्द करें (Cancel)
              </button>
              <button
                type="submit"
                disabled={isPaying}
                className="px-4 py-1.5 text-xs font-bold text-white bg-amber-800 hover:bg-amber-900 rounded-lg shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                {isPaying ? 'प्रोसेसिंग...' : 'भुगतान पूर्ण करें एवं लेज़र ADJUSTMENT दर्ज करें'}
              </button>
            </div>
          </form>
        )}

        {/* Dispute input form */}
        {showDisputeInput && (
          <form onSubmit={handleDisputeSubmit} className="mt-3 p-3 bg-rose-50/70 border border-rose-200 rounded-lg">
            <label className="block text-xs font-bold text-rose-900 mb-1">
              आपत्ति का कारण लिखें (Reason for Dispute):
            </label>
            <textarea
              required
              rows={2}
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="उदाहरण: कटिंग और स्क्रैप का वजन गलत आंका गया है..."
              className="w-full text-xs p-2 border border-rose-300 rounded bg-white text-stone-900 focus:outline-rose-500"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setShowDisputeInput(false)}
                className="px-2.5 py-1 text-xs text-stone-600 hover:bg-stone-100 rounded"
              >
                रद्द करें (Cancel)
              </button>
              <button
                type="submit"
                disabled={isDisputing || !disputeReason.trim()}
                className="px-3 py-1 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded shadow-xs disabled:opacity-50"
              >
                {isDisputing ? 'भेज रहे हैं...' : 'आपत्ति भेजें (Submit Dispute)'}
              </button>
            </div>
          </form>
        )}
      </div>

      {showFormalDisputeModal && (
        <RaiseDisputeModal
          targetType="SETTLEMENT"
          targetId={settlement.id}
          targetReference={`Settlement #${settlement.settlement_number}`}
          onClose={() => setShowFormalDisputeModal(false)}
          onSuccess={() => setShowFormalDisputeModal(false)}
        />
      )}
    </div>
  );
};
