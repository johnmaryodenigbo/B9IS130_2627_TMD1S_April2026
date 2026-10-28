import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

export const AUTH_COOKIE = 'token';

function getToken(req) {
  if (req.cookies?.[AUTH_COOKIE]) return req.cookies[AUTH_COOKIE];
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

// Requires a valid JWT for an active user; attaches req.user.
export async function requireAuth(req, _res, next) {
  const token = getToken(req);
  if (!token) throw new AppError('Authentication required', 401);

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new AppError('Invalid or expired session', 401);
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new AppError('Account not found or disabled', 401);

  req.user = user;
  next();
}

// Usage: router.get('/x', requireAuth, requireRole('admin'), handler)
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) throw new AppError('Authentication required', 401);
    if (!roles.includes(req.user.role)) throw new AppError('You do not have permission to do this', 403);
    next();
  };
}
