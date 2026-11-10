import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ledgerRepository } from '../db/ledgerRepository.js';
import { verifyLedgerChain } from '../crypto/hashChain.js';
import {
  IssueGoldRequest,
  ReturnGoldRequest,
  ConfirmLedgerRequest,
  LedgerHistoryFilter,
  LedgerEntry,
  Role
} from '../../shared/types.js';
import { authenticateToken, optionalAuth, requireRole } from '../middleware/auth.js';

export const ledgerRouter = Router();

// Validation Schemas
const IssueGoldSchema = z.object({
  jeweller_id: z.string().min(5),
  karigar_id: z.string().min(5),
  order_id: z.string().nullable().optional(),
  weight_grams: z.number().positive('Weight must be greater than 0'),
  purity_karat: z.number().int().min(1).max(24),
  photo_evidence_url: z.string().nullable().optional(),
  perceptual_hash: z.string().nullable().optional(),
  signature_jeweller: z.string().min(10, 'Jeweller digital signature is required'),
  gps_lat: z.number().nullable().optional(),
  gps_lng: z.number().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  client_nonce: z.string().optional()
});

const ReturnGoldSchema = z.object({
  jeweller_id: z.string().min(5),
  karigar_id: z.string().min(5),
  order_id: z.string().nullable().optional(),
  weight_grams: z.number().positive('Weight must be greater than 0'),
  wastage_grams: z.number().nonnegative().optional(),
  scrap_grams: z.number().nonnegative().optional(),
  purity_karat: z.number().int().min(1).max(24),
  photo_evidence_url: z.string().nullable().optional(),
  perceptual_hash: z.string().nullable().optional(),
  signature_karigar: z.string().min(10, 'Karigar digital signature is required'),
  gps_lat: z.number().nullable().optional(),
  gps_lng: z.number().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  client_nonce: z.string().optional()
});

const ConfirmLedgerSchema = z.object({
  ledger_id: z.string().min(1, 'Ledger ID is required'),
  party: z.enum(['JEWELLER', 'KARIGAR']),
  signature: z.string().min(10, 'Signature is required'),
  action: z.enum(['CONFIRM', 'REJECT']),
  dispute_reason: z.string().optional()
});

/**
 * POST /api/ledger/issue
 * Issue gold to a karigar. Enforces JEWELLER role and data ownership.
 */
ledgerRouter.post('/issue', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'JEWELLER') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only registered jewellers can issue gold vouchers.'
      });
    }

    const validated = IssueGoldSchema.parse(req.body) as IssueGoldRequest;
    // Enforce server-side that the logged-in jeweller is the issuer
    validated.jeweller_id = req.user.id;

    const entry = await ledgerRepository.createIssueEntry(validated);
    res.status(201).json({
      success: true,
      message: 'Gold issuance entry recorded on immutable hash chain.',
      data: entry
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    console.error('[API] /issue error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to issue gold' });
  }
});

/**
 * POST /api/ledger/return
 * Return finished gold / scrap from karigar. Enforces KARIGAR identity.
 */
ledgerRouter.post('/return', authenticateToken, async (req: Request, res: Response) => {
  try {
    const validated = ReturnGoldSchema.parse(req.body) as ReturnGoldRequest;

    // Enforce that a karigar cannot return gold on behalf of another karigar
    if (req.user?.role === 'KARIGAR') {
      validated.karigar_id = req.user.id;
    }

    const entry = await ledgerRepository.createReturnEntry(validated);
    res.status(201).json({
      success: true,
      message: 'Gold return entry recorded on immutable hash chain.',
      data: entry
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    console.error('[API] /return error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to return gold' });
  }
});

/**
 * POST /api/ledger/confirm
 * Add second party digital signature (Dual Confirmation) with ownership validation
 */
ledgerRouter.post('/confirm', authenticateToken, async (req: Request, res: Response) => {
  try {
    const validated = ConfirmLedgerSchema.parse(req.body) as ConfirmLedgerRequest;
    // Align party with authenticated role
    if (req.user) {
      validated.party = req.user.role;
    }

    const updated = await ledgerRepository.confirmEntry(validated, req.user);
    res.json({
      success: true,
      message:
        validated.action === 'CONFIRM'
          ? 'Dual confirmation completed. Entry is permanently locked.'
          : 'Entry marked as DISPUTED with reason.',
      data: updated
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    console.error('[API] /confirm error:', err);
    res.status(400).json({ success: false, message: err.message || 'Confirmation failed' });
  }
});

/**
 * GET /api/ledger/balance/:karigarId
 * Get current real-time gold balance.
 * Data Ownership: Karigars can ONLY read their own balance.
 */
ledgerRouter.get('/balance/:karigarId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { karigarId } = req.params;

    if (req.user?.role === 'KARIGAR' && req.user.id !== karigarId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Karigars can only view their own gold custody balance.'
      });
    }

    const summary = await ledgerRepository.getBalance(karigarId, req.user);
    res.json({ success: true, data: summary });
  } catch (err: any) {
    console.error('[API] /balance error:', err);
    res.status(err.message?.includes('Access denied') ? 403 : 500).json({
      success: false,
      message: err.message || 'Failed to compute balance'
    });
  }
});

