import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import authRouter from './routes/auth.js';
import claimsRouter from './routes/claims.js';
import policyRouter from './routes/policy.js';
import { requireAuth } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/error.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '100kb' }));
// If you deploy behind a reverse proxy (Render, Nginx, ...), also set: app.set('trust proxy', 1);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/policy', requireAuth, policyRouter);
app.use('/api/claims', claimsRouter); // protected inside the router

app.use(notFound);
app.use(errorHandler);

export default app;
