import React from 'react';
import {
  AlertCircle,
  FileText,
  Search,
  Scale,
  FileCheck,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import { DisputeStatus, Dispute } from '../../shared/types.js';

interface DisputeTimelineProps {
  dispute: Dispute;
}

interface StepConfig {
  key: DisputeStatus;
  label: string;
  label_hi: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STEPS: StepConfig[] = [
  { key: 'OPENED', label: 'Opened', label_hi: 'दर्ज', icon: AlertCircle },
  { key: 'EVIDENCE', label: 'Evidence (72h)', label_hi: 'साक्ष्य संकलन', icon: FileText },
  { key: 'REVIEW', label: 'Fact Review', label_hi: 'तथ्य समीक्षा', icon: Search },
  { key: 'MEDIATION', label: 'Trade Mediation', label_hi: 'मध्यस्थता', icon: Scale },
  { key: 'RESOLUTION_PROPOSED', label: 'Terms Proposed', label_hi: 'समाधान प्रस्तुत', icon: FileCheck },
  { key: 'RESOLVED', label: 'Resolved', label_hi: 'सुलझाया गया', icon: CheckCircle2 }
];

export const DisputeTimeline: React.FC<DisputeTimelineProps> = ({ dispute }) => {
  const currentStatus = dispute.status;
  const isClosed = currentStatus === 'CLOSED';

  // Determine active step index
  const getStepIndex = (status: DisputeStatus): number => {
    switch (status) {
      case 'OPENED': return 0;
      case 'EVIDENCE': return 1;
      case 'REVIEW': return 2;
      case 'MEDIATION': return 3;
      case 'RESOLUTION_PROPOSED': return 4;
      case 'RESOLVED': return 5;
      case 'CLOSED': return 6;
      default: return 0;
    }
  };

  const currentIndex = getStepIndex(currentStatus);

  return (
    <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/30 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
          <Scale className="w-4 h-4 text-primary" />
          <span>Dispute Resolution Pipeline (विवाद समाधान प्रक्रिया)</span>
        </span>

        {isClosed ? (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-surface-container text-on-surface-variant flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" />
            <span>Closed / Dismissed</span>
          </span>
        ) : (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-900 border border-amber-500/30 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-amber-700 animate-pulse" />
            <span>Stage: {currentStatus}</span>
          </span>
        )}
      </div>

      {/* Stepper Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2">
        {STEPS.map((step, idx) => {
          const StepIcon = step.icon;
          const isPassed = currentIndex > idx;
          const isCurrent = currentIndex === idx;
          const isPending = currentIndex < idx;

          return (
            <div
              key={step.key}
              className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-between ${
                isPassed
                  ? 'bg-[#f0f8f3] border-[#477b55]/40 text-[#1e4629]'
                  : isCurrent
                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-950 ring-2 ring-amber-500/20 shadow-xs'
                  : 'bg-surface-container-lowest border-outline-variant/20 text-on-surface-variant opacity-60'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center mb-1.5 ${
                  isPassed
                    ? 'bg-[#477b55] text-white'
                    : isCurrent
                    ? 'bg-amber-600 text-white animate-pulse'
                    : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                {isPassed ? <CheckCircle2 className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
              </div>

              <span className="font-bold text-[11px] leading-tight block">
                {step.label}
              </span>
              <span className="text-[10px] opacity-80 block mt-0.5 font-label-vernacular">
                {step.label_hi}
              </span>
            </div>
          );
        })}
      </div>

      {/* 72h Evidence Timeout Indicator */}
      {currentStatus === 'EVIDENCE' && dispute.evidence_deadline && (
        <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-900 flex items-center justify-between">
          <span className="flex items-center gap-1 font-semibold">
            <Clock className="w-3.5 h-3.5 text-amber-700" />
            <span>Evidence Collection Window: 72 Hours Max</span>
          </span>
          <span className="font-mono font-bold">
            Deadline: {new Date(dispute.evidence_deadline).toLocaleString('en-IN', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        </div>
      )}
    </div>
  );
};

