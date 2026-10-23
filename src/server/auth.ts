import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Maintain single ephemeral secret in memory across hot reloads if environment variable is not provided
declare global {
  // eslint-disable-next-line no-var
  var __sami_ephemeral_jwt_secret: string | undefined;
}

/**
 * Secure JWT Secret: Must come from environment in production.
 * If not provided in development, a strong random 256-bit key is generated at process startup.
 * A hardcoded fallback key is strictly prohibited for security.
 */
export function getJwtSecret(): string {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16) {
    return process.env.JWT_SECRET.trim();
  }
  if (!globalThis.__sami_ephemeral_jwt_secret) {
    globalThis.__sami_ephemeral_jwt_secret = crypto.randomBytes(32).toString('hex');
    console.warn('[Sami Security Warning] JWT_SECRET is not set in environment. Generated an ephemeral in-memory 256-bit secret.');
  }
  return globalThis.__sami_ephemeral_jwt_secret;
}

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: 'owner' | 'moderator' | 'user' | 'guest';
  avatarUrl?: string | null;
  isGuest?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Generate Secure Bearer Token (HMAC SHA-256 with expiry)
export function generateToken(user: AuthUser, expiresInDays: number = 30): string {
  const secret = getJwtSecret();
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 24 * 3600;
  const payload = Buffer.from(
    JSON.stringify({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      avatarUrl: user.avatarUrl || null,
      isGuest: !!user.isGuest,
      exp,
    })
  ).toString('base64url');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

// Verify Bearer Token
export function verifyToken(token: string): AuthUser | null {
  try {
    const secret = getJwtSecret();
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    if (signature !== expectedSignature) return null;

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }

    return {
      id: decoded.id,
      username: decoded.username,
      displayName: decoded.displayName,
      role: decoded.role,
      avatarUrl: decoded.avatarUrl,
      isGuest: decoded.isGuest,
    };
  } catch {
    return null;
  }
}

// Authentication Middleware
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (token) {
    const user = verifyToken(token);
    if (user) {
      req.user = user;
    }
  }
  next();
}

// Mandatory Auth Guard
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'غير مصرح: يرجى تسجيل الدخول أولاً' });
  }
  next();
}

// Role-Based Access Control Guard
export function requireRole(allowedRoles: ('owner' | 'moderator' | 'user' | 'guest')[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'غير مصرح: يرجى تسجيل الدخول' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'ليس لديك صلاحية لتنفيذ هذا الإجراء' });
    }
    next();
  };
}
