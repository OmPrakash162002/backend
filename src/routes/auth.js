import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import User from '../models/User.js';
import { HttpError, asyncHandler } from '../utils/httpError.js';
import { validateRegistration } from '../services/authValidation.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const COST = 12;
// Compared against when the email is unknown, so "no such user" and "wrong password" take similar time
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in a few minutes.' },
});

const signToken = (user) =>
  jwt.sign({ sub: String(user._id) }, env.jwtSecret, { algorithm: 'HS256', expiresIn: env.jwtExpiresIn });

// Public registration always creates an employee. Reviewers are promoted with `npm run set-role`.
router.post('/register', limiter, asyncHandler(async (req, res) => {
  const { errors, value } = validateRegistration(req.body);
  if (errors.length) throw new HttpError(400, 'Registration failed', errors);

  const passwordHash = await bcrypt.hash(value.password, COST);
  let user;
  try {
    user = await User.create({ name: value.name, email: value.email, passwordHash, role: 'employee' });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'An account with this email already exists');
    throw err;
  }
  res.status(201).json({ token: signToken(user), user: user.toPublic() });
}));

router.post('/login', limiter, asyncHandler(async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!email || !password) throw new HttpError(400, 'Email and password are required');

  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok || !user.active) throw new HttpError(401, 'Invalid email or password');

    // Each sign-in page sends its own "portal", so employees and reviewers cannot use each other's page
  const portal = req.body?.portal;
  if (portal === 'reviewer' && user.role !== 'reviewer')
    throw new HttpError(403, 'This is not a reviewer account. Please use the employee sign in.');
  if (portal === 'employee' && user.role === 'reviewer')
    throw new HttpError(403, 'This is a reviewer account. Please use the reviewer sign in.');

  res.json({ token: signToken(user), user: user.toPublic() });
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toPublic() }));

export default router;
