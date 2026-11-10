import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ledgerRepository, SEED_PARTIES } from '../db/ledgerRepository.js';
import { generateToken, optionalAuth } from '../middleware/auth.js';
import { Role, User, SendOtpResponse, VerifyOtpResponse, AuthMeResponse } from '../../shared/types.js';

export const authRouter = Router();

const SendOtpSchema = z.object({
  phone: z.string().min(8, 'Valid phone number is required')
});

const VerifyOtpSchema = z.object({
  phone: z.string().min(8, 'Valid phone number is required'),
  otp: z.string().min(4, 'OTP is required'),
  role: z.enum(['JEWELLER', 'KARIGAR', 'MEDIATOR']).optional(),
  name: z.string().optional()
});

/**
 * Normalizes phone numbers for matching (removes non-digits, keeps last 10 digits)
 */
function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '').slice(-10);
}

/**
 * POST /api/auth/send-otp
 * Generates and stores OTP. Accepts "123456" in demo mode.
 */
authRouter.post('/send-otp', async (req: Request, res: Response) => {
  try {
    const { phone } = SendOtpSchema.parse(req.body);
    const demoOtp = '123456';
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Store in DB
    await ledgerRepository.saveOtp(phone, demoOtp, expiresAt);

    // Clear demo log
    console.log(`\n======================================================`);
    console.log(`[AUTH DEMO] Mock OTP generated for ${phone}: ${demoOtp} (Demo Mode)`);
    console.log(`======================================================\n`);

    res.json({
      success: true,
      message: `OTP sent successfully. Demo OTP: ${demoOtp}`,
      demoOtp,
      expiresInMinutes: 10
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    res.status(500).json({ success: false, message: err.message || 'Failed to send OTP' });
  }
});

/**
 * POST /api/auth/verify-otp
 * Validates OTP, authenticates party, sets httpOnly cookie, and returns JWT session
 */
authRouter.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const { phone, otp, role, name } = VerifyOtpSchema.parse(req.body);

    // Validate OTP (accepts "123456" for demo mode, or stored OTP)
    const isMockOtp = otp === '123456';
    const isStoredOtpValid = await ledgerRepository.verifyOtp(phone, otp);

    if (!isMockOtp && !isStoredOtpValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP. For demo mode, enter 123456.'
      });
    }

    // Find party by phone
    const normalizedInput = normalizePhone(phone);
    const allParties = await ledgerRepository.getParties();
    let party = allParties.find((p) => normalizePhone(p.phone) === normalizedInput);

    // If not found by phone, check if a party role was requested or create guest
    if (!party) {
      if (role) {
        // Match first default party of this role or register
        party = allParties.find((p) => p.role === role);
      }
      if (!party) {
        // Fallback to first party
        party = SEED_PARTIES[0];
      }
    }

    const authUser = {
      id: party.id,
      role: party.role,
      name: party.name,
      phone: party.phone,
      businessName: party.businessName
    };

    const token = generateToken(authUser);

    // Set httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000 // 7 days
    });

    console.log(`[AUTH] User authenticated: ${authUser.name} (${authUser.role}) - ID: ${authUser.id}`);

    res.json({
      success: true,
      message: `Welcome, ${authUser.name}! Logged in as ${authUser.role}.`,
      user: authUser,
      token
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    res.status(500).json({ success: false, message: err.message || 'Verification failed' });
  }
});

/**
 * GET /api/auth/me
 * Returns current authenticated user from session
 */
authRouter.get('/me', optionalAuth, async (req: Request, res: Response) => {
  if (req.user) {
    return res.json({
      success: true,
      authenticated: true,
      user: req.user
    });
  }

  res.json({
    success: true,
    authenticated: false,
    user: null
  });
});

/**
 * POST /api/auth/logout
 * Clears session cookie
 */
authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

