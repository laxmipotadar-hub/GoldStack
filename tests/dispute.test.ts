import { describe, it, expect, beforeAll } from 'vitest';
import http from 'node:http';
import { Socket } from 'node:net';
import crypto from 'node:crypto';
import { app } from '../server/index.js';
import { dbManager } from '../server/db/index.js';
import { ledgerRepository, SEED_PARTIES } from '../server/db/ledgerRepository.js';
import { orderRepository } from '../server/db/orderRepository.js';
import { settlementRepository } from '../server/db/settlementRepository.js';
import { trustScoreRepository } from '../server/db/trustScoreRepository.js';
import { disputeRepository } from '../server/db/disputeRepository.js';
import { generateToken } from '../server/middleware/auth.js';
import {
  canTransitionDispute,
  computeEvidenceDeadline,
  isEvidenceTimeoutExpired,
  DISPUTE_TRANSITION_TABLE
} from '../shared/disputeStateMachine.js';
import { Dispute, DisputeStatus } from '../shared/types.js';

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

describe('Phase 6: Dispute System & Arbitration Engine', () => {
  const jeweller = SEED_PARTIES[0]; // Lalit Soni
  const karigar = SEED_PARTIES[1];  // Ramesh Soni
  const mediator = SEED_PARTIES[4]; // Vikramaditya Shreshthi

  let jewellerToken: string;
  let karigarToken: string;
  let mediatorToken: string;

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

    karigarToken = generateToken({
      id: karigar.id,
      name: karigar.name,
      role: 'KARIGAR',
      phone: karigar.phone,
      businessName: karigar.businessName
    });

    mediatorToken = generateToken({
      id: mediator.id,
      name: mediator.name,
      role: 'MEDIATOR',
      phone: mediator.phone,
      businessName: mediator.businessName
    });
  });

  // ==========================================
  // Section 1: State Machine & Transition Rules
  // ==========================================
  describe('1. Dispute State Machine & Transition Enforcement', () => {
    it('should reject illegal transitions across the transition table', () => {
      // Direct jump from OPENED to RESOLVED is forbidden
      expect(canTransitionDispute('OPENED', 'RESOLVED', 'JEWELLER').allowed).toBe(false);
      expect(canTransitionDispute('OPENED', 'RESOLVED', 'KARIGAR').allowed).toBe(false);
      expect(canTransitionDispute('OPENED', 'RESOLVED', 'MEDIATOR').allowed).toBe(false);

      // Direct jump from OPENED to RESOLUTION_PROPOSED is forbidden
      expect(canTransitionDispute('OPENED', 'RESOLUTION_PROPOSED', 'MEDIATOR').allowed).toBe(false);

      // Closed disputes cannot transition anywhere
      expect(canTransitionDispute('CLOSED', 'OPENED', 'MEDIATOR').allowed).toBe(false);
      expect(canTransitionDispute('CLOSED', 'REVIEW', 'JEWELLER').allowed).toBe(false);

      // Resolved disputes cannot jump back to opened
      expect(canTransitionDispute('RESOLVED', 'OPENED', 'KARIGAR').allowed).toBe(false);
    });

    it('should enforce role-specific permissions on dispute transitions', () => {
      // Proposing resolution is restricted to MEDIATOR
      expect(canTransitionDispute('REVIEW', 'RESOLUTION_PROPOSED', 'MEDIATOR').allowed).toBe(true);
      expect(canTransitionDispute('MEDIATION', 'RESOLUTION_PROPOSED', 'MEDIATOR').allowed).toBe(true);
      expect(canTransitionDispute('REVIEW', 'RESOLUTION_PROPOSED', 'JEWELLER').allowed).toBe(false);
      expect(canTransitionDispute('REVIEW', 'RESOLUTION_PROPOSED', 'KARIGAR').allowed).toBe(false);

      // Both parties and mediator can transition from OPENED to EVIDENCE or REVIEW
      expect(canTransitionDispute('OPENED', 'EVIDENCE', 'JEWELLER').allowed).toBe(true);
      expect(canTransitionDispute('OPENED', 'EVIDENCE', 'KARIGAR').allowed).toBe(true);
      expect(canTransitionDispute('OPENED', 'REVIEW', 'MEDIATOR').allowed).toBe(true);
    });

    it('should calculate 72-hour evidence window deadline and detect expiration', () => {
      const now = '2026-11-10T12:00:00.000Z';
      const deadline = computeEvidenceDeadline(now);
      const expected = new Date(new Date(now).getTime() + 72 * 60 * 60 * 1000).toISOString();
      expect(deadline).toBe(expected);

      // Not expired when deadline is in future
      const futureDeadline = new Date(Date.now() + 3600 * 1000).toISOString();
      expect(isEvidenceTimeoutExpired('EVIDENCE', futureDeadline)).toBe(false);

      // Expired when deadline is in the past
      const pastDeadline = new Date(Date.now() - 3600 * 1000).toISOString();
      expect(isEvidenceTimeoutExpired('EVIDENCE', pastDeadline)).toBe(true);

      // Does not trigger timeout check if status is already REVIEW or RESOLVED
      expect(isEvidenceTimeoutExpired('REVIEW', pastDeadline)).toBe(false);
    });
  });

  // ==========================================
  // Section 2: Snapshot Immutability & Evidence Integrity
  // ==========================================
  describe('2. Snapshot Immutability & Cryptographic Integrity', () => {
    let testOrder: any;
    let disputeOnOrder: Dispute;

    it('should capture a deterministic SHA-256 snapshot when creating a dispute on an order', async () => {
      // Create a test order first
      testOrder = await orderRepository.createOrder({
        karigar_id: karigar.id,
        customer_name: 'Aditi Roy (Bridal Haram)',
        occasion_type: 'WEDDING',
        occasion_date: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
        design_complexity: 'COMPLEX',
        item_description: '22K Royal Choker with rubies',
        target_weight_grams: 85.0
      }, {
        id: jeweller.id,
        role: 'JEWELLER',
        name: jeweller.name,
        phone: jeweller.phone,
        businessName: jeweller.businessName
      });

      // Jeweller raises dispute on the order
      disputeOnOrder = await disputeRepository.createDispute({
        target_type: 'ORDER',
        target_id: testOrder.id,
        category: 'TIMING',
        description: 'Karigar reporting delay exceeding agreed wedding buffer.'
      }, {
        id: jeweller.id,
        role: 'JEWELLER',
        name: jeweller.name,
        phone: jeweller.phone,
        businessName: jeweller.businessName
      });

      expect(disputeOnOrder.id).toBeDefined();
      expect(disputeOnOrder.status).toBe('OPENED');
      expect(disputeOnOrder.snapshot_hash).toBeDefined();
      expect(disputeOnOrder.snapshot_hash.length).toBe(64); // SHA-256 hex length
      expect(disputeOnOrder.snapshot_data).toBeDefined();
      expect(disputeOnOrder.snapshot_data.customer_name).toBe('Aditi Roy (Bridal Haram)');
    });

    it('should verify the cryptographic validity of the captured snapshot', async () => {
      const verification = await disputeRepository.verifyDisputeSnapshot(disputeOnOrder.id);
      expect(verification.isValid).toBe(true);
      expect(verification.expectedHash).toBe(disputeOnOrder.snapshot_hash);
      expect(verification.computedHash).toBe(disputeOnOrder.snapshot_hash);
    });

    it('should attach evidence files with SHA-256 and perceptual dHash integrity hashes', async () => {
      const evidence = await disputeRepository.addEvidence(
        disputeOnOrder.id,
        {
          file_url: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600',
          notes: 'Digital weighing scale readout showing +1.20g discrepancy'
        },
        {
          id: jeweller.id,
          role: 'JEWELLER',
          name: jeweller.name,
          phone: jeweller.phone,
          businessName: jeweller.businessName
        }
      );

      expect(evidence.id).toBeDefined();
      expect(evidence.file_hash).toBeDefined();
      expect(evidence.file_hash.length).toBe(64); // SHA-256
      expect(evidence.perceptual_hash).toBeDefined();
    });
  });

  // ==========================================
  // Section 3: Dual Acceptance & Resolution Side-Effects
  // ==========================================
  describe('3. Dual Acceptance & Side-Effects on Settlements & Trust Scores', () => {
    let settlement: any;
    let initialNetPayable: number;
    let disputeOnSettlement: Dispute;

    beforeAll(async () => {
      // 1. Create a test settlement
      settlement = await settlementRepository.createSettlement({
        karigar_id: karigar.id,
        issued_grams: 100.0,
        returned_grams: 88.0,
        agreed_wastage_pct: 10.0,
        making_charge_per_gram: 450,
        advances: 5000,
        notes: 'Wedding necklace job-work settlement'
      }, {
        id: jeweller.id,
        role: 'JEWELLER',
        name: jeweller.name,
        phone: jeweller.phone,
        businessName: jeweller.businessName
      });

      initialNetPayable = settlement.net_payable;

      // 2. Karigar raises a PAYMENT dispute on the settlement
      disputeOnSettlement = await disputeRepository.createDispute({
        target_type: 'SETTLEMENT',
        target_id: settlement.id,
        category: 'PAYMENT',
        description: 'Karigar disputes making charges rate: agreed was 500/g not 450/g.'
      }, {
        id: karigar.id,
        role: 'KARIGAR',
        name: karigar.name,
        phone: karigar.phone,
        businessName: karigar.businessName
      });
    });

    it('should transition dispute through review to MEDIATION', async () => {
      // Transition from OPENED to REVIEW
      await disputeRepository.transitionDispute(
        disputeOnSettlement.id,
        'REVIEW',
        {
          id: jeweller.id,
          role: 'JEWELLER',
          name: jeweller.name,
          phone: jeweller.phone,
          businessName: jeweller.businessName
        },
        'Jeweller reviewing the disputed settlement.'
      );

      // Transition from REVIEW to MEDIATION
      const transitioned = await disputeRepository.transitionDispute(
        disputeOnSettlement.id,
        'MEDIATION',
        {
          id: mediator.id,
          role: 'MEDIATOR',
          name: mediator.name,
          phone: mediator.phone,
          businessName: mediator.businessName
        },
        'Guild mediator intervened to resolve making charges discrepancy.'
      );

      expect(transitioned.status).toBe('MEDIATION');
    });

    it('should allow Mediator to propose resolution terms with penalty and settlement adjustments', async () => {
      const proposed = await disputeRepository.proposeResolution(
        disputeOnSettlement.id,
        {
          resolution_proposal: 'Settled at ₹475/g making charges. Deduct penalty from karigar trust record for undocumented rework.',
          resolution_notes: 'Settled at ₹475/g making charges. Deduct penalty from karigar trust record for undocumented rework.',
          at_fault_party: 'KARIGAR',
          penalty_points: 0.6,
          settlement_adjustment_amount: 2200 // Add ₹2,200 to settlement for higher making charges
        },
        {
          id: mediator.id,
          role: 'MEDIATOR',
          name: mediator.name,
          phone: mediator.phone,
          businessName: mediator.businessName
        }
      );

      expect(proposed.status).toBe('RESOLUTION_PROPOSED');
      expect(proposed.at_fault_party).toBe('KARIGAR');
      expect(proposed.penalty_points).toBe(0.6);
      expect(proposed.settlement_adjustment_amount).toBe(2200);
      expect(proposed.jeweller_accepted_at).toBeNull();
      expect(proposed.karigar_accepted_at).toBeNull();
    });

    it('should not resolve until BOTH jeweller and karigar accept the proposed terms', async () => {
      // 1. Jeweller accepts
      const jewellerAccept = await disputeRepository.respondResolution(
        disputeOnSettlement.id,
        'ACCEPT',
        {
          id: jeweller.id,
          role: 'JEWELLER',
          name: jeweller.name,
          phone: jeweller.phone,
          businessName: jeweller.businessName
        }
      );

      // Status must STILL be RESOLUTION_PROPOSED because Karigar has not yet accepted
      expect(jewellerAccept.status).toBe('RESOLUTION_PROPOSED');
      expect(jewellerAccept.jeweller_accepted_at).toBeDefined();
      expect(jewellerAccept.karigar_accepted_at).toBeNull();

      // Record pre-resolution trust score
      const preScoreRes = await trustScoreRepository.getTrustScore(karigar.id);
      const preScore = preScoreRes.composite_score;

      // 2. Karigar accepts
      const fullyResolved = await disputeRepository.respondResolution(
        disputeOnSettlement.id,
        'ACCEPT',
        {
          id: karigar.id,
          role: 'KARIGAR',
          name: karigar.name,
          phone: karigar.phone,
          businessName: karigar.businessName
        }
      );

      // Now both have accepted -> status is automatically RESOLVED!
      expect(fullyResolved.status).toBe('RESOLVED');
      expect(fullyResolved.resolved_at).toBeDefined();
      expect(fullyResolved.karigar_accepted_at).toBeDefined();

      // 3. Verify side-effect on Karigar trust score: penalty of 0.6 applied
      const postScoreRes = await trustScoreRepository.getTrustScore(karigar.id);
      expect(postScoreRes.composite_score).toBeLessThan(preScore);

      // 4. Verify side-effect on Settlement: net_payable adjusted
      const updatedSettlement = await settlementRepository.getSettlementById(settlement.id, {
        id: jeweller.id,
        role: 'JEWELLER',
        name: jeweller.name,
        phone: jeweller.phone,
        businessName: jeweller.businessName
      });
      expect(updatedSettlement?.net_payable).toBe(Number((initialNetPayable + 2200).toFixed(2)));
      expect(updatedSettlement?.line_items.some((li: any) => li.amount === 2200)).toBe(true);
    });
  });

  // ==========================================
  // Section 4: Full REST API Endpoints Verification
  // ==========================================
  describe('4. Full Dispute REST API Endpoints', () => {
    let apiDisputeId: string;
    let targetLedgerEntry: any;

    beforeAll(async () => {
      const history = await ledgerRepository.getHistory({ karigar_id: karigar.id, limit: 1 });
      targetLedgerEntry = history.data[0];
    });

    it('POST /api/disputes - should create a dispute via API with frozen snapshot', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/disputes',
        headers: { authorization: `Bearer ${jewellerToken}` },
        body: {
          target_type: 'LEDGER_ENTRY',
          target_id: targetLedgerEntry.id,
          category: 'WEIGHT',
          description: 'Scale calibration check showed 0.200g difference.'
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.dispute_number).toMatch(/^DISP-2026-/);
      expect(res.body.data.snapshot_hash).toBeDefined();
      apiDisputeId = res.body.data.id;
    });

    it('GET /api/disputes - should list disputes for authenticated party', async () => {
      const res = await requestApp({
        method: 'GET',
        url: '/api/disputes',
        headers: { authorization: `Bearer ${jewellerToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((d: any) => d.id === apiDisputeId);
      expect(found).toBeDefined();
    });

    it('GET /api/disputes/:id - should fetch dispute details with snapshot & evidence', async () => {
      const res = await requestApp({
        method: 'GET',
        url: `/api/disputes/${apiDisputeId}`,
        headers: { authorization: `Bearer ${jewellerToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.snapshot_data).toBeDefined();
      expect(res.body.data.snapshot_hash).toBeDefined();
    });

    it('POST /api/disputes/:id/messages - should post threaded chat message in dispute', async () => {
      const res = await requestApp({
        method: 'POST',
        url: `/api/disputes/${apiDisputeId}/messages`,
        headers: { authorization: `Bearer ${karigarToken}` },
        body: {
          message: 'The digital scale was tared with the tray weight included.'
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sender_role).toBe('KARIGAR');
      expect(res.body.data.message).toContain('tared with the tray weight');
    });

    it('POST /api/disputes/:id/transition - should reject illegal transition with 400', async () => {
      const res = await requestApp({
        method: 'POST',
        url: `/api/disputes/${apiDisputeId}/transition`,
        headers: { authorization: `Bearer ${karigarToken}` },
        body: {
          to_status: 'RESOLVED' // Illegal direct jump from OPENED to RESOLVED
        }
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Cannot transition dispute directly from OPENED to RESOLVED');
    });

    it('POST /api/disputes/:id/propose-resolution - non-mediators should be blocked with 403', async () => {
      const res = await requestApp({
        method: 'POST',
        url: `/api/disputes/${apiDisputeId}/propose-resolution`,
        headers: { authorization: `Bearer ${karigarToken}` }, // Karigar cannot propose resolution
        body: {
          resolution_proposal: 'Artisan wants to close dispute unilaterally.'
        }
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Access denied');
    });

    it('GET /api/disputes/:id/verify-snapshot - should verify snapshot cryptographic integrity', async () => {
      const res = await requestApp({
        method: 'GET',
        url: `/api/disputes/${apiDisputeId}/verify-snapshot`,
        headers: { authorization: `Bearer ${mediatorToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isValid).toBe(true);
    });
  });
});
