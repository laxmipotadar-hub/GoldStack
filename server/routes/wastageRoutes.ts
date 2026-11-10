import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { wastageRepository } from '../db/wastageRepository.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { DesignComplexity } from '../../shared/types.js';

export const wastageRouter = Router();

const ProposeAgreementSchema = z.object({
  order_ref: z.string().min(1, 'Order reference is required'),
  karigar_id: z.string().min(1, 'Karigar ID is required'),
  agreed_pct: z.number().positive('Agreed percentage must be greater than 0').max(50, 'Max allowable rate is 50%'),
  design_complexity: z.enum(['SIMPLE', 'MEDIUM', 'COMPLEX', 'VERY_COMPLEX']),
  category: z.string().optional(),
  signature_jeweller: z.string().optional()
});

const RespondAgreementSchema = z.object({
  agreement_id: z.string().min(1, 'Agreement ID is required'),
  action: z.enum(['ACCEPT', 'REJECT']),
  signature_karigar: z.string().optional(),
  rejection_reason: z.string().optional()
});

/**
 * GET /api/wastage/benchmarks
 * Returns standard industry ranges with smart suggested rate based on category & complexity
 */
wastageRouter.get('/benchmarks', async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;
    const complexity = req.query.complexity as DesignComplexity | undefined;

    const [benchmarks, suggestion] = await Promise.all([
      wastageRepository.getBenchmarks({ category, complexity }),
      wastageRepository.getBenchmarkSuggestion(category, complexity)
    ]);

    res.json({
      success: true,
      data: {
        ...suggestion,
        benchmarks
      }
    });
  } catch (err: any) {
    console.error('[API] /benchmarks error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch benchmarks' });
  }
});

/**
 * POST /api/wastage/propose
 * Jeweller proposes a wastage rate for an order.
 * State transition: -> PROPOSED. Requires Karigar acceptance.
 */
wastageRouter.post('/propose', authenticateToken, requireRole('JEWELLER'), async (req: Request, res: Response) => {
  try {
    const validated = ProposeAgreementSchema.parse(req.body);
    const agreement = await wastageRepository.proposeAgreement(
      {
        ...validated,
        jeweller_id: req.user!.id
      },
      req.user!
    );

    res.status(201).json({
      success: true,
      message: `Wastage agreement proposed for order ${agreement.order_ref} at ${agreement.agreed_pct}%. Awaiting artisan acceptance.`,
      data: agreement
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    console.error('[API] /propose error:', err);
    res.status(400).json({ success: false, message: err.message || 'Failed to propose agreement' });
  }
});

/**
 * POST /api/wastage/respond
 * Karigar accepts or rejects a proposed wastage rate.
 * State transition: PROPOSED -> ACCEPTED | REJECTED
 */
wastageRouter.post('/respond', authenticateToken, requireRole('KARIGAR'), async (req: Request, res: Response) => {
  try {
    const validated = RespondAgreementSchema.parse(req.body);
    const agreement = await wastageRepository.respondAgreement(validated, req.user!);

    res.json({
      success: true,
      message:
        agreement.status === 'ACCEPTED'
          ? `Wastage agreement accepted and locked at ${agreement.agreed_pct}%.`
          : `Wastage agreement rejected: ${agreement.rejection_reason || 'No reason provided'}.`,
      data: agreement
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    console.error('[API] /respond error:', err);
    res.status(400).json({ success: false, message: err.message || 'Failed to respond to agreement' });
  }
});

/**
 * GET /api/wastage/agreements
 * List all agreements relevant to the authenticated party
 */
wastageRouter.get('/agreements', authenticateToken, async (req: Request, res: Response) => {
  try {
    const agreements = await wastageRepository.getAgreements(req.user);
    res.json({
      success: true,
      data: agreements
    });
  } catch (err: any) {
    console.error('[API] /agreements error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/wastage/agreement/:orderRef
 * Retrieve agreement by order reference for Return Gold flow validation
 */
wastageRouter.get('/agreement/:orderRef', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { orderRef } = req.params;
    const agreement = await wastageRepository.getAgreementByOrderRef(orderRef);

    if (!agreement) {
      return res.status(404).json({
        success: false,
        message: `No wastage agreement found for order reference: ${orderRef}`
      });
    }

    // Role-based data ownership check
    if (req.user?.role === 'KARIGAR' && agreement.karigar_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view agreements assigned to your account.'
      });
    }

    res.json({
      success: true,
      data: agreement
    });
  } catch (err: any) {
    console.error('[API] /agreement/:orderRef error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/wastage/calculate-variance
 * Live helper to compute wastage variance against agreed rate
 */
wastageRouter.post('/calculate-variance', (req: Request, res: Response) => {
  try {
    const { issued_grams, returned_grams, agreed_pct } = req.body;
    if (issued_grams === undefined || returned_grams === undefined || agreed_pct === undefined) {
      return res.status(400).json({
        success: false,
        message: 'issued_grams, returned_grams, and agreed_pct are required'
      });
    }

    const variance = wastageRepository.calculateVariance(
      Number(issued_grams),
      Number(returned_grams),
      Number(agreed_pct)
    );

    res.json({
      success: true,
      data: variance
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/wastage/analytics/:karigarId
 * Per-Karigar wastage analytics:
 * - Rolling Weighted Moving Average (WMA) with recent returns weighted higher
 * - Variance trend over last N returns
 * - Comparison against standard benchmarks for artisan's design categories
 */
wastageRouter.get('/analytics/:karigarId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { karigarId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

    // Strict Data Ownership Control:
    // A Karigar can only view their own analytics; Jewellers can view any karigar.
    if (req.user?.role === 'KARIGAR' && req.user.id !== karigarId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Artisans are only permitted to view their own wastage analytics.'
      });
    }

    const analytics = await wastageRepository.getKarigarWastageAnalytics(karigarId, limit);

    res.json({
      success: true,
      data: analytics
    });
  } catch (err: any) {
    console.error('[API] /analytics/:karigarId error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to retrieve wastage analytics'
    });
  }
});


