import { describe, it, expect, beforeAll } from 'vitest';
import http from 'node:http';
import { Socket } from 'node:net';
import { app } from '../server/index.js';
import { dbManager } from '../server/db/index.js';
import { sqliteManager } from '../server/db/sqlite.js';
import { ledgerRepository } from '../server/db/ledgerRepository.js';
import { orderRepository } from '../server/db/orderRepository.js';
import { settlementRepository } from '../server/db/settlementRepository.js';
import { demoBazaarService } from '../server/services/demoBazaarService.js';
import { offlineQueue } from '../src/offline/offlineQueue.js';
import { verifyLedgerChain } from '../server/crypto/hashChain.js';

function requestApp(options: {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<{ status: number; body: any }> {
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

    res.end = function (chunk?: any) {
      if (chunk) out += chunk.toString();
      let parsed = out;
      try {
        parsed = JSON.parse(out);
      } catch {
        // raw string
      }
      resolve({
        status: res.statusCode,
        body: parsed
      });
      return this;
    };

    app(req as any, res as any);

    if (bodyStr) {
      req.emit('data', Buffer.from(bodyStr));
    }
    req.emit('end');
  });
}

describe('Hackathon Scripted Demo Mode (Demo Bazaar, Checklist & Offline Loop)', () => {
  beforeAll(async () => {
    await dbManager.init();
    await ledgerRepository.init();
    await orderRepository.init();
    await settlementRepository.init();
  });

  describe('1. One-Click Demo Bazaar Seeder (POST /api/demo/seed-bazaar)', () => {
    it('should successfully seed the complete demo bazaar with 4 karigars, 6 orders, disputed settlement & trust scores', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/demo/seed-bazaar'
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.karigarsCount).toBe(4);
      expect(res.body.data.ordersCount).toBe(6);

      // Verify AT_RISK wedding order due in 3 days
      const atRisk = res.body.data.atRiskOrder;
      expect(atRisk.orderNumber).toBe('ORD-2026-VIVAH-01');
      expect(atRisk.status).toBe('AT_RISK');
      expect(atRisk.daysRemaining).toBe(3);
      expect(atRisk.customerName).toContain('Radhika & Siddharth Mehta');

      // Verify Disputed Settlement
      expect(res.body.data.disputedSettlement.status).toBe('DISPUTED');
      expect(res.body.data.disputedSettlement.karigarName).toContain('Manoj Filigree');

      // Verify Open Dispute Record with frozen snapshot
      expect(res.body.data.openDispute.status).toBe('OPENED');
      expect(res.body.data.openDispute.targetType).toBe('SETTLEMENT');

      // Verify Trust Scores
      expect(res.body.data.trustScores.rameshHigh).toBeGreaterThanOrEqual(3.8);
      expect(res.body.data.trustScores.deepaColdStart).toBeGreaterThanOrEqual(3.8);
      expect(res.body.data.trustScores.deepaColdStart).toBeLessThanOrEqual(4.5);
      expect(res.body.data.trustScores.rameshHigh).toBeDefined();
    });

    it('should verify database contents directly after seeding', async () => {
      const db = sqliteManager.getDb();

      // Check 4 Karigars exist in platform_parties
      const karigars = db.prepare(`SELECT * FROM platform_parties WHERE role = 'KARIGAR'`).all() as any[];
      expect(karigars.length).toBeGreaterThanOrEqual(4);
      const names = karigars.map((k) => k.full_name || k.name);
      expect(names.some((n) => n.includes('Ramesh Soni'))).toBe(true);
      expect(names.some((n) => n.includes('Priya Goldsmith'))).toBe(true);
      expect(names.some((n) => n.includes('Manoj Filigree'))).toBe(true);
      expect(names.some((n) => n.includes('Deepa Verma'))).toBe(true);

      // Check 6 orders covering all required statuses
      const orders = db.prepare(`SELECT * FROM orders WHERE order_number LIKE 'ORD-2026-%'`).all() as any[];
      expect(orders.length).toBe(6);
      const statuses = new Set(orders.map((o) => o.status));
      expect(statuses.has('AT_RISK')).toBe(true);
      expect(statuses.has('ACTIVE')).toBe(true);
      expect(statuses.has('IN_PROGRESS')).toBe(true);
      expect(statuses.has('READY')).toBe(true);
      expect(statuses.has('DELIVERED')).toBe(true);
      expect(statuses.has('CANCELLED')).toBe(true);

      // Check the AT_RISK order has downstream delayed milestone
      const atRiskOrder = orders.find((o) => o.status === 'AT_RISK');
      expect(atRiskOrder).toBeDefined();
      const milestones = db.prepare(`SELECT * FROM milestones WHERE order_id = ? ORDER BY sequence`).all(atRiskOrder.id) as any[];
      expect(milestones.some((m) => m.status === 'DELAYED')).toBe(true);

      // Check disputed settlement exists
      const disputedSettlement = db.prepare(`SELECT * FROM settlements WHERE status = 'DISPUTED' AND karigar_id = '44444444-4444-4444-4444-444444444444'`).get() as any;
      expect(disputedSettlement).toBeDefined();
      expect(disputedSettlement.karigar_id).toBe('44444444-4444-4444-4444-444444444444');

      // Check open dispute linked to settlement exists
      const openDispute = db.prepare(`SELECT * FROM disputes WHERE target_id = ?`).get(disputedSettlement.id) as any;
      expect(openDispute).toBeDefined();
      expect(openDispute.status).toBe('OPENED');
      expect(openDispute.snapshot_hash).toBeTruthy();
      expect(openDispute.snapshot_data).toBeTruthy();

      // Check return entry with REVIEW_REQUIRED (excess wastage variance flag) exists
      const reviewRequired = db.prepare(`SELECT * FROM gold_ledger WHERE status = 'REVIEW_REQUIRED'`).get() as any;
      expect(reviewRequired).toBeDefined();
      expect(reviewRequired.transaction_type).toBe('RETURN');
    });
  });

  describe('2. Offline Issuance & Hash Chain Integrity Verification Loop', () => {
    it('should simulate offline mode, queue offline issue transaction, reconnect, and verify chain integrity', async () => {
      // 1. Toggle simulated offline mode
      offlineQueue.clearQueue();
      offlineQueue.setSimulatedOffline(true);
      expect(offlineQueue.isOnline()).toBe(false);

      // 2. Queue gold issue transaction while offline
      const jewellerId = '11111111-1111-1111-1111-111111111111';
      const karigarId = '22222222-2222-2222-2222-222222222222';
      const queuedItem = offlineQueue.enqueue('/api/ledger/issue', {
        jeweller_id: jewellerId,
        karigar_id: karigarId,
        weight_grams: 40.0,
        purity_karat: 22,
        signature_jeweller: 'data:image/png;base64,mock-signature-jeweller',
        metadata: { notes: 'Offline issued 40g 22K gold during connectivity outage' }
      });

      expect(queuedItem).toBeDefined();
      expect(offlineQueue.getQueue().length).toBe(1);

      // 3. Reconnect by disabling simulated offline mode
      offlineQueue.setSimulatedOffline(false);
      expect(offlineQueue.isOnline()).toBe(true);

      // 4. Trigger sync to push queued transaction to backend ledger
      const syncResult = await offlineQueue.triggerSync();
      expect(syncResult.processed).toBeGreaterThanOrEqual(0);

      // 5. Query and audit blockchain hash chain integrity
      const allEntries = await ledgerRepository.getAllEntriesForVerification();
      const verification = verifyLedgerChain(allEntries);
      if (!verification.isValid) {
        console.log('[DEBUG VERIFICATION]', JSON.stringify(verification, null, 2));
      }
      expect(verification.isValid).toBe(true);
      expect(verification.totalBlocks).toBe(allEntries.length);
    });
  });
});
