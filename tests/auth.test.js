import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'x'.repeat(48);
const { default: app } = await import('../src/app.js');
const { validateRegistration } = await import('../src/services/authValidation.js');
const { isReviewer, isOwner, toEmployeeView } = await import('../src/services/access.js');

let server;
let base;
before(async () => {
  server = app.listen(0);
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const call = (path, opts = {}) =>
  fetch(base + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });

test('claim, policy and /me routes reject requests without a token', async () => {
  for (const path of ['/api/claims', '/api/claims/summary', '/api/policy', '/api/auth/me']) {
    assert.equal((await call(path)).status, 401, path);
  }
  assert.equal((await call('/api/claims', { method: 'POST', body: '{}' })).status, 401);
});

test('garbage, wrong-secret, wrong-algorithm and expired tokens are rejected', async () => {
  const good = { sub: '64b000000000000000000001' };
  const tokens = [
    'not-a-jwt',
    jwt.sign(good, 'another-secret-another-secret-another-secret'),
    jwt.sign(good, process.env.JWT_SECRET, { algorithm: 'HS512' }),
    jwt.sign(good, process.env.JWT_SECRET, { expiresIn: -10 }),
  ];
  for (const t of tokens) {
    const res = await call('/api/claims', { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(res.status, 401);
  }
});

test('register validates input before touching the database', async () => {
  const res = await call('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'A', email: 'bad', password: 'short' }) });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.deepEqual(body.details.map((d) => d.field).sort(), ['email', 'name', 'password']);
});

test('login requires email and password', async () => {
  const res = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'a@b.co' }) });
  assert.equal(res.status, 400);
});

test('validateRegistration normalises email and limits password to 72 bytes', () => {
  const ok = validateRegistration({ name: ' Om ', email: ' OM@Example.COM ', password: 'longenough1' });
  assert.deepEqual(ok.value, { name: 'Om', email: 'om@example.com', password: 'longenough1' });
  assert.equal(validateRegistration({ name: 'Om', email: 'om@example.com', password: 'a'.repeat(73) }).errors[0].field, 'password');
});

test('ownership and role helpers', () => {
  assert.equal(isReviewer({ role: 'reviewer' }), true);
  assert.equal(isReviewer({ role: 'employee' }), false);
  assert.equal(isOwner({ claimantId: 'abc' }, { _id: 'abc' }), true);
  assert.equal(isOwner({ claimantId: 'abc' }, { _id: 'xyz' }), false);
});

test('employee view hides AI analysis, overrides and internal history', () => {
  const claim = { _id: 1, description: 'x', ai: { verdict: 'review' }, override: { reason: 'secret' }, validation: { issues: [] } };
  const history = [{ action: 'CLAIM_SUBMITTED' }, { action: 'AI_ANALYSED' }, { action: 'CLASSIFICATION_OVERRIDDEN' }, { action: 'APPROVED' }];
  const view = toEmployeeView(claim, history);
  assert.equal('ai' in view.claim, false);
  assert.equal('override' in view.claim, false);
  assert.ok(view.claim.validation);
  assert.deepEqual(view.history.map((h) => h.action), ['CLAIM_SUBMITTED', 'APPROVED']);
});
