import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { trustScoreRepository } from '../db/trustScoreRepository.js';
import { authenticateToken } from '../middleware/auth.js';
import { TRUST_CALCULATION_VERSION } from '../../shared/trustScoring.js';

export const trustScoreRouter = Router();

const UpdatePrivacySchema = z.object({
  is_public: z.boolean()
});

/**
 * POST /api/trust-score/recalculate
 * Recomputes Bayesian trust scores for all karigars across real system data
 */
trustScoreRouter.post('/recalculate', async (_req: Request, res: Response): Promise<void> => {
  try {
    const scores = await trustScoreRepository.recalculateAll();
    res.json({
      success: true,
      message: `Recalculated trust scores for ${scores.length} artisans.`,
      data: {
        recalculated_count: scores.length,
        scores,
        calculation_version: TRUST_CALCULATION_VERSION
      }
    });
  } catch (err: any) {
    console.error('[API] /trust-score/recalculate error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to recalculate trust scores' });
  }
});

/**
 * GET /api/trust-score
 * Lists all karigar trust scores (for Jeweller's decision list)
 */
trustScoreRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const scores = await trustScoreRepository.getAllTrustScores();
    res.json({
      success: true,
      data: scores
    });
  } catch (err: any) {
    console.error('[API] GET /trust-score error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to list trust scores' });
  }
});

/**
 * GET /api/trust-score/passport/:karigarId
 * Shareable public profile page endpoint with QR code
 */
trustScoreRouter.get('/passport/:karigarId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { karigarId } = req.params;
    const origin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
    const passport = await trustScoreRepository.getPublicPassport(karigarId, origin);

    res.json({
      success: true,
      data: passport
    });
  } catch (err: any) {
    if (err.message?.includes('private')) {
      res.status(403).json({ success: false, message: err.message });
      return;
    }
    console.error('[API] /trust-score/passport/:karigarId error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to generate artisan passport' });
  }
});

/**
 * PATCH /api/trust-score/:karigarId/privacy
 * Karigar controls visibility of their public passport via privacy toggle
 */
trustScoreRouter.patch('/:karigarId/privacy', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { karigarId } = req.params;
    const parsed = UpdatePrivacySchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid request body', errors: parsed.error.format() });
      return;
    }

    const updated = await trustScoreRepository.setPrivacy(karigarId, parsed.data.is_public, req.user!);
    res.json({
      success: true,
      message: `Artisan passport visibility updated to ${parsed.data.is_public ? 'PUBLIC' : 'PRIVATE'}.`,
      data: updated
    });
  } catch (err: any) {
    console.error('[API] /trust-score/:karigarId/privacy error:', err);
    const status = err.message?.includes('Access denied') ? 403 : 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to update passport privacy' });
  }
});

/**
 * GET /api/trust-score/:karigarId
 * Fetches composite + factor breakdown + total_orders for a specific karigar
 */
trustScoreRouter.get('/:karigarId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { karigarId } = req.params;
    const score = await trustScoreRepository.getTrustScore(karigarId);

    res.json({
      success: true,
      data: score
    });
  } catch (err: any) {
    console.error('[API] /trust-score/:karigarId error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch trust score' });
  }
});

