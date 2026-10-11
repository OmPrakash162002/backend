// Usage: npm run seed
// DEV ONLY. Deletes ALL claims and history, and any users whose email ends in @example.com,
// then creates demo users and sample claims. Refuses to run when NODE_ENV=production.
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import Claim from '../models/Claim.js';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import { createClaim } from '../services/claimService.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed in production.');
  process.exit(1);
}

const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'Password123!';
const PEOPLE = [
  { name: 'Priya Nair', email: 'priya.reviewer@example.com', role: 'reviewer' },
  { name: 'Asha Verma', email: 'asha@example.com', role: 'employee' },
  { name: 'Rohit Singh', email: 'rohit@example.com', role: 'employee' },
  { name: 'Meera Iyer', email: 'meera@example.com', role: 'employee' },
  { name: 'Karan Mehta', email: 'karan@example.com', role: 'employee' },
];

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const c = (claimant, days, category, amount, currency, description, receiptAvailable) =>
  ({ claimant, date: daysAgo(days), category, amount, currency, description, receiptAvailable });

const SAMPLES = [
  c('Asha Verma', 4, 'meals', 1200, 'INR', 'Team lunch with 4 colleagues after sprint review', true),
  c('Asha Verma', 4, 'meals', 1200, 'INR', 'Team lunch with 4 colleagues after sprint review', true), // exact duplicate
  c('Rohit Singh', 6, 'other', 3400, 'INR', 'Uber from airport to client office in Pune', true), // ambiguous + over limit
  c('Rohit Singh', 12, 'other', 899, 'INR', 'Figma subscription monthly', false), // missing receipt
  c('Meera Iyer', 20, 'other', 4500, 'INR', 'Dinner with ABC Corp procurement team', true), // meals vs client entertainment
  c('Meera Iyer', 2, 'other', 1800, 'INR', 'Misc expenses for the event', true), // very ambiguous
  c('Karan Mehta', 75, 'lodging', 7200, 'INR', 'Hotel stay in Bengaluru during conference', true), // stale
  c('Karan Mehta', 9, 'air_travel', 450, 'USD', 'Flight to Singapore for partner meeting', true), // over limit after conversion
];

await connectDb();
await Promise.all([Claim.deleteMany({}), AuditLog.deleteMany({}), User.deleteMany({ email: /@example\.com$/ })]);

const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
const users = {};
for (const p of PEOPLE) users[p.name] = await User.create({ ...p, passwordHash });

for (const s of SAMPLES) {
  const { claim } = await createClaim(s, users[s.claimant]);
   console.log(`${claim.claimant.padEnd(12)} ${String(claim.amount).padStart(6)} ${claim.currency}  -> ${claim.effectiveCategory} (${claim.validation.issues.length} issues)`);
}

console.log('\nDemo accounts (password for all: %s)', DEMO_PASSWORD);
for (const p of PEOPLE) console.log(`  ${p.role.padEnd(9)} ${p.email}`);
await mongoose.disconnect();
