import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { AUTH_COOKIE } from '../middleware/auth.js';

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'lax',
  path: '/',
});

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');

  // Same message for unknown email / wrong password to avoid account enumeration.
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid email or password', 401);
  }
  if (!user.isActive) throw new AppError('This account has been disabled', 403);

  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken(user);
  const { exp } = jwt.decode(token);
  res.cookie(AUTH_COOKIE, token, { ...cookieOptions(), expires: new Date(exp * 1000) });
  res.json({ user });
}

export function logout(_req, res) {
  res.clearCookie(AUTH_COOKIE, cookieOptions());
  res.json({ message: 'Logged out' });
}

export function me(req, res) {
  res.json({ user: req.user });
}

export async function changePassword(req, res) {
  const user = await User.findById(req.user.id).select('+password');
  if (!(await user.comparePassword(req.body.currentPassword))) {
    throw new AppError('Current password is incorrect', 400);
  }
  user.password = req.body.newPassword;
  await user.save();
  res.json({ message: 'Password updated' });
}
