import { Router } from 'express';
import { POLICY, CATEGORIES, SECTIONS } from '../config/policy.js';

const router = Router();

router.get('/', (req, res) =>
  res.json({
    config: POLICY,
    categories: Object.entries(CATEGORIES).map(([key, c]) => ({ key, ...c })),
    sections: SECTIONS,
  }));

export default router;
