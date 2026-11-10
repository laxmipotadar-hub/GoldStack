import { describe, it, expect, beforeAll } from 'vitest';
import http from 'node:http';
import { Socket } from 'node:net';
import { app } from '../server/index.js';
import { dbManager } from '../server/db/index.js';
import { ledgerRepository, SEED_PARTIES } from '../server/db/ledgerRepository.js';
import { verifyLedgerChain } from '../server/crypto/hashChain.js';
import { generateToken } from '../server/middleware/auth.js';
import { User, Role, LedgerEntry } from '../shared/types.js';

/**
 * In-memory Express request runner that tests routes without needing TCP socket permissions
 */
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

describe('Authentication & Data Ownership Access Control', () => {
  const jeweller = SEED_PARTIES[0]; // Lalit Jewellers
  const karigarA = SEED_PARTIES[1]; // Ramesh Soni
  const karigarB = SEED_PARTIES[2]; // Priya Goldsmith

  let jewellerToken: string;
  let karigarAToken: string;
  let karigarBToken: string;

  beforeAll(async () => {
    await dbManager.init();
    await ledgerRepository.init();

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

  describe('1. Phone + OTP Login Flow', () => {
    it('should generate and return mock OTP 123456 for phone number', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/auth/send-otp',
        body: { phone: '+91 98201 12345' }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.demoOtp).toBe('123456');
    });

    it('should reject login when incorrect OTP is provided', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/auth/verify-otp',
        body: { phone: '+91 98201 12345', otp: '999999' }
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid or expired OTP');
    });

    it('should successfully log in with demo OTP 123456 and issue JWT in cookie', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/auth/verify-otp',
        body: { phone: '+91 98201 12345', otp: '123456' }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.role).toBe('JEWELLER');
      expect(res.body.token).toBeDefined();

      // Check that Set-Cookie header contains httpOnly token
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie']).toContain('token=');
      expect(res.headers['set-cookie']).toContain('HttpOnly');
    });

    it('should verify current authenticated session via /api/auth/me', async () => {
      const res = await requestApp({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${jewellerToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.authenticated).toBe(true);
      expect(res.body.user.id).toBe(jeweller.id);
      expect(res.body.user.role).toBe('JEWELLER');
    });
  });

  describe('2. Unauthorized Access Rejection (401)', () => {
    it('should reject gold issuance when not authenticated', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/ledger/issue',
        body: {
          jeweller_id: jeweller.id,
          karigar_id: karigarA.id,
          weight_grams: 50.0,
          purity_karat: 22,
          signature_jeweller: 'data:image/png;base64,sig'
        }
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Authentication required');
    });

    it('should reject balance lookup when not authenticated', async () => {
      const res = await requestApp({
        method: 'GET',
        url: `/api/ledger/balance/${karigarA.id}`
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Authentication required');
    });

    it('should reject transaction history when not authenticated', async () => {
      const res = await requestApp({
        method: 'GET',
        url: '/api/ledger/history'
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3. Data Ownership Enforcement (Karigar Isolation & Role Guards)', () => {
    it('should prevent Karigar A from reading Karigar B balance (403 Forbidden)', async () => {
      const res = await requestApp({
        method: 'GET',
        url: `/api/ledger/balance/${karigarB.id}`,
        headers: { authorization: `Bearer ${karigarAToken}` }
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Karigars can only view their own gold custody balance');
    });

    it('should allow Karigar A to view their own balance', async () => {
      const res = await requestApp({
        method: 'GET',
        url: `/api/ledger/balance/${karigarA.id}`,
        headers: { authorization: `Bearer ${karigarAToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.karigar_id).toBe(karigarA.id);
    });

    it('should prevent Karigar A from querying Karigar B history (403 Forbidden)', async () => {
      const res = await requestApp({
        method: 'GET',
        url: `/api/ledger/history?karigar_id=${karigarB.id}`,
        headers: { authorization: `Bearer ${karigarAToken}` }
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Karigars can only view their own ledger transactions');
    });

    it('should strictly isolate ledger history to Karigar A when querying without explicit filter', async () => {
      const res = await requestApp({
        method: 'GET',
        url: '/api/ledger/history',
        headers: { authorization: `Bearer ${karigarAToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      for (const block of res.body.data) {
        expect(block.karigar_id).toBe(karigarA.id);
      }
    });

    it('should reject a Karigar attempting to issue gold vouchers (403 Forbidden)', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/ledger/issue',
        headers: { authorization: `Bearer ${karigarAToken}` },
        body: {
          jeweller_id: jeweller.id,
          karigar_id: karigarB.id,
          weight_grams: 25.0,
          purity_karat: 22,
          signature_jeweller: 'data:image/png;base64,sig'
        }
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Only registered jewellers can issue gold vouchers');
    });

    it('should allow authenticated Jeweller to issue gold voucher', async () => {
      const res = await requestApp({
        method: 'POST',
        url: '/api/ledger/issue',
        headers: { authorization: `Bearer ${jewellerToken}` },
        body: {
          jeweller_id: jeweller.id,
          karigar_id: karigarA.id,
          order_id: 'ORD-AUTH-TEST',
          weight_grams: 15.0,
          purity_karat: 22,
          signature_jeweller: 'data:image/png;base64,sample-signature'
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jeweller_id).toBe(jeweller.id);
      expect(res.body.data.status).toBe('PENDING_CONFIRMATION');
    });
  });

  describe('4. SQLite Persistence & 12 Seed Blocks Integrity', () => {
    it('should have 12 or more blocks in the SQLite store on boot', async () => {
      const entries = await ledgerRepository.getAllEntriesForVerification();
      expect(entries.length).toBeGreaterThanOrEqual(12);

      const result = verifyLedgerChain(entries);
      expect(result.isValid).toBe(true);
      expect(result.totalBlocks).toBe(entries.length);
    });
  });
});
