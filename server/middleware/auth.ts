import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { User, Role, PartyRole, AuthUser } from '../../shared/types.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'goldstack_jwt_secret_dev_key_2026';

export type { AuthUser, User, Role };

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function generateToken(user: User): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Middleware to extract JWT from httpOnly cookie or Bearer header and attach req.user
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.token || req.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in with your phone and OTP.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session. Please log in again.'
    });
  }
}

/**
 * Optional authentication: attaches req.user if valid token exists
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
      req.user = decoded;
    } catch {
      // Ignore invalid token
    }
  }
  next();
}

/**
 * Role-based access control guard
 */
export function requireRole(...allowedRoles: PartyRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Requires role: ${allowedRoles.join(', ')}`
      });
    }
    next();
  };
}

