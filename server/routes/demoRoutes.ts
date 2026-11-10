import { Router, Request, Response } from 'express';
import { demoBazaarService } from '../services/demoBazaarService.js';
import { authenticateToken } from '../middleware/auth.js';

export const demoRouter = Router();

/**
 * POST /api/demo/seed-bazaar
 * One-click demo seeder for the hackathon presentation.
 * Seeds 4 karigars, 6 orders across all statuses (including 1 AT_RISK wedding order due in 3 days),
 * 1 disputed settlement with open dispute & frozen snapshot, wastage variance flag,
 * and Bayesian trust scores.
 */
demoRouter.post('/seed-bazaar', async (_req: Request, res: Response) => {
  try {
    const result = await demoBazaarService.seedDemoBazaar();
    res.json({
      success: true,
      message: 'Demo Bazaar successfully seeded with 4 karigars, 6 orders, disputed settlement & trust scores!',
      data: result
    });
  } catch (err: any) {
    console.error('[DemoBazaar] Error seeding demo bazaar:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to seed demo bazaar'
    });
  }
});

/**
 * GET /api/demo/status
 * Health and status probe for demo mode.
 */
demoRouter.get('/status', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'Demo mode active',
    timestamp: new Date().toISOString()
  });
});

