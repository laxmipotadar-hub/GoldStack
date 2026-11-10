import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { settlementRepository } from '../db/settlementRepository.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { calculateSettlement } from '../../shared/settlementCalculation.js';
import { SettlementStatus } from '../../shared/types.js';

export const settlementRouter = Router();
export const ratesRouter = Router();

const CreateSettlementSchema = z.object({
  order_id: z.string().optional().nullable(),
  karigar_id: z.string().min(1, 'Karigar ID is required'),
  issued_grams: z.number().positive('Issued weight must be positive'),
  returned_grams: z.number().min(0, 'Returned weight cannot be negative'),
  agreed_wastage_pct: z.number().min(0, 'Agreed wastage % cannot be negative'),
  actual_wastage_grams: z.number().optional(),
  making_charge_per_gram: z.number().min(0, 'Making charge must be non-negative'),
  advances: z.number().min(0).optional(),
  gold_value: z.number().min(0).optional(),
  purity_karat: z.number().min(1).max(24).optional(),
  notes: z.string().optional()
});

const CalculateSettlementSchema = z.object({
  issuedGrams: z.number().positive(),
  returnedGrams: z.number().min(0),
  agreedWastagePct: z.number().min(0),
  actualWastageGrams: z.number().optional(),
  goldRatePerGram24K: z.number().positive().optional(),
  purityKarat: z.number().min(1).max(24).optional(),
  makingChargePerGram: z.number().min(0),
  advances: z.number().min(0).optional(),
  goldValueComponent: z.number().min(0).optional()
});

const ApproveSettlementSchema = z.object({
  signature: z.string().optional(),
  notes: z.string().optional()
});

const DisputeSettlementSchema = z.object({
  dispute_reason: z.string().min(3, 'Dispute reason must be at least 3 characters')
});

const MarkSettlementPaidSchema = z.object({
  payment_method: z.enum(['UPI', 'BANK', 'CASH']),
  payment_reference: z.string().optional(),
  notes: z.string().optional()
});

const UpdateGoldRateSchema = z.object({
  rate_per_gram_24k: z.number().positive('Gold rate must be a positive number'),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional()
});

/**
 * GET /api/settlements
 * List settlements accessible to the authenticated party.
 * - Karigar only sees their own settlements.
 * - Jeweller sees all workshop settlements.
 */
settlementRouter.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as SettlementStatus | undefined;
    const order_id = req.query.order_id as string | undefined;

    const settlements = await settlementRepository.getSettlements({ status, order_id }, req.user);

    res.json({
      success: true,
      data: settlements
    });
  } catch (err: any) {
    console.error('[API] /settlements list error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch settlements' });
  }
});

/**
 * POST /api/settlements/calculate
 * Calculate preview settlement without writing to the database
 */
settlementRouter.post('/calculate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const parsed = CalculateSettlementSchema.parse(req.body);
    const rate = parsed.goldRatePerGram24K || (await settlementRepository.getCurrentGoldRate());

    const result = calculateSettlement({
      ...parsed,
      goldRatePerGram24K: rate
    });

    res.json({
      success: true,
      data: result
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: 'Invalid calculation input', errors: err.errors });
    }
    console.error('[API] /settlements/calculate error:', err);
    res.status(500).json({ success: false, message: err.message || 'Calculation failed' });
  }
});

/**
 * GET /api/settlements/aging
 * Outstanding settlements aging report (0-7, 8-15, 16-30, >30 days).
 * Jeweller-only access.
 */
settlementRouter.get('/aging', authenticateToken, requireRole('JEWELLER'), async (req: Request, res: Response) => {
  try {
    const report = await settlementRepository.getSettlementsAgingReport(req.user!);
    res.json({
      success: true,
      data: report
    });
  } catch (err: any) {
    console.error('[API] /settlements/aging error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to generate aging report' });
  }
});

/**
 * GET /api/settlements/:id
 * Retrieve a single settlement with full line-item breakdown
 */
settlementRouter.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const settlement = await settlementRepository.getSettlementById(req.params.id, req.user);
    if (!settlement) {
      return res.status(404).json({ success: false, message: 'Settlement not found or access denied' });
    }

    res.json({
      success: true,
      data: settlement
    });
  } catch (err: any) {
    console.error('[API] /settlements/:id error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch settlement' });
  }
});

/**
 * POST /api/settlements
 * Jeweller generates a new settlement proposal (Dual Confirmation Step 1 -> AWAITING_KARIGAR)
 */
