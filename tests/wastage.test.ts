import { describe, it, expect, beforeAll } from 'vitest';
import http from 'node:http';
import { Socket } from 'node:net';
import { app } from '../server/index.js';
import { dbManager } from '../server/db/index.js';
import { ledgerRepository, SEED_PARTIES } from '../server/db/ledgerRepository.js';
import { wastageRepository, SEED_BENCHMARKS } from '../server/db/wastageRepository.js';
import { generateToken } from '../server/middleware/auth.js';

function requestApp(options: {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body?: any;
  cookies?: Record<string, string>;
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
    if (options.cookies) {
      req.headers['cookie'] = Object.entries(options.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    }

    const res = new http.ServerResponse(req);
    let out = '';

    res.write = function (chunk: any) {
      if (chunk) out += chunk.toString();
      return true;
    };

    (res as any).end = function (chunk: any) {
      if (chunk) out += chunk.toString();
      const headers = (res.getHeaders ? res.getHeaders() : {}) as Record<string, any>;
      const setCookie = res.getHeader('set-cookie');
      if (setCookie) {
        headers['set-cookie'] = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
      }
      let parsed = null;
      try {
        parsed = out ? JSON.parse(out) : null;
      } catch {
        parsed = out;
      }
      resolve({ status: res.statusCode, headers: headers as Record<string, string>, body: parsed });
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

describe('Smart Wastage Agreement Engine', () => {
  const jeweller = SEED_PARTIES[0]; // Lalit Jewellers
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
  });

  describe('1. Variance Calculation Edge Cases', () => {
    it('under: should calculate negative variance when actual wastage is under agreed percentage', () => {
      // 100g issued, 95g returned -> actual loss = 5g (5.0%) vs 6.5% agreed
      const v = wastageRepository.calculateVariance(100.0, 95.0, 6.5);
      expect(v.actual_wastage_grams).toBe(5.0);
      expect(v.actual_wastage_pct).toBe(5.0);
      expect(v.allowed_wastage_grams).toBe(6.5);
      expect(v.variance_grams).toBe(-1.5);
      expect(v.variance_pct).toBe(-1.5);
      expect(v.tolerance_threshold_pct).toBe(8.5);
      expect(v.exceeds_tolerance).toBe(false);
      expect(v.review_required).toBe(false);
    });

    it('exact boundary 1: should calculate zero variance when actual equals agreed percentage', () => {
      // 100g issued, 93.5g returned -> actual loss = 6.5g (6.5%) vs 6.5% agreed
      const v = wastageRepository.calculateVariance(100.0, 93.5, 6.5);
      expect(v.actual_wastage_grams).toBe(6.5);
      expect(v.actual_wastage_pct).toBe(6.5);
      expect(v.allowed_wastage_grams).toBe(6.5);
      expect(v.variance_grams).toBe(0.0);
      expect(v.variance_pct).toBe(0.0);
      expect(v.exceeds_tolerance).toBe(false);
      expect(v.review_required).toBe(false);
    });

    it('exact boundary 2: should NOT flag review when exactly at agreed + 2.0% tolerance threshold', () => {
      // 100g issued, 91.5g returned -> actual loss = 8.5g (8.5%) vs 6.5% agreed (+2.0% threshold)
      const v = wastageRepository.calculateVariance(100.0, 91.5, 6.5);
      expect(v.actual_wastage_grams).toBe(8.5);
      expect(v.actual_wastage_pct).toBe(8.5);
      expect(v.tolerance_threshold_pct).toBe(8.5);
      expect(v.variance_pct).toBe(2.0);
      expect(v.exceeds_tolerance).toBe(false);
      expect(v.review_required).toBe(false);
    });

    it('excess: should flag review_required when actual exceeds agreed + 2.0% boundary', () => {
      // 100g issued, 90.0g returned -> actual loss = 10.0g (10.0%) vs 6.5% agreed (threshold 8.5%)
      const v = wastageRepository.calculateVariance(100.0, 90.0, 6.5);
      expect(v.actual_wastage_grams).toBe(10.0);
      expect(v.actual_wastage_pct).toBe(10.0);
      expect(v.variance_pct).toBe(3.5);
      expect(v.exceeds_tolerance).toBe(true);
      expect(v.review_required).toBe(true);
    });

    it('slight excess: should flag review_required even for 0.01% over the +2% threshold', () => {
      // 100g issued, 91.49g returned -> actual loss = 8.51g (8.51%) vs 6.5% agreed (threshold 8.50%)
      const v = wastageRepository.calculateVariance(100.0, 91.49, 6.5);
      expect(v.actual_wastage_pct).toBe(8.51);
      expect(v.tolerance_threshold_pct).toBe(8.5);
      expect(v.exceeds_tolerance).toBe(true);
      expect(v.review_required).toBe(true);
    });
  });

  describe('2. Agreement State Transitions (PROPOSED → ACCEPTED / REJECTED)', () => {
    const testOrderRef = `ORD-STATE-${Date.now()}`;

    it('should transition to PROPOSED when Jeweller proposes a rate', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/wastage/propose',
        headers: { authorization: `Bearer ${jewellerToken}` },
        body: {
          order_ref: testOrderRef,
          karigar_id: karigarA.id,
          agreed_pct: 7.25,
          design_complexity: 'MEDIUM',
          category: 'NECKLACES'
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.order_ref).toBe(testOrderRef);
      expect(res.body.data.status).toBe('PROPOSED');
      expect(res.body.data.agreed_pct).toBe(7.25);
      expect(res.body.data.signature_jeweller).toBeDefined();
      expect(res.body.data.signature_karigar).toBeNull();
    });

    it('should transition from PROPOSED to ACCEPTED when assigned Karigar signs', async () => {
      const existing = await wastageRepository.getAgreementByOrderRef(testOrderRef);
      expect(existing).toBeDefined();

      const res = await requestApp({
        method: 'POST',
        url: '/api/wastage/respond',
        headers: { authorization: `Bearer ${karigarAToken}` },
        body: {
          agreement_id: existing!.id,
          action: 'ACCEPT',
          signature_karigar: 'data:image/png;base64,sample_karigar_acceptance_sig'
        }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ACCEPTED');
      expect(res.body.data.signature_karigar).toBeDefined();
      expect(res.body.data.responded_at).toBeDefined();
    });

    it('should reject re-evaluating an already ACCEPTED agreement', async () => {
      const existing = await wastageRepository.getAgreementByOrderRef(testOrderRef);

      const res = await requestApp({
        method: 'POST',
        url: '/api/wastage/respond',
        headers: { authorization: `Bearer ${karigarAToken}` },
        body: {
          agreement_id: existing!.id,
          action: 'REJECT',
          rejection_reason: 'Want higher rate'
        }
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already in ACCEPTED status');
    });

    it('should transition from PROPOSED to REJECTED with reason', async () => {
      const rejectOrderRef = `ORD-REJ-${Date.now()}`;
      // 1. Propose
      const propRes = await requestApp({
        method: 'POST',
        url: '/api/wastage/propose',
        headers: { authorization: `Bearer ${jewellerToken}` },
        body: {
          order_ref: rejectOrderRef,
          karigar_id: karigarA.id,
          agreed_pct: 4.0,
          design_complexity: 'VERY_COMPLEX',
          category: 'TEMPLE_JEWELLERY'
        }
      });
      expect(propRes.status).toBe(201);
      const agreementId = propRes.body.data.id;

      // 2. Reject
      const rejRes = await requestApp({
        method: 'POST',
        url: '/api/wastage/respond',
        headers: { authorization: `Bearer ${karigarAToken}` },
        body: {
          agreement_id: agreementId,
          action: 'REJECT',
          rejection_reason: 'Temple jewellery requires at least 15% due to deep chasing loss'
        }
      });

      expect(rejRes.status).toBe(200);
      expect(rejRes.body.success).toBe(true);
      expect(rejRes.body.data.status).toBe('REJECTED');
      expect(rejRes.body.data.rejection_reason).toContain('at least 15%');
    });
  });

  describe('3. Unauthorized Access & Data Ownership Controls', () => {
    it('should reject unauthenticated attempt to propose agreement (401)', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/wastage/propose',
        body: {
          order_ref: 'ORD-UNAUTH',
          karigar_id: karigarA.id,
          agreed_pct: 6.0,
          design_complexity: 'SIMPLE'
        }
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject a Karigar attempting to propose a rate (403 Forbidden)', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/wastage/propose',
        headers: { authorization: `Bearer ${karigarAToken}` },
        body: {
          order_ref: 'ORD-KARIGAR-PROP',
          karigar_id: karigarA.id,
          agreed_pct: 6.0,
          design_complexity: 'SIMPLE'
        }
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Requires role: JEWELLER');
    });

    it('should reject a Jeweller attempting to respond to an agreement (403 Forbidden)', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/wastage/respond',
        headers: { authorization: `Bearer ${jewellerToken}` },
        body: {
          agreement_id: 'agr-seed-901',
          action: 'ACCEPT'
        }
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Requires role: KARIGAR');
    });

    it('should prevent Karigar B from responding to an agreement assigned to Karigar A (403/Access Denied)', async () => {
      // agr-seed-901 is assigned to karigarA (Ramesh)
      const res = await requestApp({
        method: 'POST',
        url: '/api/wastage/respond',
        headers: { authorization: `Bearer ${karigarBToken}` },
        body: {
          agreement_id: 'agr-seed-901',
          action: 'ACCEPT'
        }
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Access denied. You can only respond to wastage proposals addressed to your account');
    });
  });

  describe('4. Standard Benchmarks & Suggestions', () => {
    it('should return benchmark ranges for categories including rings, necklaces, bridal, temple', async () => {
      const res = await requestApp({
        method: 'GET',
        url: '/api/wastage/benchmarks'
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.benchmarks.length).toBeGreaterThanOrEqual(4);

      // Verify simple rings: 5-8%
      const ringBm = res.body.data.benchmarks.find((b: any) => b.category === 'RINGS');
      expect(ringBm).toBeDefined();
      expect(ringBm.min_pct).toBe(5.0);
      expect(ringBm.max_pct).toBe(8.0);

      // Verify bridal sets: 12-18%
      const bridalBm = res.body.data.benchmarks.find((b: any) => b.category === 'BRIDAL_SETS');
      expect(bridalBm).toBeDefined();
      expect(bridalBm.min_pct).toBe(12.0);
      expect(bridalBm.max_pct).toBe(18.0);

      // Verify temple jewellery: 15-22%
      const templeBm = res.body.data.benchmarks.find((b: any) => b.category === 'TEMPLE_JEWELLERY');
      expect(templeBm).toBeDefined();
      expect(templeBm.min_pct).toBe(15.0);
      expect(templeBm.max_pct).toBe(22.0);
    });

    it('should return tailored suggestion for category and complexity query', async () => {
      const res = await requestApp({
        method: 'GET',
        url: '/api/wastage/benchmarks?category=TEMPLE_JEWELLERY&complexity=VERY_COMPLEX'
      });

      expect(res.status).toBe(200);
      expect(res.body.data.min_pct).toBe(15.0);
      expect(res.body.data.max_pct).toBe(22.0);
      expect(res.body.data.suggested_pct).toBe(18.5);
    });
  });

  describe('5. Return Flow Integration & REVIEW_REQUIRED Enforcement', () => {
    const normalOrderRef = `ORD-RET-NORM-${Date.now()}`;
    const excessOrderRef = `ORD-RET-EXC-${Date.now()}`;

    beforeAll(async () => {
      // Set up accepted agreement for normal test order (6.5% agreed)
      await wastageRepository.proposeAgreement(
        {
          order_ref: normalOrderRef,
          karigar_id: karigarA.id,
          agreed_pct: 6.5,
          design_complexity: 'SIMPLE'
        },
        jeweller
      );
      const agr1 = await wastageRepository.getAgreementByOrderRef(normalOrderRef);
      await wastageRepository.respondAgreement({ agreement_id: agr1!.id, action: 'ACCEPT' }, karigarA);

      // Set up accepted agreement for excess test order (6.5% agreed)
      await wastageRepository.proposeAgreement(
        {
          order_ref: excessOrderRef,
          karigar_id: karigarA.id,
          agreed_pct: 6.5,
          design_complexity: 'SIMPLE'
        },
        jeweller
      );
      const agr2 = await wastageRepository.getAgreementByOrderRef(excessOrderRef);
      await wastageRepository.respondAgreement({ agreement_id: agr2!.id, action: 'ACCEPT' }, karigarA);
    });

    it('should record RETURN with status PENDING_CONFIRMATION when wastage is within tolerance', async () => {
      // 100g issued, 94.0g returned -> 6.0% actual loss (under agreed 6.5%)
      const res = await requestApp({
        method: 'POST',
        url: '/api/ledger/return',
        headers: { authorization: `Bearer ${karigarAToken}` },
        body: {
          jeweller_id: jeweller.id,
          karigar_id: karigarA.id,
          order_id: normalOrderRef,
          weight_grams: 94.0,
          purity_karat: 22,
          signature_karigar: 'data:image/png;base64,sample_return_sig',
          metadata: {
            issued_grams: 100.0,
            order_ref: normalOrderRef
          }
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING_CONFIRMATION');
      expect(res.body.data.metadata.reviewRequired).toBe(false);
      expect(res.body.data.metadata.variancePct).toBe(-0.5);
    });

    it('should flag RETURN with status REVIEW_REQUIRED when actual wastage exceeds agreed + 2.0%', async () => {
      // 100g issued, 90.0g returned -> 10.0% actual loss (> agreed 6.5% + 2% = 8.5% threshold)
      const res = await requestApp({
        method: 'POST',
        url: '/api/ledger/return',
        headers: { authorization: `Bearer ${karigarAToken}` },
        body: {
          jeweller_id: jeweller.id,
          karigar_id: karigarA.id,
          order_id: excessOrderRef,
          weight_grams: 90.0,
          purity_karat: 22,
          signature_karigar: 'data:image/png;base64,sample_return_sig',
          metadata: {
            issued_grams: 100.0,
            order_ref: excessOrderRef
          }
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('REVIEW_REQUIRED');
      expect(res.body.data.metadata.reviewRequired).toBe(true);
      expect(res.body.data.metadata.exceedsAllowedWastage).toBe(true);
      expect(res.body.data.metadata.agreedWastagePct).toBe(6.5);
      expect(res.body.data.metadata.actualWastagePct).toBe(10.0);
      expect(res.body.data.metadata.variancePct).toBe(3.5);
      expect(res.body.data.metadata.varianceGrams).toBe(3.5);
    });

    it('should allow Jeweller to review and confirm the REVIEW_REQUIRED entry', async () => {
      const allEntries = await ledgerRepository.getAllEntriesForVerification();
      const reviewEntry = allEntries.find((e) => e.order_id === excessOrderRef && e.status === 'REVIEW_REQUIRED');
      expect(reviewEntry).toBeDefined();

      const confirmRes = await requestApp({
        method: 'POST',
        url: '/api/ledger/confirm',
        headers: { authorization: `Bearer ${jewellerToken}` },
        body: {
          ledger_id: reviewEntry!.id,
          party: 'JEWELLER',
          signature: 'data:image/png;base64,jeweller_confirm_excess_sig',
          action: 'CONFIRM'
        }
      });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.success).toBe(true);
      expect(confirmRes.body.data.status).toBe('CONFIRMED');
      expect(confirmRes.body.data.confirmed_at).toBeDefined();
    });
  });
});