/**
 * GET /api/ledger/history
 * Get paginated transaction history with filters.
 * Data Ownership:
 * - Karigars can ONLY see transactions where they are the karigar.
 * - Jewellers can ONLY see transactions where they are the jeweller.
 */
ledgerRouter.get('/history', authenticateToken, async (req: Request, res: Response) => {
  try {
    // If a Karigar attempts to request another karigar's history explicitly, reject with 403
    if (req.user?.role === 'KARIGAR') {
      const requestedKarigar = req.query.karigar_id as string;
      if (requestedKarigar && requestedKarigar !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Karigars can only view their own ledger transactions.'
        });
      }
    }

    const filters: LedgerHistoryFilter = {
      karigar_id: (req.query.karigar_id as string) || undefined,
      jeweller_id: (req.query.jeweller_id as string) || undefined,
      order_id: (req.query.order_id as string) || undefined,
      transaction_type: (req.query.transaction_type as any) || undefined,
      status: (req.query.status as any) || undefined,
      from_date: (req.query.from_date as string) || undefined,
      to_date: (req.query.to_date as string) || undefined,
      search: (req.query.search as string) || undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 10,
      sort_order: (req.query.sort_order as any) || 'DESC'
    };

    const paginated = await ledgerRepository.getHistory(filters, req.user);
    res.json({ success: true, ...paginated });
  } catch (err: any) {
    console.error('[API] /history error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to retrieve history' });
  }
});

/**
 * POST /api/ledger/verify-chain
 * Walk the full cryptographic hash chain and verify block integrity
 */
ledgerRouter.post('/verify-chain', optionalAuth, async (_req: Request, res: Response) => {
  try {
    const entries = await ledgerRepository.getAllEntriesForVerification();
    const result = verifyLedgerChain(entries);
    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[API] /verify-chain error:', err);
    res.status(500).json({ success: false, message: err.message || 'Verification failed' });
  }
});

/**
 * POST /api/ledger/escalate-expired
 * Trigger 24-hour timeout auto-escalation check
 */
ledgerRouter.post('/escalate-expired', optionalAuth, async (_req: Request, res: Response) => {
  try {
    const escalated = await ledgerRepository.escalateExpiredEntries();
    res.json({
      success: true,
      message: `Checked 24h escalation. ${escalated.length} entries escalated.`,
      escalatedCount: escalated.length,
      escalated
    });
  } catch (err: any) {
    console.error('[API] /escalate-expired error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/ledger/parties
 * List available jewellers and karigars
 */
ledgerRouter.get('/parties', optionalAuth, async (_req: Request, res: Response) => {
  try {
    const parties = await ledgerRepository.getParties();
    res.json({ success: true, data: parties });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/ledger/simulate-tamper
 * Interactive audit demonstration
 */
ledgerRouter.post('/simulate-tamper', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { sequenceNumber, weightGrams } = req.body;
    const tampered = await ledgerRepository.simulateTampering(
      Number(sequenceNumber || 2),
      Number(weightGrams || 999.99)
    );
    res.json({
      success: true,
      message: `Block #${tampered.sequence_number} tampered! Run chain verification to test tamper detection.`,
      tamperedBlock: tampered
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/ledger/reset-chain
 * Restore chain back to genuine cryptographic state
 */
ledgerRouter.post('/reset-chain', optionalAuth, async (_req: Request, res: Response) => {
  try {
    await ledgerRepository.resetTamperedBlock(1);
    res.json({ success: true, message: 'Ledger chain restored to verified genuine state.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});