settlementRouter.post('/', authenticateToken, requireRole('JEWELLER'), async (req: Request, res: Response) => {
  try {
    const parsed = CreateSettlementSchema.parse(req.body);
    const settlement = await settlementRepository.createSettlement(parsed, req.user!);

    res.status(201).json({
      success: true,
      data: settlement,
      message: `Settlement #${settlement.settlement_number} proposed successfully. Awaiting Karigar approval.`
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: err.errors });
    }
    console.error('[API] /settlements creation error:', err);
    res.status(400).json({ success: false, message: err.message || 'Failed to generate settlement' });
  }
});

/**
 * POST /api/settlements/:id/approve
 * Karigar (or counterparty) approves settlement -> transitions to PAID when both parties approve
 */
settlementRouter.post('/:id/approve', authenticateToken, async (req: Request, res: Response) => {
  try {
    const parsed = ApproveSettlementSchema.parse(req.body || {});
    const updated = await settlementRepository.approveSettlement(req.params.id, req.user!, parsed);

    res.json({
      success: true,
      data: updated,
      message: updated.status === 'PAID'
        ? `Settlement #${updated.settlement_number} finalized and marked PAID!`
        : `Settlement approval recorded.`
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: 'Invalid approval request', errors: err.errors });
    }
    console.error('[API] /settlements/:id/approve error:', err);
    res.status(400).json({ success: false, message: err.message || 'Failed to approve settlement' });
  }
});

/**
 * POST /api/settlements/:id/dispute
 * Karigar or counterparty disputes settlement with explanation
 */
settlementRouter.post('/:id/dispute', authenticateToken, async (req: Request, res: Response) => {
  try {
    const parsed = DisputeSettlementSchema.parse(req.body);
    const updated = await settlementRepository.disputeSettlement(req.params.id, req.user!, parsed);

    res.json({
      success: true,
      data: updated,
      message: `Settlement #${updated.settlement_number} marked DISPUTED.`
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: 'Invalid dispute payload', errors: err.errors });
    }
    console.error('[API] /settlements/:id/dispute error:', err);
    res.status(400).json({ success: false, message: err.message || 'Failed to dispute settlement' });
  }
});

/**
 * POST /api/settlements/:id/pay
 * Jeweller marks settlement as PAID with payment method (UPI/BANK/CASH) and reference number.
 * Writes corresponding ADJUSTMENT entry into the immutable gold ledger.
 */
settlementRouter.post('/:id/pay', authenticateToken, requireRole('JEWELLER'), async (req: Request, res: Response) => {
  try {
    const parsed = MarkSettlementPaidSchema.parse(req.body);
    const result = await settlementRepository.markSettlementPaid(req.params.id, req.user!, parsed);

    res.json({
      success: true,
      data: result,
      message: `Settlement #${result.settlement.settlement_number} marked PAID via ${parsed.payment_method}. ADJUSTMENT block #${result.ledger_entry.sequence_number} recorded in immutable ledger.`
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: 'Invalid payment payload', errors: err.errors });
    }
    console.error('[API] /settlements/:id/pay error:', err);
    res.status(400).json({ success: false, message: err.message || 'Payment execution failed' });
  }
});

/**
 * GET /api/rates/current
 * Returns current 24K bullion rate per gram (₹)
 */
ratesRouter.get('/current', async (_req: Request, res: Response) => {
  try {
    const rate = await settlementRepository.getCurrentGoldRate();
    res.json({
      success: true,
      data: {
        rate_per_gram_24k: rate,
        currency: 'INR',
        formatted: `₹ ${rate.toLocaleString('en-IN')}/g`,
        updated_at: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('[API] /rates/current error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch current rate' });
  }
});

/**
 * POST /api/rates
 * Jeweller updates the current 24K bullion rate per gram (₹) and records to rate history.
 */
ratesRouter.post('/', authenticateToken, requireRole('JEWELLER'), async (req: Request, res: Response) => {
  try {
    const parsed = UpdateGoldRateSchema.parse(req.body);
    const rateRecord = await settlementRepository.updateGoldRate(
      parsed.rate_per_gram_24k,
      req.user!,
      parsed.effective_date
    );

    res.status(201).json({
      success: true,
      data: rateRecord,
      message: `24K Bullion rate updated to ₹${rateRecord.rate_per_gram_24k.toLocaleString('en-IN')}/g successfully.`
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: 'Invalid rate payload', errors: err.errors });
    }
    console.error('[API] /rates update error:', err);
    res.status(400).json({ success: false, message: err.message || 'Failed to update bullion rate' });
  }
});

/**
 * GET /api/rates/history
 * Returns historical 24K bullion rates
 */
ratesRouter.get('/history', async (_req: Request, res: Response) => {
  try {
    const history = await settlementRepository.getGoldRateHistory();
    res.json({
      success: true,
      data: history
    });
  } catch (err: any) {
    console.error('[API] /rates/history error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch rate history' });
  }
});

