import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { disputeRepository } from '../db/disputeRepository.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

export const disputeRouter = Router();

const CreateDisputeSchema = z.object({
  target_type: z.enum(['LEDGER_ENTRY', 'ORDER', 'SETTLEMENT']),
  target_id: z.string().min(1, 'Target ID is required'),
  category: z.enum(['WEIGHT', 'QUALITY', 'TIMING', 'PAYMENT', 'OTHER']),
  description: z.string().min(5, 'Description must be at least 5 characters'),
  initial_evidence_url: z.string().optional(),
  initial_evidence_notes: z.string().optional()
});

const TransitionDisputeSchema = z.object({
  to_status: z.enum(['OPENED', 'EVIDENCE', 'REVIEW', 'MEDIATION', 'RESOLUTION_PROPOSED', 'RESOLVED', 'CLOSED']),
  reason: z.string().optional()
});

const AddEvidenceSchema = z.object({
  file_url: z.string().min(1, 'File URL is required'),
  file_hash: z.string().optional(),
  perceptual_hash: z.string().optional(),
  notes: z.string().optional()
});

const AddMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty')
});

const ProposeResolutionSchema = z.object({
  resolution_proposal: z.string().min(5, 'Resolution proposal terms required'),
  at_fault_party: z.enum(['JEWELLER', 'KARIGAR', 'SPLIT', 'NONE']).optional(),
  penalty_points: z.number().min(0).max(5).optional(),
  settlement_adjustment_amount: z.number().optional(),
  resolution_notes: z.string().optional()
});

const RespondResolutionSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT']),
  rejection_reason: z.string().optional()
});

/**
 * POST /api/disputes
 * Raises a new dispute and creates an immutable target snapshot with SHA-256 hash.
 */
disputeRouter.post('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = CreateDisputeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid dispute payload', errors: parsed.error.format() });
      return;
    }

    const dispute = await disputeRepository.createDispute(parsed.data, req.user!);
    res.status(201).json({
      success: true,
      message: `Dispute #${dispute.dispute_number} raised successfully.`,
      data: dispute
    });
  } catch (err: any) {
    console.error('[API] POST /disputes error:', err);
    const status = err.message?.includes('Access denied') ? 403 : 400;
    res.status(status).json({ success: false, message: err.message || 'Failed to raise dispute' });
  }
});

/**
 * GET /api/disputes
 * Lists disputes with role-based data isolation.
 */
disputeRouter.get('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const disputes = await disputeRepository.getDisputes({
      status: req.query.status as any,
      target_type: req.query.target_type as string,
      category: req.query.category as string
    }, req.user);

    res.json({
      success: true,
      data: disputes
    });
  } catch (err: any) {
    console.error('[API] GET /disputes error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to list disputes' });
  }
});

/**
 * GET /api/disputes/:id
 * Fetches dispute details with evidence, messages, and immutable snapshot.
 */
disputeRouter.get('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const dispute = await disputeRepository.getDisputeById(req.params.id, req.user);
    if (!dispute) {
      res.status(404).json({ success: false, message: `Dispute ${req.params.id} not found or access denied.` });
      return;
    }

    res.json({
      success: true,
      data: dispute
    });
  } catch (err: any) {
    console.error('[API] GET /disputes/:id error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch dispute' });
  }
});

/**
 * POST /api/disputes/:id/transition
 * Advances the dispute through the state machine.
 */
disputeRouter.post('/:id/transition', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = TransitionDisputeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid transition payload', errors: parsed.error.format() });
      return;
    }

    const updated = await disputeRepository.transitionDispute(
      req.params.id,
      parsed.data.to_status,
      req.user!,
      parsed.data.reason
    );

    res.json({
      success: true,
      message: `Dispute transitioned to ${parsed.data.to_status}.`,
      data: updated
    });
  } catch (err: any) {
    console.error('[API] POST /disputes/:id/transition error:', err);
    const status = err.message?.includes('Unauthorized') ? 403 : 400;
    res.status(status).json({ success: false, message: err.message || 'Transition failed' });
  }
});

/**
 * POST /api/disputes/:id/evidence
 * Uploads evidence file with cryptographic hash.
 */
disputeRouter.post('/:id/evidence', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = AddEvidenceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid evidence payload', errors: parsed.error.format() });
      return;
    }

    const evidence = await disputeRepository.addEvidence(req.params.id, parsed.data, req.user!);
    res.status(201).json({
      success: true,
      message: 'Evidence successfully attached to dispute.',
      data: evidence
    });
  } catch (err: any) {
    console.error('[API] POST /disputes/:id/evidence error:', err);
    res.status(400).json({ success: false, message: err.message || 'Failed to add evidence' });
  }
});

/**
 * POST /api/disputes/:id/messages
 * Adds threaded in-dispute chat message.
 */
disputeRouter.post('/:id/messages', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = AddMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid message payload', errors: parsed.error.format() });
      return;
    }

    const msg = await disputeRepository.addMessage(req.params.id, parsed.data.message, req.user!);
    res.status(201).json({
      success: true,
      data: msg
    });
  } catch (err: any) {
    console.error('[API] POST /disputes/:id/messages error:', err);
    res.status(400).json({ success: false, message: err.message || 'Failed to post message' });
  }
});

/**
 * POST /api/disputes/:id/propose-resolution
 * Mediator proposes formal resolution terms and side-effects.
 */
disputeRouter.post('/:id/propose-resolution', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = ProposeResolutionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid resolution proposal', errors: parsed.error.format() });
      return;
    }

    const updated = await disputeRepository.proposeResolution(req.params.id, parsed.data, req.user!);
    res.json({
      success: true,
      message: 'Resolution terms proposed and dispatched for dual party acceptance.',
      data: updated
    });
  } catch (err: any) {
    console.error('[API] POST /disputes/:id/propose-resolution error:', err);
    const status = err.message?.includes('Access denied') ? 403 : 400;
    res.status(status).json({ success: false, message: err.message || 'Failed to propose resolution' });
  }
});

/**
 * POST /api/disputes/:id/respond-resolution
 * Disputing party accepts or rejects proposed resolution terms.
 */
disputeRouter.post('/:id/respond-resolution', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = RespondResolutionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid response payload', errors: parsed.error.format() });
      return;
    }

    const updated = await disputeRepository.respondResolution(
      req.params.id,
      parsed.data.action,
      req.user!,
      parsed.data.rejection_reason
    );

    res.json({
      success: true,
      message: parsed.data.action === 'ACCEPT'
        ? (updated.status === 'RESOLVED' ? 'Both parties accepted terms. Dispute RESOLVED with side effects executed.' : 'Acceptance recorded. Awaiting counterparty acceptance.')
        : 'Proposal rejected. Reverted to MEDIATION.',
      data: updated
    });
  } catch (err: any) {
    console.error('[API] POST /disputes/:id/respond-resolution error:', err);
    const status = err.message?.includes('Access denied') ? 403 : 400;
    res.status(status).json({ success: false, message: err.message || 'Failed to respond to resolution' });
  }
});

/**
 * GET /api/disputes/:id/verify-snapshot
 * Cryptographically verifies that the frozen snapshot matches its SHA-256 hash.
 */
disputeRouter.get('/:id/verify-snapshot', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await disputeRepository.verifyDisputeSnapshot(req.params.id);
    res.json({
      success: true,
      data: result
    });
  } catch (err: any) {
    console.error('[API] GET /disputes/:id/verify-snapshot error:', err);
    res.status(400).json({ success: false, message: err.message || 'Verification failed' });
  }
});

