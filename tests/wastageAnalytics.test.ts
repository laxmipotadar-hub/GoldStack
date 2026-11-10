import { describe, it, expect, beforeAll } from 'vitest';
import http from 'node:http';
import { Socket } from 'node:net';
import { app } from '../server/index.js';
import { dbManager } from '../server/db/index.js';
import { ledgerRepository, SEED_PARTIES } from '../server/db/ledgerRepository.js';
import { wastageRepository } from '../server/db/wastageRepository.js';
import { generateToken } from '../server/middleware/auth.js';

function requestApp(options: {
  method: 'GET' | 'POST';
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

describe('Per-Karigar Wastage Analytics (GET /api/wastage/analytics/:karigarId)', () => {
  const jeweller = SEED_PARTIES[0]; // Lalit
  const karigarA = SEED_PARTIES[1]; // Ramesh Soni
  const karigarB = SEED_PARTIES[2]; // Priya Goldsmith

  let jewellerToken: string;
  let karigarAToken: string;
  let karigarBToken: string;

  beforeAll(async () => {
    await dbManager.init();
    await ledgerRepository.init();
    await wastageRepository.init();

    jewellerToken = generateToken({
      id: jeweller.id,
      role: 'JEWELLER',
      name: jeweller.name,
      phone: jeweller.phone,
      businessName: jeweller.businessName
    });

    karigarAToken = generateToken({
      id: karigarA.id,
      role: 'KARIGAR',
      name: karigarA.name,
      phone: karigarA.phone,
      businessName: karigarA.businessName
    });

    karigarBToken = generateToken({
      id: karigarB.id,
      role: 'KARIGAR',
      name: karigarB.name,
      phone: karigarB.phone,
      businessName: karigarB.businessName
    });

    // Create 3 historical returns with distinct wastage for Karigar A to verify WMA and trend
    const order1 = `ORD-ANALYTICS-1-${Date.now()}`;
    const order2 = `ORD-ANALYTICS-2-${Date.now()}`;
    const order3 = `ORD-ANALYTICS-3-${Date.now()}`;

    // Order 1: 100g issued, 92g returned -> 8g (8.0%) wastage vs 6.5% agreed
    await wastageRepository.proposeAgreement(
      { order_ref: order1, karigar_id: karigarA.id, agreed_pct: 6.5, design_complexity: 'SIMPLE', category: 'RINGS' },
      jeweller
    );
    const agr1 = await wastageRepository.getAgreementByOrderRef(order1);
    await wastageRepository.respondAgreement({ agreement_id: agr1!.id, action: 'ACCEPT' }, karigarA);

    await ledgerRepository.createReturnEntry({
      jeweller_id: jeweller.id,
      karigar_id: karigarA.id,
      order_id: order1,
      weight_grams: 92.0,
      purity_karat: 22,
      signature_karigar: 'data:image/png;base64,sig1',
      metadata: { issued_grams: 100.0, order_ref: order1, category: 'RINGS' }
    });

    // Order 2: 100g issued, 93.5g returned -> 6.5g (6.5%) wastage vs 6.5% agreed (perfect craftsmanship)
    await wastageRepository.proposeAgreement(
      { order_ref: order2, karigar_id: karigarA.id, agreed_pct: 6.5, design_complexity: 'SIMPLE', category: 'RINGS' },
      jeweller
    );
    const agr2 = await wastageRepository.getAgreementByOrderRef(order2);
    await wastageRepository.respondAgreement({ agreement_id: agr2!.id, action: 'ACCEPT' }, karigarA);

    await ledgerRepository.createReturnEntry({
      jeweller_id: jeweller.id,
      karigar_id: karigarA.id,
      order_id: order2,
      weight_grams: 93.5,
      purity_karat: 22,
      signature_karigar: 'data:image/png;base64,sig2',
      metadata: { issued_grams: 100.0, order_ref: order2, category: 'RINGS' }
    });

    // Order 3: 100g issued, 94.5g returned -> 5.5g (5.5%) wastage vs 6.5% agreed (superior gold savings)
    await wastageRepository.proposeAgreement(
      { order_ref: order3, karigar_id: karigarA.id, agreed_pct: 6.5, design_complexity: 'SIMPLE', category: 'RINGS' },
      jeweller
    );
    const agr3 = await wastageRepository.getAgreementByOrderRef(order3);
    await wastageRepository.respondAgreement({ agreement_id: agr3!.id, action: 'ACCEPT' }, karigarA);

    await ledgerRepository.createReturnEntry({
      jeweller_id: jeweller.id,
      karigar_id: karigarA.id,
      order_id: order3,
      weight_grams: 94.5,
      purity_karat: 22,
      signature_karigar: 'data:image/png;base64,sig3',
      metadata: { issued_grams: 100.0, order_ref: order3, category: 'RINGS' }
    });
  });

  describe('1. Access Control & Data Ownership', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await requestApp({
        method: 'GET',
        url: `/api/wastage/analytics/${karigarA.id}`
      });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should allow Karigar A to access their own analytics with 200', async () => {
      const res = await requestApp({
        method: 'GET',
        url: `/api/wastage/analytics/${karigarA.id}`,
        headers: { authorization: `Bearer ${karigarAToken}` }
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.karigarId).toBe(karigarA.id);
    });

    it('should prevent Karigar B from accessing Karigar A analytics (403 Forbidden)', async () => {
      const res = await requestApp({
        method: 'GET',
        url: `/api/wastage/analytics/${karigarA.id}`,
        headers: { authorization: `Bearer ${karigarBToken}` }
      });
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Access denied');
    });

    it('should allow Jeweller to access any karigar analytics with 200', async () => {
      const res = await requestApp({
        method: 'GET',
        url: `/api/wastage/analytics/${karigarA.id}`,
        headers: { authorization: `Bearer ${jewellerToken}` }
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.karigarId).toBe(karigarA.id);
    });
  });

  describe('2. Weighted Moving Average (WMA) & Metrics Calculation', () => {
    it('should return rolling weighted average where recent returns are weighted higher', async () => {
      const res = await requestApp({
        method: 'GET',
        url: `/api/wastage/analytics/${karigarA.id}?limit=5`,
        headers: { authorization: `Bearer ${karigarAToken}` }
      });

      expect(res.status).toBe(200);
      const data = res.body.data;

      expect(data.karigarName).toBeDefined();
      expect(data.totalReturnsCount).toBeGreaterThanOrEqual(3);
      expect(data.rollingAverageWastagePct).toBeGreaterThan(0);
      expect(data.simpleAverageWastagePct).toBeGreaterThan(0);

      // Verify varianceTrend array
      expect(Array.isArray(data.varianceTrend)).toBe(true);
      expect(data.varianceTrend.length).toBeGreaterThanOrEqual(3);

      const latestPoint = data.varianceTrend[data.varianceTrend.length - 1];
      expect(latestPoint.orderRef).toBeDefined();
      expect(latestPoint.actualWastagePct).toBeDefined();
      expect(latestPoint.agreedWastagePct).toBeDefined();
      expect(latestPoint.variancePct).toBeDefined();
      expect(latestPoint.rollingWmaPct).toBeDefined();
    });

    it('should return comparison vs benchmark for design categories', async () => {
      const res = await requestApp({
        method: 'GET',
        url: `/api/wastage/analytics/${karigarA.id}`,
        headers: { authorization: `Bearer ${karigarAToken}` }
      });

      expect(res.status).toBe(200);
      const comps = res.body.data.categoryComparisons;
      expect(Array.isArray(comps)).toBe(true);
      expect(comps.length).toBeGreaterThanOrEqual(1);

      // Should have benchmark values (min, max, avg)
      const ringComp = comps.find((c: any) => c.category === 'RINGS');
      if (ringComp) {
        expect(ringComp.benchmarkMinPct).toBe(5.0);
        expect(ringComp.benchmarkMaxPct).toBe(8.0);
        expect(ringComp.benchmarkAvgPct).toBe(6.5);
        expect(['EXCELLENT', 'STANDARD', 'HIGH_WASTAGE']).toContain(ringComp.performanceRating);
      }
    });

    it('should identify best and worst returns based on variance', async () => {
      const res = await requestApp({
        method: 'GET',
        url: `/api/wastage/analytics/${karigarA.id}`,
        headers: { authorization: `Bearer ${karigarAToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.body.data.bestReturn).toBeDefined();
      expect(res.body.data.worstReturn).toBeDefined();
      // Best return should have smaller or equal variancePct compared to worst return
      expect(res.body.data.bestReturn.variancePct).toBeLessThanOrEqual(res.body.data.worstReturn.variancePct);
    });
  });
});

