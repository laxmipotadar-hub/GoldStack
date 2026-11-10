import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Scale,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  PlusCircle,
  Search,
  Filter,
  RefreshCw,
  FileText,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { Dispute, DisputeListResponse, DisputeStatus, Party, User } from '../../shared/types.js';
import { DisputeDetailModal } from './DisputeDetailModal.js';
import { RaiseDisputeModal } from './RaiseDisputeModal.js';

interface DisputeManagementPanelProps {
  currentParty: Party | User;
}

export const DisputeManagementPanel: React.FC<DisputeManagementPanelProps> = ({ currentParty }) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDisputeId, setSelectedDisputeId] = useState<string | null>(null);
  const [isRaiseModalOpen, setIsRaiseModalOpen] = useState(false);

  // Fetch disputes
  const { data: disputesRes, isLoading, refetch } = useQuery<DisputeListResponse>({
    queryKey: ['disputes', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      const res = await fetch(`/api/disputes?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load disputes');
      return res.json();
    },
    refetchInterval: 8000
  });

  const disputes = disputesRes?.data || [];

  const filtered = disputes.filter((d) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.dispute_number.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.target_id.toLowerCase().includes(q) ||
      d.jeweller_name?.toLowerCase().includes(q) ||
      d.karigar_name?.toLowerCase().includes(q)
    );
  });

  const activeCount = disputes.filter((d) => ['OPENED', 'EVIDENCE', 'REVIEW'].includes(d.status)).length;
  const mediationCount = disputes.filter((d) => ['MEDIATION', 'RESOLUTION_PROPOSED'].includes(d.status)).length;
  const resolvedCount = disputes.filter((d) => d.status === 'RESOLVED').length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-2xl bg-surface-container-lowest p-5 sm:p-6 shadow-sm border border-outline-variant/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-red-950/10 text-red-800 flex items-center justify-center shrink-0">
            <Scale className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-headline-sm text-lg sm:text-xl font-bold text-on-surface">
                Trade Dispute & Mediation Room (विवाद निवारण कक्ष)
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-900 border border-amber-500/40">
                Guild Arbitration
              </span>
            </div>
            <p className="text-xs text-on-surface-variant font-label-vernacular mt-0.5">
              अविनाशी साक्ष्य आधारित मध्यस्थता, अपरिवर्तनीय स्नैपशॉट एवं समाधान नियम
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="h-10 px-3 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-outline-variant/30"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setIsRaiseModalOpen(true)}
            className="h-10 px-4 bg-red-800 hover:bg-red-900 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Raise Dispute (आपत्ति दर्ज करें)</span>
          </button>
        </div>
      </div>

      {/* Counter Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/30 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-on-surface-variant font-bold block">Active Claims (साक्ष्य काल)</span>
            <span className="text-2xl font-extrabold text-on-surface">{activeCount}</span>
            <span className="text-[11px] text-amber-800 font-bold block mt-0.5">72h Evidence Window</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-800 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/30 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-on-surface-variant font-bold block">In Active Mediation (पंच कक्ष)</span>
            <span className="text-2xl font-extrabold text-secondary">{mediationCount}</span>
            <span className="text-[11px] text-secondary font-bold block mt-0.5">Mediator Hearing</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center">
            <Scale className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/30 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-on-surface-variant font-bold block">Resolved & Settled (सुलझे)</span>
            <span className="text-2xl font-extrabold text-success">{resolvedCount}</span>
            <span className="text-[11px] text-success font-bold block mt-0.5">Dual Accepted Terms</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-success-bg text-success flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/30 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Status Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'ALL', label: 'All Disputes (सभी)' },
            { id: 'OPENED', label: 'Opened' },
            { id: 'EVIDENCE', label: 'Evidence (72h)' },
            { id: 'MEDIATION', label: 'Mediation' },
            { id: 'RESOLUTION_PROPOSED', label: 'Proposed' },
            { id: 'RESOLVED', label: 'Resolved (पूर्ण)' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                statusFilter === tab.id
                  ? 'bg-on-surface text-surface shadow-xs'
                  : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Search dispute #, party..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-9 pr-3 text-xs bg-surface-container-low rounded-xl border border-outline-variant/40 focus:outline-none text-on-surface"
          />
        </div>
      </div>

      {/* Disputes List */}
      {isLoading ? (
        <div className="p-12 text-center text-on-surface-variant bg-surface-container-lowest rounded-2xl border border-outline-variant/30">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
          <p className="font-label-md text-sm">Loading dispute docket...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center text-on-surface-variant bg-surface-container-lowest rounded-2xl border border-outline-variant/30">
          <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-2" />
          <p className="font-headline-sm text-base text-on-surface mb-1">Zero Open Disputes Found</p>
          <p className="text-xs">All jewellery job-work records, occasion orders, and passbooks are in harmonious standing.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => {
            const isResolved = d.status === 'RESOLVED';
            const isMediation = ['MEDIATION', 'RESOLUTION_PROPOSED'].includes(d.status);

            return (
              <div
                key={d.id}
                className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-xs border border-outline-variant/30 hover:border-primary/50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-sm text-primary">
                      #{d.dispute_number}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-900 border border-amber-500/30 uppercase">
                      {d.category}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-container text-on-surface-variant font-bold">
                      {d.target_type}: {d.target_id.slice(0, 14)}...
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isResolved
                        ? 'bg-success-bg text-success border border-success/40'
                        : isMediation
                        ? 'bg-warn-bg text-warn border border-warn/40 animate-pulse'
                        : 'bg-chip text-ink'
                    }`}>
                      {d.status}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-on-surface line-clamp-2">
                    &ldquo;{d.description}&rdquo;
                  </p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-on-surface-variant pt-1">
                    <span>Jeweller: <strong>{d.jeweller_name}</strong></span>
                    <span>•</span>
                    <span>Artisan: <strong>{d.karigar_name}</strong></span>
                    <span>•</span>
                    <span>Evidence: <strong>{d.evidence.length} files</strong></span>
                    <span>•</span>
                    <span>Messages: <strong>{d.messages.length}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                  <button
                    onClick={() => setSelectedDisputeId(d.id)}
                    className="h-9 px-4 rounded-xl bg-surface-container hover:bg-primary hover:text-on-primary text-on-surface text-xs font-bold transition-all flex items-center gap-1.5 border border-outline-variant/30 shadow-xs"
                  >
                    <span>Open Mediation Hearing</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dispute Detail Modal */}
      {selectedDisputeId && (
        <DisputeDetailModal
          disputeId={selectedDisputeId}
          currentParty={currentParty}
          onClose={() => setSelectedDisputeId(null)}
        />
      )}

      {/* Standalone Raise Dispute Modal */}
      {isRaiseModalOpen && (
        <RaiseDisputeModal
          targetType="LEDGER_ENTRY"
          targetId="block-manual-dispute"
          onClose={() => setIsRaiseModalOpen(false)}
        />
      )}
    </div>
  );
};

