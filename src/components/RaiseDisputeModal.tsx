import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Scale,
  X,
  FileText,
  Upload,
  Camera,
  ShieldAlert,
  Clock,
  Sparkles
} from 'lucide-react';
import { DisputeTargetType, DisputeCategory, CreateDisputeRequest } from '../../shared/types.js';
import { useToast } from './Toast.js';

interface RaiseDisputeModalProps {
  targetType: DisputeTargetType;
  targetId: string;
  targetReference?: string;
  onClose: () => void;
  onSuccess?: (dispute: any) => void;
}

export const RaiseDisputeModal: React.FC<RaiseDisputeModalProps> = ({
  targetType,
  targetId,
  targetReference,
  onClose,
  onSuccess
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [category, setCategory] = useState<DisputeCategory>('WEIGHT');
  const [description, setDescription] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [evidenceNotes, setEvidenceNotes] = useState('');

  const raiseMutation = useMutation({
    mutationFn: async (payload: CreateDisputeRequest) => {
      const res = await fetch('/api/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to raise dispute');
      return data;
    },
    onSuccess: (data) => {
      toast.warning(
        'Dispute Logged',
        `Dispute #${data.data?.dispute_number} raised. Target state frozen with SHA-256 snapshot.`
      );
      queryClient.invalidateQueries({ queryKey: ['disputes'] });
      queryClient.invalidateQueries({ queryKey: ['ledgerHistory'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      if (onSuccess) onSuccess(data.data);
      onClose();
    },
    onError: (err: any) => {
      toast.error('Dispute Failed', err.message);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error('Validation Error', 'Please describe the grounds of dispute.');
      return;
    }

    raiseMutation.mutate({
      target_type: targetType,
      target_id: targetId,
      category,
      description: description.trim(),
      initial_evidence_url: evidenceUrl.trim() || undefined,
      initial_evidence_notes: evidenceNotes.trim() || undefined
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-surface-container-lowest rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-outline-variant/40 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-800 to-amber-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="font-headline-sm text-base font-bold">
                Raise Trade Dispute (विवाद दर्ज करें)
              </h3>
              <p className="text-xs text-amber-200 font-label-vernacular">
                आधिकारिक स्वर्ण विवाद निवारण एवं साक्ष्य संकलन
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {/* Target Preview Pill */}
          <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between text-xs">
            <div>
              <span className="text-[10px] text-on-surface-variant uppercase font-bold block">
                Disputed Subject ({targetType})
              </span>
              <span className="font-bold text-on-surface">
                {targetReference || targetId}
              </span>
            </div>
            <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-primary/10 text-primary font-bold">
              Snapshot Frozen
            </span>
          </div>

          {/* Category Selector */}
          <div>
            <label className="text-xs font-bold text-on-surface block mb-1.5">
              Dispute Category (विवाद की श्रेणी) *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'WEIGHT', label: 'Weight (वजन)', desc: 'Scale / wastage loss' },
                { id: 'QUALITY', label: 'Quality (गुणवत्ता)', desc: 'Purity / hallmark / polish' },
                { id: 'TIMING', label: 'Timing (तारीख)', desc: 'Wedding occasion delay' },
                { id: 'PAYMENT', label: 'Payment (भुगतान)', desc: 'Advances / making charge' },
                { id: 'OTHER', label: 'Other (अन्य)', desc: 'Contract terms' }
              ].map((cat) => (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setCategory(cat.id as DisputeCategory)}
                  className={`p-2 rounded-xl text-left border transition-all text-xs ${
                    category === cat.id
                      ? 'bg-amber-500/15 border-amber-600 text-amber-950 ring-1 ring-amber-600 font-bold'
                      : 'bg-surface-container-low border-outline-variant/30 text-on-surface hover:bg-surface-container'
                  }`}
                >
                  <span className="block font-bold">{cat.label}</span>
                  <span className="text-[10px] opacity-70 block">{cat.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold text-on-surface block mb-1">
              Factual Ground of Dispute (आपत्ति का स्पष्ट कारण) *
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="E.g., Discrepancy observed: Actual weight returned is 2.4g short of agreed receipt, or milestone delayed past auspicious date..."
              className="w-full p-3 text-xs bg-surface-container-low rounded-xl border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface"
            />
          </div>

          {/* Initial Evidence Attachment */}
          <div className="space-y-2 pt-1 border-t border-outline-variant/20">
            <span className="text-xs font-bold text-on-surface block">
              Initial Photo / Document Evidence (साक्ष्य दस्तावेज)
            </span>

            <input
              type="text"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="Photo URL or file reference (e.g., https://... or local upload)"
              className="w-full h-9 px-3 text-xs bg-surface-container-low rounded-xl border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface"
            />

            <input
              type="text"
              value={evidenceNotes}
              onChange={(e) => setEvidenceNotes(e.target.value)}
              placeholder="Notes on this evidence (e.g. Scale reading photo taken at delivery)"
              className="w-full h-8 px-3 text-[11px] bg-surface-container-low rounded-xl border border-outline-variant/40 focus:outline-none text-on-surface"
            />
          </div>

          {/* 72h Evidence Window Notice */}
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Once opened, both parties have a <strong>72-hour window</strong> to upload evidentiary documents before progressing to formal review.
            </span>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-outline-variant/20">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-container rounded-xl transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={raiseMutation.isPending}
              className="px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>{raiseMutation.isPending ? 'Logging Dispute...' : 'Confirm & Raise Dispute'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

