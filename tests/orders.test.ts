import { describe, it, expect, beforeAll } from 'vitest';
import http from 'node:http';
import { Socket } from 'node:net';
import { app } from '../server/index.js';
import { dbManager } from '../server/db/index.js';
import { ledgerRepository, SEED_PARTIES } from '../server/db/ledgerRepository.js';
import { orderRepository } from '../server/db/orderRepository.js';
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

describe('Customer Occasion Orders & Milestone CPM API', () => {
  const jeweller = SEED_PARTIES[0]; // Lalit
  const karigarA = SEED_PARTIES[1]; // Ramesh
  const karigarB = SEED_PARTIES[2]; // Priya

  let jewellerToken: string;
  let karigarAToken: string;
  let karigarBToken: string;

  beforeAll(async () => {
    await dbManager.init();
    await ledgerRepository.init();
    await orderRepository.init();

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

  describe('1. Order Creation & Reverse-Scheduled Milestones', () => {
    const testOrderNum = `ORD-TEST-${Date.now()}`;

    it('should create an order with auto-generated CPM milestones scaled by design complexity', async () => {
      const occasionDate = '2026-12-25'; // Wedding date
      const res = await requestApp({
        method: 'POST',
        url: '/api/orders',
        headers: { authorization: `Bearer ${jewellerToken}` },
        body: {
          order_number: testOrderNum,
          karigar_id: karigarA.id,
          customer_name: 'Radhika & Siddharth Mehta (Royal Vivah Haar)',
          occasion_type: 'WEDDING',
          occasion_date: occasionDate,
          design_complexity: 'COMPLEX', // 20 days total
          item_description: '22K Kundan Jadau Choker with Uncut Polki Diamonds',
          target_weight_grams: 120.0,
          delivery_buffer_days: 1
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const order = res.body.data;

      expect(order.order_number).toBe(testOrderNum);
      expect(order.occasion_type).toBe('WEDDING');
      expect(order.occasion_date).toBe(occasionDate);
      expect(order.design_complexity).toBe('COMPLEX');
      expect(order.customer_name).toBe('Radhika & Siddharth Mehta (Royal Vivah Haar)');

      // Verify milestones template generation
      expect(order.milestones).toHaveLength(6);
      expect(order.milestones[0].name).toContain('Design');
      expect(order.milestones[5].name).toContain('Delivery');

      // Verify reverse-scheduling: final delivery finishes 1 day before occasion date
      const finalMilestone = order.milestones[5];
      expect(finalMilestone.planned_date).toBe('2026-12-24');

      // Verify critical path is populated
      expect(order.critical_path).toBeDefined();
      expect(order.critical_path.length).toBeGreaterThan(0);
    });

    it('should reject a Karigar attempting to create an order (403 Forbidden)', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/orders',
        headers: { authorization: `Bearer ${karigarAToken}` },
        body: {
          karigar_id: karigarA.id,
          customer_name: 'Unauthorized Order',
          occasion_type: 'CEREMONY',
          occasion_date: '2026-12-30',
          design_complexity: 'SIMPLE'
        }
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Data Ownership: Jeweller vs Karigar Order Visibility', () => {
    it('should allow Jeweller to see all their workshop orders', async () => {
      const res = await requestApp({
        method: 'GET',
        url: '/api/orders',
        headers: { authorization: `Bearer ${jewellerToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      // Every returned order belongs to the jeweller
      for (const o of res.body.data) {
        expect(o.jeweller_id).toBe(jeweller.id);
      }
    });

    it('should strictly limit Karigar A to see ONLY orders assigned to Karigar A', async () => {
      const res = await requestApp({
        method: 'GET',
        url: '/api/orders',
        headers: { authorization: `Bearer ${karigarAToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      for (const o of res.body.data) {
        expect(o.karigar_id).toBe(karigarA.id);
        expect(o.karigar_id).not.toBe(karigarB.id);
      }
    });
  });

  describe('3. Milestone Completion & Progress Transitions', () => {
    it('should mark milestone completed and advance downstream stage to IN_PROGRESS', async () => {
      const orderNum = `ORD-STAGE-${Date.now()}`;
      const createRes = await requestApp({
        method: 'POST',
        url: '/api/orders',
        headers: { authorization: `Bearer ${jewellerToken}` },
        body: {
          order_number: orderNum,
          karigar_id: karigarA.id,
          customer_name: 'Kavita Singhal',
          occasion_type: 'WEDDING',
          occasion_date: '2026-12-28',
          design_complexity: 'SIMPLE'
        }
      });
      const order = createRes.body.data;
      const m1 = order.milestones[0];
      const m2 = order.milestones[1];

      expect(m1.status).toBe('IN_PROGRESS');
      expect(m2.status).toBe('PENDING');

      // Complete milestone 1
      const completeRes = await requestApp({
        method: 'POST',
        url: `/api/orders/${order.id}/milestones/${m1.id}/complete`,
        headers: { authorization: `Bearer ${karigarAToken}` },
        body: { notes: 'CAD 3D wax model approved by bride' }
      });

      expect(completeRes.status).toBe(200);
      const updatedOrder = completeRes.body.data;

      const updatedM1 = updatedOrder.milestones.find((m: any) => m.id === m1.id);
      const updatedM2 = updatedOrder.milestones.find((m: any) => m.id === m2.id);

      expect(updatedM1.status).toBe('COMPLETED');
      expect(updatedM1.actual_date).toBeDefined();
      expect(updatedM2.status).toBe('IN_PROGRESS'); // Advanced!
    });
  });

  describe('4. Delay Cascade Recomputation & AT_RISK Trigger', () => {
    it('should auto-recompute downstream milestones and flag order AT_RISK if delivery slips past occasion date', async () => {
      // Create order with occasion date close to total duration
      const orderNum = `ORD-RISK-${Date.now()}`;
      const occasionDate = '2026-11-25'; // Very tight window

      const createRes = await requestApp({
        method: 'POST',
        url: '/api/orders',
        headers: { authorization: `Bearer ${jewellerToken}` },
        body: {
          order_number: orderNum,
          karigar_id: karigarA.id,
          customer_name: 'Meera Rajput (Bridal Choker)',
          occasion_type: 'WEDDING',
          occasion_date: occasionDate,
          design_complexity: 'SIMPLE', // 7 days duration
          delivery_buffer_days: 1
        }
      });
      const order = createRes.body.data;
      const m2 = order.milestones[1]; // Gold Melting & Casting

      // Introduce a 5-day delay on casting (e.g. ingot refining delay)
      const delayRes = await requestApp({
        method: 'POST',
        url: `/api/orders/${order.id}/milestones/${m2.id}/delay`,
        headers: { authorization: `Bearer ${jewellerToken}` },
        body: {
          delay_days: 5,
          reason: 'Refinery delayed 22K pure alloy delivery'
        }
      });

      expect(delayRes.status).toBe(200);
      const updated = delayRes.body.data;

      // When pushed by 5 days, delivery exceeds the occasionDate
      expect(updated.is_at_risk).toBe(true);
      expect(['AT_RISK', 'DELAYED']).toContain(updated.status);

      // Milestone 2 and all subsequent milestones must be shifted forward
      const updatedM2 = updated.milestones.find((m: any) => m.id === m2.id);
      expect(updatedM2.status).toBe('DELAYED');
    });
  });
});

