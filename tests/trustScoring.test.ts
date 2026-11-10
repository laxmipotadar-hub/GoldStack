import { describe, it, expect, beforeAll } from 'vitest';
import http from 'node:http';
import { Socket } from 'node:net';
import { app } from '../server/index.js';
import { dbManager } from '../server/db/index.js';
import { ledgerRepository, SEED_PARTIES } from '../server/db/ledgerRepository.js';
import { orderRepository } from '../server/db/orderRepository.js';
import { settlementRepository } from '../server/db/settlementRepository.js';
import { trustScoreRepository } from '../server/db/trustScoreRepository.js';
import { generateToken } from '../server/middleware/auth.js';
import {
  calculateBayesianAverage,
  calculateKarigarTrustScore,
  verifyFactorWeights,
  DEFAULT_FACTOR_BENCHMARKS,
  FACTOR_WEIGHTS,
  TRUST_CALCULATION_VERSION
} from '../shared/trustScoring.js';
import { KarigarRawMetrics } from '../shared/types.js';

function requestApp(options: {
  method: 'GET' | 'POST' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const req = new http.IncomingMessage(socket);
    const bodyStr = options.body ? JSON.stringify(options.body) : '';

    req.method = options.method;
    req.url = options.url;
    req.headers = {
      'content-type': 'application/json',
      ...(options.headers || {})
    };

    if (bodyStr) {
      req.headers['content-length'] = Buffer.byteLength(bodyStr).toString();
    }

    const res = new http.ServerResponse(req);
    let out = '';

    res.write = function (chunk: any) {
      if (chunk) out += chunk.toString();
      return true;
    };

    (res as any).end = function (chunk: any) {
      if (chunk) out += chunk.toString();
      let parsed = null;
      try {
        parsed = out ? JSON.parse(out) : null;
      } catch {
        parsed = out;
      }
      resolve({ status: res.statusCode, headers: res.getHeaders() as Record<string, string>, body: parsed });
      return res;
    };

    app(req as any, res as any);

    if (bodyStr) {
      req.push(bodyStr);
      req.push(null);
    } else {
      req.push(null);
    }
  });
}

