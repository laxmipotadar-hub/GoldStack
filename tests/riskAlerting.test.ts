import { describe, it, expect, beforeAll, vi } from 'vitest';
import http from 'node:http';
import { Socket } from 'node:net';
import { app } from '../server/index.js';
import { dbManager } from '../server/db/index.js';
import { ledgerRepository, SEED_PARTIES } from '../server/db/ledgerRepository.js';
import { orderRepository } from '../server/db/orderRepository.js';
import { generateToken } from '../server/middleware/auth.js';
import { notificationService, ConsoleMockSmsChannel, INotificationChannel, NotificationPayload } from '../server/services/notificationService.js';
import { addDaysToDate } from '../shared/cpmEngine.js';

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

describe('Delay-Risk Alerting & Escalation Management (3.2 Engine)', () => {
  const jeweller = SEED_PARTIES[0]; // Lalit Soni
  const karigar = SEED_PARTIES[1]; // Ramesh Soni
  const karigar2 = SEED_PARTIES[2]; // Priya Goldsmith

  let jewellerToken: string;
  let karigarToken: string;

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

    karigarToken = generateToken({
      id: karigar.id,
      role: 'KARIGAR',
      name: karigar.name,
      phone: karigar.phone,
      businessName: karigar.businessName
    });
  });

  describe('1. Pluggable Notification Channel Interface & SMS Console Output', () => {
    it('should implement the INotificationChannel interface and format exact console SMS output', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      const mockPayload: NotificationPayload = {
        recipientId: karigar.id,
        recipientRole: 'KARIGAR',
        orderId: 'test-order-1',
        orderNumber: 'ORD-TEST-99',
        occasionType: 'WEDDING',
        daysToOccasion: 5,
        message: 'Critical stage setting delayed',
        urgencyLevel: 'WARNING'
      };

      const consoleChannel = new ConsoleMockSmsChannel();
      expect(consoleChannel.name).toBe('CONSOLE_SMS');

      const success = await consoleChannel.send(mockPayload);
      expect(success).toBe(true);

      // Verify exact required console log format: [SMS→karigar] Order #X at risk, 5 days to wedding
      expect(consoleSpy).toHaveBeenCalledWith(
        '[SMS→karigar] Order #ORD-TEST-99 at risk, 5 days to wedding'
      );

      consoleSpy.mockRestore();
    });

    it('allows registering a custom external channel (e.g. mock Twilio / WhatsApp) without modifying call sites', async () => {
      let customChannelCalled = false;
      const customChannel: INotificationChannel = {
        name: 'CUSTOM_TEST_CHANNEL',
        send: async (payload) => {
          customChannelCalled = true;
          return true;
        }
      };

      notificationService.registerChannel(customChannel);
      const channels = notificationService.getChannels();
      expect(channels.some((c) => c.name === 'CUSTOM_TEST_CHANNEL')).toBe(true);

      await notificationService.notifyOrderRisk({
        recipientId: karigar.id,
        recipientRole: 'KARIGAR',
        orderId: 'test-order-custom',
        orderNumber: 'ORD-CUSTOM-1',
        occasionType: 'WEDDING',
        daysToOccasion: 4,
        message: 'Testing channel registry',
        urgencyLevel: 'WARNING'
      });

      expect(customChannelCalled).toBe(true);
    });
  });

  describe('2. Escalation State Machine (ON_TRACK → AT_RISK → DELAYED → ESCALATED)', () => {
    let testOrderId: string;
    let testOrderNumber: string;

    it('creates an order starting in ON_TRACK status and records state creation event in order_events', async () => {
      const today = new Date().toISOString().split('T')[0];
      const occasionDate = addDaysToDate(today, 28); // 28 days runway
      testOrderNumber = `ORD-ESCAL-${Date.now()}`;

      const res = await requestApp({
        method: 'POST',
        url: '/api/orders',
        headers: { cookie: `token=${jewellerToken}` },
        body: {
          order_number: testOrderNumber,
          karigar_id: karigar.id,
          customer_name: 'Devi & Vikrant Royal Vivah',
          occasion_type: 'WEDDING',
          occasion_date: occasionDate,
          design_complexity: 'MEDIUM',
          item_description: '22K Kundan Choker and Earrings',
          target_weight_grams: 85.0,
          delivery_buffer_days: 5
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      testOrderId = res.body.data.id;
      expect(res.body.data.status).toBe('ON_TRACK');

      // Verify state creation event recorded in order_events table
      const eventsRes = await requestApp({
        method: 'GET',
        url: `/api/orders/${testOrderId}/events`,
        headers: { cookie: `token=${jewellerToken}` }
      });

      expect(eventsRes.status).toBe(200);
      expect(eventsRes.body.success).toBe(true);
      expect(eventsRes.body.data.length).toBeGreaterThanOrEqual(1);

      const creationEvent = eventsRes.body.data.find((e: any) => e.from_status === 'NEW');
      expect(creationEvent).toBeDefined();
      expect(creationEvent.to_status).toBe('ON_TRACK');
      expect(creationEvent.actor_role).toBe('JEWELLER');
    });

    it('transitions ON_TRACK → AT_RISK and fires simulated SMS alert when milestone is delayed', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      // Get milestones for test order
      const getOrderRes = await requestApp({
        method: 'GET',
        url: `/api/orders/${testOrderId}`,
        headers: { cookie: `token=${jewellerToken}` }
      });

      const milestones = getOrderRes.body.data.milestones;
      expect(milestones.length).toBeGreaterThan(0);
      const firstMilestone = milestones[0];

      // Delay first milestone by 2 days (moderate delay within buffer)
      const delayRes = await requestApp({
        method: 'POST',
        url: `/api/orders/${testOrderId}/milestones/${firstMilestone.id}/delay`,
        headers: { cookie: `token=${jewellerToken}` },
        body: {
          delay_days: 2,
          reason: 'Casting wax pattern detailing refinement'
        }
      });

      expect(delayRes.status).toBe(200);
      expect(delayRes.body.data.status).toBe('AT_RISK');

      // Verify SMS console output: [SMS→karigar] Order #X at risk, 28 days to wedding
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[SMS→karigar\] Order #ORD-ESCAL-.* at risk, \d+ days to wedding/)
      );

      consoleSpy.mockRestore();

      // Verify event recorded in order_events
      const eventsRes = await requestApp({
        method: 'GET',
        url: `/api/orders/${testOrderId}/events`,
        headers: { cookie: `token=${jewellerToken}` }
      });

      const delayEvent = eventsRes.body.data.find((e: any) => e.to_status === 'AT_RISK');
      expect(delayEvent).toBeDefined();
      expect(delayEvent.trigger_reason).toContain('Casting wax pattern detailing refinement');
    });

    it('transitions AT_RISK → DELAYED when downstream cascade breaches the occasion buffer', async () => {
      const getOrderRes = await requestApp({
        method: 'GET',
        url: `/api/orders/${testOrderId}`,
        headers: { cookie: `token=${jewellerToken}` }
      });

      const secondMilestone = getOrderRes.body.data.milestones[1];

      // Delay heavily by 35 days (severely exceeding occasion buffer)
      const delayRes = await requestApp({
        method: 'POST',
        url: `/api/orders/${testOrderId}/milestones/${secondMilestone.id}/delay`,
        headers: { cookie: `token=${jewellerToken}` },
        body: {
          delay_days: 35,
          reason: 'Gemstone supply shipment delayed'
        }
      });

      expect(delayRes.status).toBe(200);
      expect(delayRes.body.data.status).toBe('DELAYED');
      expect(delayRes.body.data.buffer_days_remaining).toBeLessThan(0);
      expect(delayRes.body.data.is_at_risk).toBe(true);

      // Verify transition recorded in order_events
      const eventsRes = await requestApp({
        method: 'GET',
        url: `/api/orders/${testOrderId}/events`,
        headers: { cookie: `token=${jewellerToken}` }
      });

      const delayedTransition = eventsRes.body.data.find((e: any) => e.to_status === 'DELAYED');
      expect(delayedTransition).toBeDefined();
    });

    it('allows Jeweller to acknowledge escalation and transitions status DELAYED → ESCALATED', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      const ackRes = await requestApp({
        method: 'POST',
        url: `/api/orders/${testOrderId}/acknowledge-escalation`,
        headers: { cookie: `token=${jewellerToken}` },
        body: {
          notes: 'Assigned Master Goldsmith Ramesh and fast-tracked stone setting'
        }
      });

      expect(ackRes.status).toBe(200);
      expect(ackRes.body.success).toBe(true);
      expect(ackRes.body.data.status).toBe('ESCALATED');

      // Verify escalation resolution console announcement
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[SMS→karigar\] Order #ORD-ESCAL-.* escalation acknowledged by Lalit Soni.*, \d+ days to wedding/)
      );

      consoleSpy.mockRestore();

      // Verify event audit in order_events
      const eventsRes = await requestApp({
        method: 'GET',
        url: `/api/orders/${testOrderId}/events`,
        headers: { cookie: `token=${jewellerToken}` }
      });

      const escalatedEvent = eventsRes.body.data.find((e: any) => e.to_status === 'ESCALATED');
      expect(escalatedEvent).toBeDefined();
      expect(escalatedEvent.actor_role).toBe('JEWELLER');
      expect(escalatedEvent.trigger_reason).toContain('Assigned Master Goldsmith');
    });

    it('rejects Karigar attempting to acknowledge escalation (403 Role Restriction)', async () => {
      const ackRes = await requestApp({
        method: 'POST',
        url: `/api/orders/${testOrderId}/acknowledge-escalation`,
        headers: { cookie: `token=${karigarToken}` },
        body: { notes: 'Karigar self-acknowledgment should fail' }
      });

      expect(ackRes.status).toBe(403);
      expect(ackRes.body.success).toBe(false);
    });
  });

  describe('3. In-App Notifications API', () => {
    it('retrieves persistent in-app notifications for authenticated Karigar and marks them read', async () => {
      const notifsRes = await requestApp({
        method: 'GET',
        url: '/api/notifications',
        headers: { cookie: `token=${karigarToken}` }
      });

      expect(notifsRes.status).toBe(200);
      expect(notifsRes.body.success).toBe(true);
      expect(Array.isArray(notifsRes.body.data)).toBe(true);
      expect(notifsRes.body.data.length).toBeGreaterThan(0);

      const riskNotif = notifsRes.body.data.find((n: any) => n.title.includes('जोखिम')) || notifsRes.body.data[0];
      expect(riskNotif).toBeDefined();

      // Mark single notification read
      const markRes = await requestApp({
        method: 'POST',
        url: `/api/notifications/${riskNotif.id}/read`,
        headers: { cookie: `token=${karigarToken}` }
      });

      expect(markRes.status).toBe(200);
      expect(markRes.body.success).toBe(true);

      // Mark all read
      const markAllRes = await requestApp({
        method: 'POST',
        url: '/api/notifications/mark-all-read',
        headers: { cookie: `token=${karigarToken}` }
      });

      expect(markAllRes.status).toBe(200);
      expect(markAllRes.body.success).toBe(true);
    });
  });
});
