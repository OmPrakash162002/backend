import { Router } from 'express';
import mongoose from 'mongoose';
import { asyncHandler, HttpError } from '../utils/httpError.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as svc from '../services/claimService.js';

const router = Router();
const reviewer = requireRole('reviewer');

router.use(requireAuth); // every claim route needs a signed-in user

router.param('id', (req, res, next, id) =>
  mongoose.isValidObjectId(id) ? next() : next(new HttpError(400, 'Invalid claim id')));

// Any signed-in user. The service limits employees to their own claims.
router.get('/', asyncHandler(async (req, res) => res.json({ claims: await svc.listClaims(req.user, req.query) })));
router.get('/summary', asyncHandler(async (req, res) => res.json({ totals: await svc.getTotals(req.user) })));
router.post('/', asyncHandler(async (req, res) => res.status(201).json(await svc.createClaim(req.body, req.user))));
router.get('/:id', asyncHandler(async (req, res) => res.json(await svc.getClaimDetail(req.params.id, req.user))));
router.post('/:id/clarifications/:cid/answer', asyncHandler(async (req, res) =>
  res.json(await svc.answerClarification(req.params.id, req.params.cid, req.body, req.user))));

// Reviewers only (and never on their own claim: enforced in the service)
router.post('/:id/reanalyse', reviewer, asyncHandler(async (req, res) => res.json(await svc.reanalyse(req.params.id, req.user))));
router.post('/:id/approve', reviewer, asyncHandler(async (req, res) => res.json(await svc.decide(req.params.id, 'approve', req.body, req.user))));
router.post('/:id/reject', reviewer, asyncHandler(async (req, res) => res.json(await svc.decide(req.params.id, 'reject', req.body, req.user))));
router.post('/:id/override', reviewer, asyncHandler(async (req, res) => res.json(await svc.overrideCategory(req.params.id, req.body, req.user))));
router.post('/:id/clarifications', reviewer, asyncHandler(async (req, res) => res.json(await svc.requestClarification(req.params.id, req.body, req.user))));

export default router;
