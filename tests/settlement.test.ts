import { describe, it, expect, beforeAll } from 'vitest';
import http from 'node:http';
import { Socket } from 'node:net';
import { app } from '../server/index.js';
import { dbManager } from '../server/db/index.js';
import { ledgerRepository, SEED_PARTIES } from '../server/db/ledgerRepository.js';
import { orderRepository } from '../server/db/orderRepository.js';
import { settlementRepository } from '../server/db/settlementRepository.js';
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

describe('Job-Work Settlements & Dual Approval Workflow API', () => {
  const jeweller = SEED_PARTIES[0]; // Lalit (JEWELLER)
  const karigarA = SEED_PARTIES[1]; // Ramesh (KARIGAR)
  const karigarB = SEED_PARTIES[2]; // Priya (KARIGAR)

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

  describe('1. 24K Bullion Gold Rates API', () => {
    it('should return current 24K bullion rate', async () => {
      const res = await requestApp({
        method: 'GET',
        url: '/api/rates/current'
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.rate_per_gram_24k).toBe('number');
      expect(res.body.data.rate_per_gram_24k).toBeGreaterThan(0);
      expect(res.body.data.currency).toBe('INR');
      expect(res.body.data.formatted).toMatch(/₹\s*[\d,]+/);
    });

    it('should retrieve rate history records', async () => {
      const res = await requestApp({
        method: 'GET',
        url: '/api/rates/history'
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('2. Settlement Preview Calculation (POST /api/settlements/calculate)', () => {
    it('should calculate accurate settlement metrics without writing to DB', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/settlements/calculate',
        headers: { authorization: `Bearer ${jewellerToken}` },
        body: {
          issuedGrams: 50.0,
          returnedGrams: 47.0,
          agreedWastagePct: 6.0,
          actualWastageGrams: 3.0,
          goldRatePerGram24K: 7420.0,
          makingChargePerGram: 650.0,
          advances: 10000.0
        }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const calc = res.body.data;
      expect(calc.allowed_wastage_grams).toBe(3.0);
      expect(calc.excess_wastage_grams).toBe(0);
      expect(calc.shortage_penalty).toBe(0);
      expect(calc.making_charges).toBe(30550); // 47g * 650
      expect(calc.net_payable).toBe(20550); // 30550 - 10000 advance
      expect(calc.line_items.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('3. Dual Approval Workflow (Jeweller Proposes -> Karigar Approves -> PAID)', () => {
    let createdSettlementId: string;

    it('should allow Jeweller to generate settlement and set status to AWAITING_KARIGAR', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/settlements',
        headers: { authorization: `Bearer ${jewellerToken}` },
        body: {
          karigar_id: karigarA.id,
          issued_grams: 80.0,
          returned_grams: 75.0,
          agreed_wastage_pct: 6.0,
          making_charge_per_gram: 700.0,
          advances: 15000.0
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('AWAITING_KARIGAR');
      expect(res.body.data.jeweller_approved_at).toBeDefined();
      expect(res.body.data.karigar_approved_at).toBeNull();
      expect(res.body.data.paid_at).toBeNull();
      expect(res.body.data.settlement_number).toMatch(/^SETTLE-2026-\d+/);

      createdSettlementId = res.body.data.id;
    });

    it('should allow Karigar A to approve their settlement and transition to PAID', async () => {
      const res = await requestApp({
        method: 'POST',
        url: `/api/settlements/${createdSettlementId}/approve`,
        headers: { authorization: `Bearer ${karigarAToken}` },
        body: {
          notes: 'सभी दरें व कटौती सही हैं। स्वीकृत।'
        }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PAID');
      expect(res.body.data.karigar_approved_at).toBeDefined();
      expect(res.body.data.paid_at).toBeDefined();
    });
  });

  describe('4. Dispute Flow (Karigar Flags Objection)', () => {
    let disputedSettlementId: string;

    beforeAll(async () => {
      // Create a new settlement proposal for testing dispute
      const res = await requestApp({
        method: 'POST',
        url: '/api/settlements',
        headers: { authorization: `Bearer ${jewellerToken}` },
        body: {
          karigar_id: karigarA.id,
          issued_grams: 100.0,
          returned_grams: 90.0,
          agreed_wastage_pct: 5.0,
          making_charge_per_gram: 800.0,
          advances: 50000.0
        }
      });

      expect(res.status).toBe(201);
      disputedSettlementId = res.body.data.id;
    });

    it('should allow Karigar to flag a dispute with a documented reason', async () => {
      const disputeReason = 'कटिंग और स्क्रैप का वजन गलत आंका गया है। 2.5 ग्राम स्क्रैप अलग दिया था।';
      const res = await requestApp({
        method: 'POST',
        url: `/api/settlements/${disputedSettlementId}/dispute`,
        headers: { authorization: `Bearer ${karigarAToken}` },
        body: { dispute_reason: disputeReason }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('DISPUTED');
      expect(res.body.data.dispute_reason).toBe(disputeReason);
    });
  });

  describe('5. Data Ownership & Security Enforcement', () => {
    it('should reject non-jeweller (Karigar) attempting to generate a settlement with 403', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/settlements',
        headers: { authorization: `Bearer ${karigarAToken}` },
        body: {
          karigar_id: karigarB.id,
          issued_grams: 20.0,
          returned_grams: 19.0,
          agreed_wastage_pct: 5.0,
          making_charge_per_gram: 500.0
        }
      });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should isolate settlements so Karigar B cannot see Karigar A settlements', async () => {
      const resA = await requestApp({
        method: 'GET',
        url: '/api/settlements',
        headers: { authorization: `Bearer ${karigarAToken}` }
      });

      const resB = await requestApp({
        method: 'GET',
        url: '/api/settlements',
        headers: { authorization: `Bearer ${karigarBToken}` }
      });

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      // Karigar A's results should only contain settlements for Karigar A
      for (const s of resA.body.data) {
        expect(s.karigar_id).toBe(karigarA.id);
      }

      // Karigar B's results should only contain settlements for Karigar B
      for (const s of resB.body.data) {
        expect(s.karigar_id).toBe(karigarB.id);
      }
    });

    it('should reject unauthenticated requests with 401', async () => {
      const res = await requestApp({
        method: 'GET',
        url: '/api/settlements'
      });

      expect(res.status).toBe(401);
    });
  });

  describe('6. Payment Execution Flow & Immutable Ledger ADJUSTMENT Entry', () => {
    let pendingSettlementId: string;

    beforeAll(async () => {
      // Create a settlement to be paid
      const res = await requestApp({
        method: 'POST',
        url: '/api/settlements',
        headers: { authorization: `Bearer ${jewellerToken}` },
        body: {
          karigar_id: karigarA.id,
          issued_grams: 60.0,
          returned_grams: 56.4,
          agreed_wastage_pct: 6.0,
          making_charge_per_gram: 700.0,
          advances: 12000.0
        }
      });

      expect(res.status).toBe(201);
      pendingSettlementId = res.body.data.id;
    });

    it('should reject non-jeweller (Karigar) attempting to mark settlement as paid with 403', async () => {
      const res = await requestApp({
        method: 'POST',
        url: `/api/settlements/${pendingSettlementId}/pay`,
        headers: { authorization: `Bearer ${karigarAToken}` },
        body: {
          payment_method: 'UPI',
          payment_reference: 'UPI-MOCK-9988'
        }
      });

      expect(res.status).toBe(403);
    });

    it('should execute payment, set status PAID, and write an immutable ADJUSTMENT block to ledger', async () => {
      const paymentRef = 'UPI-AXIS-9928172';
      const res = await requestApp({
        method: 'POST',
        url: `/api/settlements/${pendingSettlementId}/pay`,
        headers: { authorization: `Bearer ${jewellerToken}` },
        body: {
          payment_method: 'UPI',
          payment_reference: paymentRef,
          notes: 'Full payment cleared via Google Pay / UPI'
        }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.settlement.status).toBe('PAID');
      expect(res.body.data.settlement.payment_method).toBe('UPI');
      expect(res.body.data.settlement.payment_reference).toBe(paymentRef);
      expect(res.body.data.settlement.paid_at).toBeDefined();

      // Verify returned ADJUSTMENT ledger block
      const ledgerEntry = res.body.data.ledger_entry;
      expect(ledgerEntry).toBeDefined();
      expect(ledgerEntry.transaction_type).toBe('ADJUSTMENT');
      expect(ledgerEntry.status).toBe('CONFIRMED');
      expect(ledgerEntry.metadata.payment_method).toBe('UPI');
      expect(ledgerEntry.metadata.payment_reference).toBe(paymentRef);
      expect(ledgerEntry.metadata.settlement_id).toBe(pendingSettlementId);

      // Verify the ledger chain includes this ADJUSTMENT block
      const histRes = await requestApp({
        method: 'GET',
        url: '/api/ledger/history?limit=10',
        headers: { authorization: `Bearer ${jewellerToken}` }
      });

      expect(histRes.status).toBe(200);
      const adjustmentBlock = histRes.body.data.find(
        (b: any) => b.transaction_type === 'ADJUSTMENT' && b.metadata?.settlement_id === pendingSettlementId
      );
      expect(adjustmentBlock).toBeDefined();
      expect(adjustmentBlock.sequence_number).toBe(ledgerEntry.sequence_number);
    });
  });

  describe('7. Settlements Aging Report (GET /api/settlements/aging)', () => {
    it('should reject non-jeweller (Karigar) attempting to view aging report with 403', async () => {
      const res = await requestApp({
        method: 'GET',
        url: '/api/settlements/aging',
        headers: { authorization: `Bearer ${karigarAToken}` }
      });

      expect(res.status).toBe(403);
    });

    it('should return aging report with 0-7, 8-15, 16-30, >30 day buckets for Jeweller', async () => {
      const res = await requestApp({
        method: 'GET',
        url: '/api/settlements/aging',
        headers: { authorization: `Bearer ${jewellerToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const report = res.body.data;

      expect(report.as_of).toBeDefined();
      expect(typeof report.total_outstanding_count).toBe('number');
      expect(typeof report.total_outstanding_amount).toBe('number');
      expect(report.buckets).toBeDefined();
      expect(report.buckets['0-7']).toBeDefined();
      expect(report.buckets['8-15']).toBeDefined();
      expect(report.buckets['16-30']).toBeDefined();
      expect(report.buckets['>30']).toBeDefined();

      expect(Array.isArray(report.buckets['0-7'].settlements)).toBe(true);
    });
  });

  describe('8. Gold Rate Updates & Settlement Snapshotting', () => {
    it('should reject non-jeweller attempting to update gold rate with 403', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/rates',
        headers: { authorization: `Bearer ${karigarAToken}` },
        body: { rate_per_gram_24k: 7600.0 }
      });

      expect(res.status).toBe(403);
    });

    it('should allow Jeweller to update gold rate and persist rate history', async () => {
      const newRate = 7550.0;
      const res = await requestApp({
        method: 'POST',
        url: '/api/rates',
        headers: { authorization: `Bearer ${jewellerToken}` },
        body: { rate_per_gram_24k: newRate }
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rate_per_gram_24k).toBe(newRate);

      // Verify current rate returns updated value
      const currRes = await requestApp({
        method: 'GET',
        url: '/api/rates/current'
      });
      expect(currRes.status).toBe(200);
      expect(currRes.body.data.rate_per_gram_24k).toBe(newRate);

      // Verify rate history contains the updated entry
      const histRes = await requestApp({
        method: 'GET',
        url: '/api/rates/history'
      });
      expect(histRes.status).toBe(200);
      expect(histRes.body.data[0].rate_per_gram_24k).toBe(newRate);
    });

    it('should snapshot the active gold rate at settlement generation time', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/settlements',
        headers: { authorization: `Bearer ${jewellerToken}` },
        body: {
          karigar_id: karigarA.id,
          issued_grams: 30.0,
          returned_grams: 28.5,
          agreed_wastage_pct: 5.0,
          making_charge_per_gram: 600.0
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.data.gold_rate).toBe(7550.0);
    });
  });
});
