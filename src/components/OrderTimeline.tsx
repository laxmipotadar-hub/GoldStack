import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  Sparkles,
  ShieldAlert,
  ArrowRight,
  Flame,
  Check,
  RotateCcw,
  User,
  Heart,
  Scale,
  Zap,
  Info,
  AlertOctagon
} from 'lucide-react';
import { CustomerOrder, Milestone, MilestoneStatus } from '../../shared/types.js';
import { RiskBadge } from './RiskBadge.js';
import { useToast } from './Toast.js';
import { useAuth } from '../context/AuthContext.js';
import { RaiseDisputeModal } from './RaiseDisputeModal.js';

interface OrderTimelineProps {
  order: CustomerOrder;
  onOrderUpdated?: (updated: CustomerOrder) => void;
}

export const OrderTimeline: React.FC<OrderTimelineProps> = ({ order, onOrderUpdated }) => {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [delayModalMilestone, setDelayModalMilestone] = useState<Milestone | null>(null);
  const [delayDays, setDelayDays] = useState<number>(2);
  const [delayReason, setDelayReason] = useState<string>('Artisan hand-filing & setting complexity');
  const [showDisputeModal, setShowDisputeModal] = useState<boolean>(false);

  // Complete milestone mutation
  const completeMutation = useMutation({
    mutationFn: async ({ milestoneId }: { milestoneId: string }) => {
      const res = await fetch(`/api/orders/${order.id}/milestones/${milestoneId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ actual_date: new Date().toISOString().split('T')[0] })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to complete milestone');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success('चरण पूर्ण (Milestone Completed)', data.message);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      if (onOrderUpdated && data.data) {
        onOrderUpdated(data.data);
      }
    },
    onError: (err: any) => {
      toast.error('त्रुटि (Error)', err.message);
    }
  });

  // Delay milestone mutation (triggers delay cascade & AT_RISK auto-detection)
  const delayMutation = useMutation({
    mutationFn: async ({ milestoneId, days, reason }: { milestoneId: string; days: number; reason: string }) => {
      const res = await fetch(`/api/orders/${order.id}/milestones/${milestoneId}/delay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ delay_days: days, reason })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to record delay');
      }
      return res.json();
    },
    onSuccess: (data) => {
      const updated = data.data as CustomerOrder;
      if (updated.is_at_risk) {
        toast.error('⚠️ AT RISK WARNING', 'Delay exceeds Occasion Date! Order flagged as AT_RISK.');
      } else {
        toast.info('अनुसूची अद्यतन (Schedule Recomputed)', data.message);
      }
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setDelayModalMilestone(null);
      if (onOrderUpdated && updated) {
        onOrderUpdated(updated);
      }
    },
    onError: (err: any) => {
      toast.error('त्रुटि (Error)', err.message);
    }
  });

  // Acknowledge escalation mutation (Jeweller intervention)
  const acknowledgeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/orders/${order.id}/acknowledge-escalation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes: 'Jeweller acknowledged risk and coordinated bench intervention' })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to acknowledge escalation');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success('संज्ञान लिया गया (Escalation Acknowledged)', data.message);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      if (onOrderUpdated && data.data) {
        onOrderUpdated(data.data);
      }
    },
    onError: (err: any) => {
      toast.error('त्रुटि (Error)', err.message);
    }
  });

  const occasionIcon =
    order.occasion_type === 'WEDDING' ? (
      <Heart className="w-5 h-5 text-rose-500 fill-rose-500/20" />
    ) : order.occasion_type === 'FESTIVAL' ? (
      <Sparkles className="w-5 h-5 text-amber-500" />
    ) : (
      <Calendar className="w-5 h-5 text-primary" />
    );

  const occasionLabel =
    order.occasion_type === 'WEDDING'
      ? '💍 Shubh Vivah • शुभ विवाह (Wedding Occasion)'
      : order.occasion_type === 'FESTIVAL'
      ? '🪔 Shubh Utsav • पावन त्यौहार (Festival Occasion)'
      : order.occasion_type === 'CEREMONY'
      ? '🪷 Shubh Sanskar • मांगलिक संस्कार'
      : '📦 Special Jewellery Order';

  const daysRemaining = order.days_to_occasion;
  const isAtRisk = order.is_at_risk || order.status === 'AT_RISK';
  const bufferRemaining = order.buffer_days_remaining ?? 0;

  return (
    <div className="space-y-6">
      {/* 1. PROMINENT WEDDING-DATE PROTECTION BANNER */}
      <div
        className={`rounded-2xl p-5 border shadow-sm transition-all ${
          isAtRisk
            ? 'bg-gradient-to-r from-error/15 via-error/5 to-surface-container-lowest border-error/50 shadow-error/10'
            : daysRemaining <= 7
            ? 'bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-surface-container-lowest border-amber-500/50'
            : 'bg-gradient-to-r from-primary/10 via-surface-container-lowest to-surface-container-low border-primary/30'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30 shadow-2xs">
                {occasionIcon}
              </span>
              <span className="font-label-md text-xs font-bold text-on-surface uppercase tracking-wider">
                {occasionLabel}
              </span>

              {isAtRisk ? (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-error text-on-error animate-pulse flex items-center gap-1 shadow-xs">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>AT RISK • शुभ तिथि संकट</span>
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#477b55] text-white flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>On Schedule • समय पर सुरक्षित</span>
                </span>
              )}

              <RiskBadge
                level={order.risk_level}
                score={order.risk_score}
                factors={order.risk_factors}
                status={order.status}
                size="sm"
              />
            </div>

            <h3 className="font-headline-md text-xl font-bold text-on-surface">
              {order.customer_name}
            </h3>

            <p className="text-xs text-on-surface-variant font-medium">
              Order: <span className="font-mono font-bold text-primary">{order.order_number}</span> •{' '}
              Complexity: <strong className="text-on-surface">{order.design_complexity}</strong>
              {order.target_weight_grams ? ` • Weight: ${order.target_weight_grams}g` : ''}
            </p>

            {/* Actions: Escalation Acknowledgment & Dispute */}
            <div className="pt-2 flex flex-wrap items-center gap-2">
              {user?.role === 'JEWELLER' && (order.status === 'AT_RISK' || order.status === 'DELAYED' || isAtRisk) && order.status !== 'ESCALATED' && (
                <button
                  type="button"
                  onClick={() => acknowledgeMutation.mutate()}
                  disabled={acknowledgeMutation.isPending}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>{acknowledgeMutation.isPending ? 'संज्ञान दर्ज हो रहा है...' : 'संज्ञान लें एवं हस्तक्षेप करें (Acknowledge Escalation)'}</span>
                </button>
              )}
              {order.status === 'ESCALATED' && (
                <span className="inline-flex px-3 py-1 rounded-xl bg-purple-100 text-purple-800 border border-purple-300 font-bold text-xs items-center gap-1.5 shadow-2xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                  <span>संज्ञान लिया गया (Escalation Acknowledged by Jeweller)</span>
                </span>
              )}

              <button
                type="button"
                onClick={() => setShowDisputeModal(true)}
                className="px-3 py-1.5 rounded-xl border border-rose-300 bg-rose-50/80 hover:bg-rose-100 text-rose-800 font-bold text-xs shadow-2xs transition-colors flex items-center gap-1.5"
              >
                <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                <span>Raise Dispute (विवाद दर्ज करें)</span>
              </button>
            </div>
          </div>

          {/* Countdown & Occasion Date Box */}
          <div className="flex items-center gap-3 bg-surface-container-lowest/90 backdrop-blur-xs p-3.5 rounded-xl border border-outline-variant/40 shadow-xs text-right">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-secondary block">
                शुभ तिथि / Occasion Date
              </span>
              <span className="font-headline-sm text-base font-bold text-on-surface flex items-center gap-1.5 justify-end">
                <Calendar className="w-4 h-4 text-primary" />
                <span>{new Date(order.occasion_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </span>
              <span className="text-[10px] text-on-surface-variant block mt-0.5">
                {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Occasion reached'}
              </span>
            </div>

            <div className="h-10 w-px bg-outline-variant/30" />

            <div className="text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-secondary block">
                Delivery Buffer
              </span>
              <span
                className={`font-mono text-base font-bold block ${
                  bufferRemaining < 0 ? 'text-error' : bufferRemaining === 0 ? 'text-amber-700' : 'text-[#477b55]'
                }`}
              >
                {bufferRemaining < 0 ? `${bufferRemaining}d LATE` : `+${bufferRemaining}d Safe`}
              </span>
              <span className="text-[10px] text-on-surface-variant">
                {isAtRisk ? 'Exceeds Event!' : 'Pre-event buffer'}
              </span>
            </div>
          </div>
        </div>

        {/* At-Risk Warning Alert */}
        {isAtRisk && (
          <div className="mt-4 p-3 rounded-xl bg-error/10 border border-error/30 text-xs text-error font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-error animate-bounce" />
            <span>
              <strong>Wedding-Date Protection Alert:</strong> The projected final delivery date exceeds the
              customer's auspicious occasion date! Priority expedited bench work or supplementary artisan allocation is urgently required.
            </span>
          </div>
        )}
      </div>

      {/* 2. CRITICAL PATH & REVERSE-SCHEDULE METRICS */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-on-surface flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-primary" />
            <span>Critical Path Method (CPM) Schedule:</span>
          </span>
          <span className="font-label-vernacular text-[11px] text-on-surface-variant">
            शून्य-स्लैक अति-महत्वपूर्ण चरण (Zero-Slack Critical Path)
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span>Critical Path</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
            <span>Slack Available</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#477b55]" />
            <span>Completed</span>
          </span>
        </div>
      </div>

      {/* 3. VERTICAL TIMELINE OF MILESTONES */}
      <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-outline-variant/40">
        {order.milestones.map((m, index) => {
          const isCompleted = m.status === 'COMPLETED';
          const isInProgress = m.status === 'IN_PROGRESS';
          const isDelayed = m.status === 'DELAYED';
          const isPending = m.status === 'PENDING';
          const isCritical = Boolean(m.is_critical);

          return (
            <div key={m.id} className="relative group">
              {/* Timeline Sequence Node */}
              <div
                className={`absolute -left-6 sm:-left-8 top-1.5 w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all shadow-xs ${
                  isCompleted
                    ? 'bg-[#477b55] border-[#477b55] text-white'
                    : isDelayed
                    ? 'bg-error border-error text-white animate-pulse'
                    : isInProgress
                    ? 'bg-primary border-primary text-on-primary ring-4 ring-primary/20'
                    : 'bg-surface-container-high border-outline-variant/60 text-on-surface-variant'
                }`}
              >
                {isCompleted ? (
                  <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
                ) : isDelayed ? (
                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                ) : (
                  <span>{m.sequence}</span>
                )}
              </div>

              {/* Milestone Card */}
              <div
                className={`rounded-2xl p-4 sm:p-5 border transition-all ${
                  isInProgress
                    ? 'bg-surface-container-lowest border-primary/50 shadow-sm ring-1 ring-primary/20'
                    : isDelayed
                    ? 'bg-error-container/10 border-error/40'
                    : isCompleted
                    ? 'bg-surface-container-lowest/80 border-outline-variant/30'
                    : 'bg-surface-container-low/50 border-outline-variant/20 opacity-80'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-outline-variant/20">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm sm:text-base text-on-surface">
                      {m.name}
                    </span>
                    {m.name_hi && (
                      <span className="font-label-vernacular text-xs text-primary font-bold">
                        • {m.name_hi}
                      </span>
                    )}

                    {/* Status Pill */}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        isCompleted
                          ? 'bg-[#477b55]/10 text-[#477b55] border border-[#477b55]/30'
                          : isDelayed
                          ? 'bg-error text-on-error'
                          : isInProgress
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {m.status}
                    </span>

                    {/* Critical Path Badge */}
                    {isCritical ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        <span>Critical Path</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-container-high text-on-surface-variant">
                        Slack: +{m.slack ?? 0}d
                      </span>
                    )}
                  </div>

                  <span className="text-xs text-on-surface-variant font-mono">
                    Duration: <strong>{m.duration_days} day{m.duration_days > 1 ? 's' : ''}</strong>
                  </span>
                </div>

                {/* Dates & Progress Detail */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-3 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-secondary block">
                      Reverse-Scheduled Finish (नियत तिथि)
                    </span>
                    <span className="font-mono font-bold text-on-surface text-xs flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3.5 h-3.5 text-primary" />
                      <span>{m.planned_date}</span>
                    </span>
                    <span className="text-[10px] text-on-surface-variant">
                      Start: {m.planned_start_date || 'N/A'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-secondary block">
                      Actual Completion (वास्तविक तिथि)
                    </span>
                    <span className="font-mono font-bold text-xs flex items-center gap-1 mt-0.5">
                      {m.actual_date ? (
                        <span className="text-[#477b55]">✓ {m.actual_date}</span>
                      ) : (
                        <span className="text-on-surface-variant italic">Pending execution</span>
                      )}
                    </span>
                    {m.notes && <span className="text-[10px] text-on-surface-variant block truncate">Note: {m.notes}</span>}
                  </div>

                  {/* Actions for Jeweller & Karigar */}
                  <div className="flex items-center justify-start sm:justify-end gap-2 pt-2 sm:pt-0">
                    {!isCompleted && (
                      <>
                        <button
                          type="button"
                          onClick={() => completeMutation.mutate({ milestoneId: m.id })}
                          disabled={completeMutation.isPending}
                          className="h-8 px-3 rounded-xl bg-[#477b55] text-white text-xs font-bold hover:brightness-105 active:scale-95 transition-all flex items-center gap-1 shadow-xs"
                          title="Mark this milestone completed"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Complete (पूर्ण करें)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDelayModalMilestone(m)}
                          className="h-8 px-2.5 rounded-xl bg-surface-container-high hover:bg-error-container/20 text-on-surface hover:text-error text-xs font-bold transition-all flex items-center gap-1"
                          title="Report delay and cascade recalculation"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Delay</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3b. ESCALATION & STATE TRANSITIONS AUDIT TRAIL */}
      {order.events && order.events.length > 0 && (
        <div className="mt-8 pt-5 border-t border-outline-variant/30 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-xs uppercase tracking-wider text-secondary flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <span>स्थिति परिवर्तन एवं ऑडिट ट्रेल (State Transitions & Escalation Log)</span>
            </h4>
            <span className="text-[11px] font-mono text-on-surface-variant font-medium">
              {order.events.length} event{order.events.length > 1 ? 's' : ''} logged
            </span>
          </div>

          <div className="space-y-2">
            {order.events.map((ev) => (
              <div
                key={ev.id}
                className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all hover:bg-surface-container"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono px-2 py-0.5 rounded text-[10px] bg-surface-container-high font-bold border border-outline-variant/30 text-primary">
                    {ev.from_status} → {ev.to_status}
                  </span>
                  <span className="text-on-surface font-medium">{ev.trigger_reason}</span>
                  {ev.actor_role && (
                    <span className="text-[10px] text-on-surface-variant font-mono bg-surface-container px-1.5 py-0.2 rounded">
                      by {ev.actor_role}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-on-surface-variant font-mono whitespace-nowrap">
                  {new Date(ev.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                  {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. DELAY REASON MODAL */}
      {delayModalMilestone && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-50 duration-200">
          <div className="max-w-md w-full bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/40 shadow-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-3">
              <AlertTriangle className="w-5 h-5 text-error" />
              <div>
                <h4 className="font-headline-sm text-base font-bold text-on-surface">
                  Record Milestone Delay (चरण विलंब दर्ज करें)
                </h4>
                <p className="text-xs text-on-surface-variant">
                  {delayModalMilestone.name} ({delayModalMilestone.name_hi})
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-bold text-secondary uppercase block mb-1">
                  Delay Duration in Days (विलंब दिन):
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 5, 7].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDelayDays(d)}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                        delayDays === d
                          ? 'bg-error text-on-error shadow-xs'
                          : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
                      }`}
                    >
                      +{d} Day{d > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-secondary uppercase block mb-1">
                  Reason for Delay (कारण):
                </label>
                <input
                  type="text"
                  value={delayReason}
                  onChange={(e) => setDelayReason(e.target.value)}
                  className="w-full h-9 px-3 text-xs rounded-xl bg-surface-container-low border border-outline-variant/40 focus:outline-none focus:ring-1 focus:ring-error"
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 text-[11px]">
                <p className="font-bold flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-amber-700" />
                  <span>Cascade Impact Warning:</span>
                </p>
                <p className="mt-0.5">
                  Downstream milestones will automatically shift forward. If the new delivery finish date
                  exceeds the customer's Occasion Date (<strong>{order.occasion_date}</strong>), the order status will immediately transition to <strong>AT_RISK</strong>.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setDelayModalMilestone(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-secondary hover:text-on-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  delayMutation.mutate({
                    milestoneId: delayModalMilestone.id,
                    days: delayDays,
                    reason: delayReason
                  });
                }}
                disabled={delayMutation.isPending}
                className="px-4 py-2 rounded-xl bg-error text-on-error text-xs font-bold hover:brightness-105 active:scale-95 transition-all shadow-xs"
              >
                {delayMutation.isPending ? 'Recomputing CPM...' : 'Confirm Delay Cascade'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Dispute Modal */}
      {showDisputeModal && (
        <RaiseDisputeModal
          targetType="ORDER"
          targetId={order.id}
          targetReference={order.order_number}
          onClose={() => setShowDisputeModal(false)}
          onSuccess={() => setShowDisputeModal(false)}
        />
      )}
    </div>
  );
};

