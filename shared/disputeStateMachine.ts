/**
 * Pure TypeScript Dispute State Machine for GoldStack
 * Defines deterministic transition table, role-based guardrails, and 72-hour evidence timeout rule.
 * Mirrors the order escalation pattern across workshop job-work.
 */

import { DisputeStatus, Role } from './types.js';

export const EVIDENCE_TIMEOUT_HOURS = 72; // 72 hours timeout for EVIDENCE -> auto-REVIEW

export interface TransitionRule {
  from: DisputeStatus;
  to: DisputeStatus;
  allowedRoles: (Role | 'SYSTEM')[];
  description: string;
}

/**
 * Transition Table defining all legal status progressions and mandatory role permissions.
 */
export const DISPUTE_TRANSITION_TABLE: TransitionRule[] = [
  // From OPENED
  {
    from: 'OPENED',
    to: 'EVIDENCE',
    allowedRoles: ['JEWELLER', 'KARIGAR', 'MEDIATOR', 'SYSTEM'],
    description: 'Parties open evidence submission window (72h timeout).'
  },
  {
    from: 'OPENED',
    to: 'REVIEW',
    allowedRoles: ['JEWELLER', 'KARIGAR', 'MEDIATOR'],
    description: 'Bypass evidence collection directly to joint fact review.'
  },
  {
    from: 'OPENED',
    to: 'CLOSED',
    allowedRoles: ['JEWELLER', 'KARIGAR', 'MEDIATOR'],
    description: 'Dispute withdrawn or dismissed before evidence phase.'
  },

  // From EVIDENCE
  {
    from: 'EVIDENCE',
    to: 'REVIEW',
    allowedRoles: ['JEWELLER', 'KARIGAR', 'MEDIATOR', 'SYSTEM'],
    description: 'Evidence window concluded or auto-advanced after 72h timeout.'
  },
  {
    from: 'EVIDENCE',
    to: 'MEDIATION',
    allowedRoles: ['JEWELLER', 'KARIGAR', 'MEDIATOR'],
    description: 'Escalate directly to formal Trade Guild mediation.'
  },
  {
    from: 'EVIDENCE',
    to: 'CLOSED',
    allowedRoles: ['JEWELLER', 'KARIGAR', 'MEDIATOR'],
    description: 'Dispute amicably settled during evidence collection.'
  },

  // From REVIEW
  {
    from: 'REVIEW',
    to: 'MEDIATION',
    allowedRoles: ['JEWELLER', 'KARIGAR', 'MEDIATOR'],
    description: 'Parties cannot reach consensus; escalate to neutral Trade Guild Mediator.'
  },
  {
    from: 'REVIEW',
    to: 'EVIDENCE',
    allowedRoles: ['MEDIATOR'],
    description: 'Mediator requests supplementary weighing receipts or hallmark photo evidence.'
  },
  {
    from: 'REVIEW',
    to: 'RESOLUTION_PROPOSED',
    allowedRoles: ['MEDIATOR'],
    description: 'Formal resolution terms drafted for dual acceptance.'
  },
  {
    from: 'REVIEW',
    to: 'CLOSED',
    allowedRoles: ['JEWELLER', 'KARIGAR', 'MEDIATOR'],
    description: 'Dispute resolved informally or dismissed during review.'
  },

  // From MEDIATION
  {
    from: 'MEDIATION',
    to: 'RESOLUTION_PROPOSED',
    allowedRoles: ['MEDIATOR'],
    description: 'Mediator formulates final binding resolution terms and penalties.'
  },
  {
    from: 'MEDIATION',
    to: 'REVIEW',
    allowedRoles: ['MEDIATOR'],
    description: 'Mediator sends dispute back to parties for factual clarification.'
  },
  {
    from: 'MEDIATION',
    to: 'CLOSED',
    allowedRoles: ['MEDIATOR'],
    description: 'Mediator closes claim as frivolous or settled privately.'
  },

  // From RESOLUTION_PROPOSED
  {
    from: 'RESOLUTION_PROPOSED',
    to: 'RESOLVED',
    allowedRoles: ['SYSTEM', 'MEDIATOR', 'JEWELLER', 'KARIGAR'],
    description: 'Both Jeweller and Karigar have accepted proposed terms; side-effects executed.'
  },
  {
    from: 'RESOLUTION_PROPOSED',
    to: 'MEDIATION',
    allowedRoles: ['JEWELLER', 'KARIGAR', 'MEDIATOR'],
    description: 'One or both parties object to terms; returns to active mediation.'
  },
  {
    from: 'RESOLUTION_PROPOSED',
    to: 'CLOSED',
    allowedRoles: ['MEDIATOR'],
    description: 'Terms rejected without counter-proposal; closed unresolved.'
  },

  // From RESOLVED
  {
    from: 'RESOLVED',
    to: 'CLOSED',
    allowedRoles: ['MEDIATOR', 'SYSTEM'],
    description: 'All financial adjustments and trust score penalties settled; archive dispute.'
  }
];

/**
 * Validates whether a state transition is legal according to the transition table and actor role.
 */
export function canTransitionDispute(
  currentStatus: DisputeStatus,
  targetStatus: DisputeStatus,
  actorRole: Role | 'SYSTEM'
): { allowed: boolean; reason?: string } {
  if (currentStatus === targetStatus) {
    return { allowed: false, reason: `Dispute is already in ${currentStatus} status.` };
  }

  if (currentStatus === 'CLOSED') {
    return { allowed: false, reason: 'Closed disputes are final and cannot be reopened.' };
  }

  const matchingRules = DISPUTE_TRANSITION_TABLE.filter(
    (r) => r.from === currentStatus && r.to === targetStatus
  );

  if (matchingRules.length === 0) {
    return {
      allowed: false,
      reason: `Illegal transition: Cannot transition dispute directly from ${currentStatus} to ${targetStatus}.`
    };
  }

  const authorizedRule = matchingRules.find((r) => r.allowedRoles.includes(actorRole));

  if (!authorizedRule) {
    const rolesList = matchingRules[0].allowedRoles.join(', ');
    return {
      allowed: false,
      reason: `Unauthorized: Role ${actorRole} cannot transition dispute from ${currentStatus} to ${targetStatus}. Required roles: [${rolesList}].`
    };
  }

  return { allowed: true };
}

/**
 * Computes 72-hour evidence submission deadline from start timestamp.
 */
export function computeEvidenceDeadline(fromTimestamp?: string): string {
  const start = fromTimestamp ? new Date(fromTimestamp) : new Date();
  const deadline = new Date(start.getTime() + EVIDENCE_TIMEOUT_HOURS * 60 * 60 * 1000);
  return deadline.toISOString();
}

/**
 * Checks whether an active EVIDENCE window has passed its 72-hour deadline.
 */
export function isEvidenceTimeoutExpired(
  status: DisputeStatus,
  deadline?: string | null,
  now: Date = new Date()
): boolean {
  if (status !== 'EVIDENCE' || !deadline) return false;
  return now.getTime() > new Date(deadline).getTime();
}
