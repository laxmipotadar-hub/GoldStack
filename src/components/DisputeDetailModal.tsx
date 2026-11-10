import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Scale,
  ShieldCheck,
  ShieldAlert,
  Send,
  Upload,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileCode,
  Check,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  Dispute,
  DisputeResponse,
  AtFaultParty,
  Role,
  User,
  Party
} from '../../shared/types.js';
import { DisputeTimeline } from './DisputeTimeline.js';
import { useToast } from './Toast.js';

interface DisputeDetailModalProps {
  disputeId: string;
  currentParty: Party | User;
  onClose: () => void;
}

export const DisputeDetailModal: React.FC<DisputeDetailModalProps> = ({
  disputeId,
  currentParty,
  onClose
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [newMessage, setNewMessage] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [showSnapshotJson, setShowSnapshotJson] = useState(false);
  const [verifiedSnapshot, setVerifiedSnapshot] = useState<{ isValid: boolean; expectedHash: string } | null>(null);

  // Mediator proposal state
  const [proposalTerms, setProposalTerms] = useState('');
  const [atFaultParty, setAtFaultParty] = useState<AtFaultParty>('KARIGAR');
  const [penaltyPoints, setPenaltyPoints] = useState(0.5);
  const [adjustmentAmount, setAdjustmentAmount] = useState(5000);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  // 1. Fetch Dispute Details
  const { data: disputeRes, isLoading, refetch } = useQuery<DisputeResponse>({
    queryKey: ['dispute-detail', disputeId],
    queryFn: async () => {
      const res = await fetch(`/api/disputes/${disputeId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch dispute');
      return res.json();
    },
    refetchInterval: 5000 // Poll active mediation room
  });

  const dispute = disputeRes?.data;
  const isMediator = currentParty.role === 'MEDIATOR';
  const isJeweller = currentParty.role === 'JEWELLER' && dispute?.jeweller_id === currentParty.id;
  const isKarigar = currentParty.role === 'KARIGAR' && dispute?.karigar_id === currentParty.id;

  // 2. Mutation: Post Chat Message
  const messageMutation = useMutation({
    mutationFn: async (msg: string) => {
      const res = await fetch(`/api/disputes/${disputeId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: msg })
      });
      return res.json();
    },
    onSuccess: () => {
      setNewMessage('');
      refetch();
    }
  });

  // 3. Mutation: Add Evidence
  const evidenceMutation = useMutation({
    mutationFn: async (payload: { file_url: string; notes?: string }) => {
      const res = await fetch(`/api/disputes/${disputeId}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      return res.json();
    },
    onSuccess: () => {
      setEvidenceUrl('');
      setEvidenceNotes('');
      toast.success('Evidence Attached', 'Evidence registered with cryptographic SHA-256 hash.');
      refetch();
    }
  });

  // 4. Mutation: Transition State
  const transitionMutation = useMutation({
    mutationFn: async (toStatus: string) => {
      const res = await fetch(`/api/disputes/${disputeId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to_status: toStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Transition failed');
      return data;
    },
    onSuccess: (data) => {
      toast.success('State Advanced', `Dispute moved to ${data.data?.status}.`);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['disputes'] });
    },
    onError: (err: any) => {
      toast.error('Transition Rejected', err.message);
    }
  });

  // 5. Mutation: Propose Resolution (Mediator)
  const proposeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/disputes/${disputeId}/propose-resolution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          resolution_proposal: proposalTerms,
          at_fault_party: atFaultParty,
          penalty_points: penaltyPoints,
          settlement_adjustment_amount: adjustmentAmount
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to propose terms');
      return data;
    },
    onSuccess: () => {
      toast.success('Resolution Terms Proposed', 'Terms submitted for dual party acceptance.');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['disputes'] });
    },
    onError: (err: any) => {
      toast.error('Proposal Error', err.message);
    }
  });

  // 6. Mutation: Respond Resolution (Parties)
  const respondMutation = useMutation({
    mutationFn: async ({ action, reason }: { action: 'ACCEPT' | 'REJECT'; reason?: string }) => {
      const res = await fetch(`/api/disputes/${disputeId}/respond-resolution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, rejection_reason: reason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Response failed');
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        'Response Recorded',
        data.data?.status === 'RESOLVED'
          ? 'Dual confirmation completed! Dispute RESOLVED with side effects executed.'
          : 'Response recorded.'
      );
      setShowRejectInput(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['disputes'] });
      queryClient.invalidateQueries({ queryKey: ['trust-scores-all'] });
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
    },
    onError: (err: any) => {
      toast.error('Response Error', err.message);
    }
  });

  // Verify Snapshot Hash
  const verifySnapshot = async () => {
    try {
      const res = await fetch(`/api/disputes/${disputeId}/verify-snapshot`, { credentials: 'include' });
      const data = await res.json();
      setVerifiedSnapshot(data.data);
      if (data.data?.isValid) {
        toast.success('Snapshot Verified', 'Target data matches original SHA-256 hash. Zero tampering detected.');
      } else {
        toast.error('Integrity Compromise', 'Snapshot does not match recorded hash!');
      }
    } catch {
      toast.error('Verification Error', 'Failed to verify snapshot');
    }
  };

  if (isLoading || !dispute) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
        <div className="bg-surface-container-lowest p-8 rounded-3xl text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary mb-2" />
          <p className="text-xs font-bold">Opening Trade Mediation Room...</p>
        </div>
      </div>
    );
  }

  const isResolved = dispute.status === 'RESOLVED';
  const isProposed = dispute.status === 'RESOLUTION_PROPOSED';
  const hasJewellerAccepted = Boolean(dispute.jeweller_accepted_at);
  const hasKarigarAccepted = Boolean(dispute.karigar_accepted_at);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-surface-container-lowest rounded-3xl max-w-4xl w-full max-h-[92vh] overflow-hidden shadow-2xl border border-outline-variant/40 flex flex-col">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-red-900 via-amber-900 to-amber-950 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Scale className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-headline-sm text-base sm:text-lg font-bold">
                  Dispute #{dispute.dispute_number}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-amber-950 uppercase">
                  {dispute.category}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white font-mono">
                  {dispute.target_type}
                </span>
              </div>
              <p className="text-xs text-amber-200 mt-0.5 font-label-vernacular">
                {dispute.jeweller_name} ↔ {dispute.karigar_name} • स्वर्ण मध्यस्थता कक्ष
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-amber-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Stepper Timeline */}
          <DisputeTimeline dispute={dispute} />

          {/* Factual Grounds Summary */}
          <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-on-surface flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Ground of Dispute (आपत्ति विवरण)</span>
              </span>
              <span className="text-[10px] text-on-surface-variant font-mono">
                Raised by: {dispute.raised_by_name} ({dispute.raised_by_role})
              </span>
            </div>
            <p className="text-on-surface bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/20 italic">
              &ldquo;{dispute.description}&rdquo;
            </p>
          </div>

          {/* Frozen Target State Snapshot Viewer */}
          <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 text-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-success" />
                <span className="font-bold text-on-surface">
                  Frozen Target State Snapshot ({dispute.target_type})
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-surface-container font-mono text-brand font-bold">
                  Immutable
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={verifySnapshot}
                  className="px-2.5 py-1 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container border border-outline-variant/40 font-bold text-[11px] flex items-center gap-1 transition-all"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-success" />
                  <span>Verify SHA-256</span>
                </button>

                <button
                  onClick={() => setShowSnapshotJson(!showSnapshotJson)}
                  className="px-2.5 py-1 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container border border-outline-variant/40 font-bold text-[11px] flex items-center gap-1 transition-all"
                >
                  <FileCode className="w-3.5 h-3.5 text-muted" />
                  <span>{showSnapshotJson ? 'Hide Data' : 'Inspect Frozen JSON'}</span>
                  {showSnapshotJson ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
            </div>

            <div className="font-mono text-[11px] text-on-surface-variant flex items-center justify-between bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/20">
              <span className="truncate max-w-sm">Hash: {dispute.snapshot_hash}</span>
              {verifiedSnapshot?.isValid && (
                <span className="text-success font-bold flex items-center gap-1 shrink-0">
                  <Check className="w-3.5 h-3.5" />
                  <span>100% Genuine Match</span>
                </span>
              )}
            </div>

            {showSnapshotJson && (
              <pre className="p-3 bg-inverse-surface text-inverse-on-surface rounded-xl text-[11px] font-mono overflow-x-auto max-h-48">
                {JSON.stringify(dispute.snapshot_data, null, 2)}
              </pre>
            )}
          </div>

          {/* Evidence Gallery & Submission */}
          <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-on-surface flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-primary" />
                <span>Evidentiary Records ({dispute.evidence.length})</span>
              </span>
              <span className="text-[10px] text-on-surface-variant font-mono">
                Cryptographic Perceptual dHash
              </span>
            </div>

            {dispute.evidence.length === 0 ? (
              <p className="text-on-surface-variant italic p-3 bg-surface-container-lowest rounded-xl text-center">
                No supplementary evidence files attached yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {dispute.evidence.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/30 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-on-surface truncate block max-w-[180px]">
                        {ev.notes || 'Evidence Document'}
                      </span>
                      <span className="text-[10px] font-mono bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant">
                        {ev.uploaded_by_role}
                      </span>
                    </div>

                    <a
                      href={ev.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-[11px] truncate block font-mono"
                    >
                      {ev.file_url}
                    </a>

                    <div className="flex items-center justify-between text-[10px] text-on-surface-variant font-mono">
                      <span>SHA: {ev.file_hash.slice(0, 10)}...</span>
                      <span>{new Date(ev.uploaded_at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Evidence Form (if active) */}
            {!isResolved && dispute.status !== 'CLOSED' && (
              <div className="pt-2 border-t border-outline-variant/20 flex flex-col sm:flex-row items-center gap-2">
                <input
                  type="text"
                  placeholder="Attach photo/document evidence URL..."
                  value={evidenceUrl}
                  onChange={(e) => setEvidenceUrl(e.target.value)}
                  className="flex-1 h-8 px-3 text-xs bg-surface-container-lowest rounded-lg border border-outline-variant/40 text-on-surface focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Notes (e.g. Assay cert)"
                  value={evidenceNotes}
                  onChange={(e) => setEvidenceNotes(e.target.value)}
                  className="w-full sm:w-44 h-8 px-3 text-xs bg-surface-container-lowest rounded-lg border border-outline-variant/40 text-on-surface focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (evidenceUrl.trim()) {
                      evidenceMutation.mutate({ file_url: evidenceUrl.trim(), notes: evidenceNotes.trim() });
                    }
                  }}
                  disabled={!evidenceUrl.trim() || evidenceMutation.isPending}
                  className="h-8 px-3 bg-primary text-on-primary rounded-lg text-xs font-bold transition-all disabled:opacity-50 shrink-0 flex items-center gap-1"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload</span>
                </button>
              </div>
            )}
          </div>

          {/* Threaded In-Dispute Messages Chat */}
          <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 text-xs space-y-3">
            <span className="font-bold text-on-surface flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-secondary" />
              <span>Threaded Mediation Hearing & Dispute Log</span>
            </span>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {dispute.messages.map((m) => {
                const isSystem = m.sender_role === 'SYSTEM';
                const isMed = m.sender_role === 'MEDIATOR';

                return (
                  <div
                    key={m.id}
                    className={`p-2.5 rounded-xl border text-xs leading-relaxed ${
                      isSystem
                        ? 'bg-surface-container text-on-surface-variant font-mono text-[11px] border-outline-variant/20'
                        : isMed
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-950 font-medium'
                        : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1 text-[10px] text-on-surface-variant font-sans">
                      <span className="font-bold">
                        {m.sender_name} ({m.sender_role})
                      </span>
                      <span>{new Date(m.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p>{m.message}</p>
                  </div>
                );
              })}
            </div>

            {/* Chat Input */}
            {!isResolved && dispute.status !== 'CLOSED' && (
              <div className="pt-2 border-t border-outline-variant/20 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Post testimony, clarification, or proposal..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newMessage.trim()) {
                      messageMutation.mutate(newMessage.trim());
                    }
                  }}
                  className="flex-1 h-9 px-3 text-xs bg-surface-container-lowest rounded-xl border border-outline-variant/40 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  onClick={() => {
                    if (newMessage.trim()) messageMutation.mutate(newMessage.trim());
                  }}
                  disabled={!newMessage.trim() || messageMutation.isPending}
                  className="h-9 px-3.5 bg-secondary text-on-secondary rounded-xl font-bold text-xs flex items-center gap-1 disabled:opacity-50 transition-all shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </div>
            )}
          </div>

          {/* ========================================== */}
          {/* MEDIATION & RESOLUTION ACTION PANEL        */}
          {/* ========================================== */}

          {/* 1. If RESOLVED Banner */}
          {isResolved && (
            <div className="p-4 rounded-2xl bg-success-bg border-2 border-success text-xs text-ink space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-success">
                <CheckCircle2 className="w-5 h-5 text-success" />
                <span>Dispute Officially RESOLVED by Dual Acceptance</span>
              </div>
              <p className="text-xs">
                Resolution Terms: <strong>&ldquo;{dispute.resolution_proposal}&rdquo;</strong>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                <div className="bg-white p-2 rounded-lg border border-success/30">
                  <span className="text-[10px] text-muted block">At-Fault Party</span>
                  <span className="font-bold text-brand">{dispute.at_fault_party || 'NONE'}</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-success/30">
                  <span className="text-[10px] text-muted block">Trust Score Penalty</span>
                  <span className="font-bold text-danger">-{dispute.penalty_points} pts</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-success/30">
                  <span className="text-[10px] text-muted block">Settlement Adjustment</span>
                  <span className="font-bold text-success">₹{dispute.settlement_adjustment_amount}</span>
                </div>
              </div>
            </div>
          )}

          {/* 2. If RESOLUTION_PROPOSED: Show terms & Dual Acceptance controls */}
          {!isResolved && isProposed && (
            <div className="p-4 rounded-2xl bg-warn-bg border-2 border-warn/40 text-xs text-ink space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm text-warn">
                  <span className="w-2 h-2 rounded-full bg-warn" />
                  <Scale className="w-5 h-5 text-warn" />
                  <span>Proposed Resolution Terms (समाधान प्रस्ताव)</span>
                </div>
                <span className="text-[11px] font-mono text-muted">
                  By Mediator: {dispute.proposed_by_name || 'Guild Mediator'}
                </span>
              </div>

              <div className="bg-card p-3 rounded-xl border border-border text-ink">
                <p className="font-bold mb-1">&ldquo;{dispute.resolution_proposal}&rdquo;</p>
                <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted font-mono mt-2 pt-2 border-t border-border">
                  <span>At-Fault Party: <strong className="text-danger">{dispute.at_fault_party}</strong></span>
                  <span>Penalty: <strong className="text-danger">-{dispute.penalty_points} Trust pts</strong></span>
                  <span>Financial Adjustment: <strong className="text-success">₹{dispute.settlement_adjustment_amount}</strong></span>
                </div>
              </div>

              {/* Dual Party Acceptance Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  hasJewellerAccepted ? 'bg-success-bg border-success/40 text-success' : 'bg-card border-border text-muted'
                }`}>
                  <span className="font-bold text-xs">Jeweller ({dispute.jeweller_name?.split(' ')[0]}):</span>
                  <span className="font-bold flex items-center gap-1 text-[11px]">
                    {hasJewellerAccepted ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                        <span>Accepted (स्वीकृत)</span>
                      </>
                    ) : (
                      <>
                        <Clock className="w-3.5 h-3.5 text-warn" />
                        <span className="text-warn">Pending Acceptance</span>
                      </>
                    )}
                  </span>
                </div>

                <div className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  hasKarigarAccepted ? 'bg-success-bg border-success/40 text-success' : 'bg-card border-border text-muted'
                }`}>
                  <span className="font-bold text-xs">Karigar ({dispute.karigar_name?.split(' ')[0]}):</span>
                  <span className="font-bold flex items-center gap-1 text-[11px]">
                    {hasKarigarAccepted ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                        <span>Accepted (स्वीकृत)</span>
                      </>
                    ) : (
                      <>
                        <Clock className="w-3.5 h-3.5 text-warn" />
                        <span className="text-warn">Pending Acceptance</span>
                      </>
                    )}
                  </span>
                </div>
              </div>

              {/* Disputing Party Action Buttons */}
              {(isJeweller || isKarigar) && (
                <div className="pt-2 border-t border-border flex flex-wrap items-center justify-end gap-2">
                  {!showRejectInput ? (
                    <>
                      <button
                        onClick={() => setShowRejectInput(true)}
                        className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-danger-bg text-danger text-xs font-bold border border-danger/30 transition-all flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Object / Reject (आपत्ति)</span>
                      </button>

                      <button
                        onClick={() => respondMutation.mutate({ action: 'ACCEPT' })}
                        disabled={respondMutation.isPending || (isJeweller && hasJewellerAccepted) || (isKarigar && hasKarigarAccepted)}
                        className="px-4 py-2 rounded-xl bg-success hover:bg-success/90 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Accept Proposed Terms (स्वीकार करें)</span>
                      </button>
                    </>
                  ) : (
                    <div className="w-full space-y-2">
                      <input
                        type="text"
                        placeholder="State grounds for rejecting mediator's terms..."
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        className="w-full h-9 px-3 text-xs bg-white rounded-xl border border-danger/40 text-ink focus:outline-none"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setShowRejectInput(false)}
                          className="px-3 py-1 text-xs font-bold text-muted hover:bg-chip rounded-lg"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => respondMutation.mutate({ action: 'REJECT', reason: rejectionReason })}
                          disabled={respondMutation.isPending}
                          className="px-3.5 py-1.5 rounded-xl bg-danger hover:bg-danger/90 text-white text-xs font-bold transition-all shadow-xs"
                        >
                          Submit Rejection
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. Mediator Controls (When viewing as MEDIATOR and not resolved) */}
          {!isResolved && isMediator && (
            <div className="p-4 rounded-2xl bg-surface-container border-2 border-primary/40 text-xs space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-on-surface flex items-center gap-1.5 text-sm">
                  <Scale className="w-4 h-4 text-primary" />
                  <span>Mediator Bench: Formulate Binding Terms (मध्यस्थ निर्णय)</span>
                </span>
                <span className="text-[10px] bg-primary text-on-primary font-bold px-2 py-0.5 rounded-full">
                  Mediator Authority
                </span>
              </div>

              {/* Status advancement shortcuts */}
              {dispute.status === 'OPENED' && (
                <button
                  onClick={() => transitionMutation.mutate('EVIDENCE')}
                  className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-bold text-xs flex items-center gap-1"
                >
                  <span>Open 72h Evidence Window</span>
                </button>
              )}

              {dispute.status === 'EVIDENCE' && (
                <button
                  onClick={() => transitionMutation.mutate('REVIEW')}
                  className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-bold text-xs flex items-center gap-1"
                >
                  <span>Advance Evidence to Fact Review</span>
                </button>
              )}

              {dispute.status === 'REVIEW' && (
                <button
                  onClick={() => transitionMutation.mutate('MEDIATION')}
                  className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-bold text-xs flex items-center gap-1"
                >
                  <span>Escalate to Active Formal Mediation</span>
                </button>
              )}

              {/* Form to Propose Terms */}
              {(dispute.status === 'REVIEW' || dispute.status === 'MEDIATION') && (
                <div className="space-y-3 pt-2 border-t border-outline-variant/30">
                  <div>
                    <label className="font-bold text-on-surface block mb-1">
                      Proposed Resolution Terms (समाधान की शर्तें) *
                    </label>
                    <textarea
                      rows={2}
                      value={proposalTerms}
                      onChange={(e) => setProposalTerms(e.target.value)}
                      placeholder="E.g., Jeweller to absorb 1.0g loss due to casting porosity; Karigar to credit ₹5,000 making charge deduction..."
                      className="w-full p-2.5 text-xs bg-surface-container-lowest rounded-xl border border-outline-variant/40 text-on-surface focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="font-bold text-on-surface block mb-1">At-Fault Party</label>
                      <select
                        value={atFaultParty}
                        onChange={(e) => setAtFaultParty(e.target.value as AtFaultParty)}
                        className="w-full h-8 px-2 text-xs bg-surface-container-lowest rounded-lg border border-outline-variant/40 text-on-surface font-bold"
                      >
                        <option value="KARIGAR">Karigar (कारीगर)</option>
                        <option value="JEWELLER">Jeweller (ज्वैलर)</option>
                        <option value="SPLIT">Split Responsibility (उभयपक्षीय)</option>
                        <option value="NONE">None / Act of Nature (अनिर्णित)</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-on-surface block mb-1">Trust Score Penalty</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="2.0"
                        value={penaltyPoints}
                        onChange={(e) => setPenaltyPoints(Number(e.target.value))}
                        className="w-full h-8 px-2 text-xs bg-surface-container-lowest rounded-lg border border-outline-variant/40 text-on-surface font-mono"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-on-surface block mb-1">Settlement Adjustment (₹)</label>
                      <input
                        type="number"
                        step="500"
                        value={adjustmentAmount}
                        onChange={(e) => setAdjustmentAmount(Number(e.target.value))}
                        className="w-full h-8 px-2 text-xs bg-surface-container-lowest rounded-lg border border-outline-variant/40 text-on-surface font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => proposeMutation.mutate()}
                      disabled={!proposalTerms.trim() || proposeMutation.isPending}
                      className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-on-primary font-bold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                    >
                      <Scale className="w-3.5 h-3.5" />
                      <span>Submit Binding Proposal to Parties</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