describe('Karigar Trust Scoring & Artisan Passport System', () => {
  const jeweller = SEED_PARTIES[0];
  const karigarA = SEED_PARTIES[1]; // Ramesh Soni
  const karigarB = SEED_PARTIES[2]; // Priya Goldsmith

  let jewellerToken: string;
  let karigarAToken: string;
  let karigarBToken: string;

  beforeAll(async () => {
    await dbManager.init();
    await ledgerRepository.init();
    await orderRepository.init();
    await settlementRepository.init();

    jewellerToken = generateToken({
      id: jeweller.id,
      name: jeweller.name,
      role: 'JEWELLER',
      phone: jeweller.phone,
      businessName: jeweller.businessName
    });

    karigarAToken = generateToken({
      id: karigarA.id,
      name: karigarA.name,
      role: 'KARIGAR',
      phone: karigarA.phone,
      businessName: karigarA.businessName
    });

    karigarBToken = generateToken({
      id: karigarB.id,
      name: karigarB.name,
      role: 'KARIGAR',
      phone: karigarB.phone,
      businessName: karigarB.businessName
    });
  });

  // ==========================================
  // Section 1: Pure Mathematical & Bayesian Scoring Verification
  // ==========================================
  describe('1. Pure Mathematical & Bayesian Cold-Start Engine', () => {
    it('should verify that all 5 factor weights sum strictly to 1.00 (100%)', () => {
      const { isValid, totalWeight } = verifyFactorWeights();
      expect(isValid).toBe(true);
      expect(totalWeight).toBe(1.0);
      expect(FACTOR_WEIGHTS.on_time_delivery).toBe(0.30);
      expect(FACTOR_WEIGHTS.wastage_adherence).toBe(0.25);
      expect(FACTOR_WEIGHTS.quality_acceptance).toBe(0.20);
      expect(FACTOR_WEIGHTS.dispute_frequency).toBe(0.15);
      expect(FACTOR_WEIGHTS.communication_responsiveness).toBe(0.10);
    });

    it('should calculate Bayesian average against hand-computed test cases (m=10)', () => {
      // Case 1: v=10, R=5.0, C=4.0 -> (10/20)*5 + (10/20)*4 = 2.5 + 2.0 = 4.50
      const case1 = calculateBayesianAverage(10, 5.0, 4.0, 10);
      expect(case1).toBe(4.50);

      // Case 2: v=30, R=5.0, C=4.0 -> (30/40)*5 + (10/40)*4 = 3.75 + 1.00 = 4.75
      const case2 = calculateBayesianAverage(30, 5.0, 4.0, 10);
      expect(case2).toBe(4.75);

      // Case 3: v=10, R=1.0, C=4.0 -> (10/20)*1 + (10/20)*4 = 0.5 + 2.0 = 2.50
      const case3 = calculateBayesianAverage(10, 1.0, 4.0, 10);
      expect(case3).toBe(2.50);

      // Case 4: Cold start (v=0) -> returns global benchmark exactly
      const case4 = calculateBayesianAverage(0, 5.0, 4.2, 10);
      expect(case4).toBe(4.20);

      // Case 5: Large sample (v=90, R=5.0, C=4.0) -> (90/100)*5 + (10/100)*4 = 4.5 + 0.4 = 4.90
      const case5 = calculateBayesianAverage(90, 5.0, 4.0, 10);
      expect(case5).toBe(4.90);
    });

    it('should evaluate cold-start artisan (0 orders, 0 returns, 0 transactions) to exact global benchmarks', () => {
      const coldMetrics: KarigarRawMetrics = {
        totalOrders: 0,
        onTimeOrders: 0,
        delayedOrders: 0,
        totalReturns: 0,
        withinToleranceReturns: 0,
        avgExcessWastagePct: 0,
        totalQcReviews: 0,
        passedQcReviews: 0,
        totalTransactions: 0,
        disputedTransactions: 0,
        totalConfirmations: 0,
        avgResponseHours: 4.0
      };

      const result = calculateKarigarTrustScore(coldMetrics);

      expect(result.is_cold_start).toBe(true);
      expect(result.total_orders).toBe(0);
      expect(result.calculation_version).toBe(TRUST_CALCULATION_VERSION);

      // Each factor must match standard prior benchmark
      expect(result.factors.on_time_delivery.bayesian_score).toBe(DEFAULT_FACTOR_BENCHMARKS.on_time_delivery); // 4.0
      expect(result.factors.wastage_adherence.bayesian_score).toBe(DEFAULT_FACTOR_BENCHMARKS.wastage_adherence); // 4.2
      expect(result.factors.quality_acceptance.bayesian_score).toBe(DEFAULT_FACTOR_BENCHMARKS.quality_acceptance); // 4.5
      expect(result.factors.dispute_frequency.bayesian_score).toBe(DEFAULT_FACTOR_BENCHMARKS.dispute_frequency); // 4.5
      expect(result.factors.communication_responsiveness.bayesian_score).toBe(DEFAULT_FACTOR_BENCHMARKS.communication_responsiveness); // 3.8

      // Hand computed composite cold start:
      // 0.30*4.0 + 0.25*4.2 + 0.20*4.5 + 0.15*4.5 + 0.10*3.8
      // = 1.20 + 1.05 + 0.90 + 0.675 + 0.38 = 4.205 -> 4.21
      expect(result.composite_score).toBe(4.21);
    });

    it('should compute Elite Tier (>= 4.80) for an artisan with a perfect track record', () => {
      const perfectMetrics: KarigarRawMetrics = {
        totalOrders: 40,
        onTimeOrders: 40,
        delayedOrders: 0,
        totalReturns: 40,
        withinToleranceReturns: 40,
        avgExcessWastagePct: 0,
        totalQcReviews: 40,
        passedQcReviews: 40,
        totalTransactions: 60,
        disputedTransactions: 0,
        totalConfirmations: 50,
        avgResponseHours: 0.5 // under 1 hour fast dual confirmation
      };

      const result = calculateKarigarTrustScore(perfectMetrics);

      expect(result.is_cold_start).toBe(false);
      expect(result.total_orders).toBe(40);
      expect(result.composite_score).toBeGreaterThanOrEqual(4.80);

      // All factors should be >= 4.75 due to Bayesian pull with v=40, R=5.0
      expect(result.factors.on_time_delivery.bayesian_score).toBe(4.80);
      expect(result.factors.wastage_adherence.bayesian_score).toBe(4.84);
      expect(result.factors.quality_acceptance.bayesian_score).toBe(4.90);
      expect(result.factors.dispute_frequency.bayesian_score).toBeGreaterThanOrEqual(4.90);
      expect(result.factors.communication_responsiveness.bayesian_score).toBeGreaterThanOrEqual(4.75);
    });

    it('should significantly penalize a dispute-heavy record and delayed performance', () => {
      const disputeMetrics: KarigarRawMetrics = {
        totalOrders: 20,
        onTimeOrders: 8, // 60% delays
        delayedOrders: 12,
        totalReturns: 20,
        withinToleranceReturns: 10, // 50% wastage violations
        avgExcessWastagePct: 6.5,
        totalQcReviews: 20,
        passedQcReviews: 12,
        totalTransactions: 30,
        disputedTransactions: 15, // 50% dispute rate!
        totalConfirmations: 15,
        avgResponseHours: 25.0 // expired / slow
      };

      const result = calculateKarigarTrustScore(disputeMetrics);

      expect(result.is_cold_start).toBe(false);
      // Dispute factor must drop well below prior benchmark 4.5
      expect(result.factors.dispute_frequency.bayesian_score).toBeLessThan(2.0);
      // Composite score should be dragged down significantly below 3.3
      expect(result.composite_score).toBeLessThanOrEqual(3.30);
    });
  });

  // ==========================================
  // Section 2: Endpoints & Real System Data Integration
  // ==========================================
  describe('2. Trust Score API Endpoints & Workshop Recalculation', () => {
    it('GET /api/trust-score/:karigarId should return composite, factor breakdown, and total_orders', async () => {
      const res = await requestApp({
        method: 'GET',
        url: `/api/trust-score/${karigarA.id}`
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const trust = res.body.data;
      expect(trust.karigar_id).toBe(karigarA.id);
      expect(typeof trust.composite_score).toBe('number');
      expect(trust.composite_score).toBeGreaterThan(0);
      expect(trust.composite_score).toBeLessThanOrEqual(5.0);
      expect(typeof trust.total_orders).toBe('number');

      // Check factor breakdown structure
      expect(trust.factors).toBeDefined();
      expect(trust.factors.on_time_delivery).toHaveProperty('bayesian_score');
      expect(trust.factors.on_time_delivery).toHaveProperty('raw_score');
      expect(trust.factors.on_time_delivery).toHaveProperty('weight', 0.30);
      expect(trust.factors.wastage_adherence).toHaveProperty('weight', 0.25);
      expect(trust.factors.quality_acceptance).toHaveProperty('weight', 0.20);
      expect(trust.factors.dispute_frequency).toHaveProperty('weight', 0.15);
      expect(trust.factors.communication_responsiveness).toHaveProperty('weight', 0.10);
      expect(trust.calculation_version).toBe(TRUST_CALCULATION_VERSION);
    });

    it('POST /api/trust-score/recalculate should recompute trust scores for all karigars', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/trust-score/recalculate',
        headers: { authorization: `Bearer ${jewellerToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.recalculated_count).toBeGreaterThanOrEqual(3);
      expect(res.body.data.scores.length).toBeGreaterThanOrEqual(3);
      expect(res.body.data.calculation_version).toBe(TRUST_CALCULATION_VERSION);
    });

    it('GET /api/trust-score should list all karigars sorted by composite score', async () => {
      const res = await requestApp({
        method: 'GET',
        url: '/api/trust-score'
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);

      // Verify sorted descending
      const scores = res.body.data;
      for (let i = 0; i < scores.length - 1; i++) {
        expect(scores[i].composite_score).toBeGreaterThanOrEqual(scores[i + 1].composite_score);
      }
    });
  });

  // ==========================================
  // Section 3: Shareable Public Profile Passport & Privacy Toggle
  // ==========================================
  describe('3. Public Artisan Passport & Privacy Controls', () => {
    it('GET /api/trust-score/passport/:karigarId should return public profile with QR code data URL', async () => {
      const res = await requestApp({
        method: 'GET',
        url: `/api/trust-score/passport/${karigarA.id}`
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const passport = res.body.data;
      expect(passport.karigar_id).toBe(karigarA.id);
      expect(passport.karigar_name).toBeDefined();
      expect(passport.composite_score).toBeGreaterThan(0);
      expect(passport.is_public).toBe(true);

      // Verify QR Code Data URL is generated by qrcode library
      expect(passport.qr_code_data_url).toBeDefined();
      expect(passport.qr_code_data_url).toMatch(/^data:image\/png;base64,/);
      expect(passport.passport_url).toContain(`/passport/${karigarA.id}`);
    });

    it('PATCH /api/trust-score/:karigarId/privacy should reject unauthorized karigar attempting to toggle someone else\'s passport', async () => {
      // Karigar B attempts to change Karigar A's privacy
      const res = await requestApp({
        method: 'PATCH',
        url: `/api/trust-score/${karigarA.id}/privacy`,
        headers: { authorization: `Bearer ${karigarBToken}` },
        body: { is_public: false }
      });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('PATCH /api/trust-score/:karigarId/privacy should allow karigar to toggle their passport to private', async () => {
      const res = await requestApp({
        method: 'PATCH',
        url: `/api/trust-score/${karigarA.id}/privacy`,
        headers: { authorization: `Bearer ${karigarAToken}` },
        body: { is_public: false }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.is_public).toBe(false);
    });

    it('GET /api/trust-score/passport/:karigarId should return 403 when passport is private', async () => {
      const res = await requestApp({
        method: 'GET',
        url: `/api/trust-score/passport/${karigarA.id}`
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('private');
    });

    it('PATCH /api/trust-score/:karigarId/privacy should restore passport to public', async () => {
      const res = await requestApp({
        method: 'PATCH',
        url: `/api/trust-score/${karigarA.id}/privacy`,
        headers: { authorization: `Bearer ${karigarAToken}` },
        body: { is_public: true }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.is_public).toBe(true);

      // Verify public access works again
      const passportRes = await requestApp({
        method: 'GET',
        url: `/api/trust-score/passport/${karigarA.id}`
      });
      expect(passportRes.status).toBe(200);
      expect(passportRes.body.data.is_public).toBe(true);
    });
  });
});

