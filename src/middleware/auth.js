import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import User from '../models/User.js';
import { HttpError, asyncHandler } from '../utils/httpError.js';

/** Requires "Authorization: Bearer <token>". Loads the user fresh from the database on every request,
 *  so a deactivated user or a changed role takes effect immediately. */
export const requireAuth = asyncHandler(async (req, res, next) => {
  const [scheme, token] = (req.get('authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Authentication required');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new HttpError(401, 'Your session has expired or is invalid. Please sign in again.');
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.active) throw new HttpError(401, 'Your session has expired or is invalid. Please sign in again.');
  req.user = user;
  next();
});

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, 'You do not have permission to do this'));
