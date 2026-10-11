# Backend: Expense Claim Review API

Express + MongoDB (Mongoose) REST API. It validates claims with deterministic code, analyses them with the Gemini
API, enforces roles, and keeps an append-only audit history.

Live health check: https://expense-review-api.onrender.com/api/health
(free hosting: the first request after idle time can take up to a minute)

## Requirements

- Node.js 20 or newer
- A MongoDB Atlas database (the free M0 tier is enough)
- Optional: a Gemini API key from https://aistudio.google.com/apikey (without one, a rules-based classifier is used)

## Run locally

```bash
npm install
cp .env.example .env      # on Windows: copy .env.example .env
# edit .env (see the table below)
npm test                  # unit tests, no database needed
npm run dev               # http://localhost:5000/api/health
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | yes | Atlas connection string, including the database name, e.g. `...mongodb.net/expense_review?retryWrites=true&w=majority` |
| `JWT_SECRET` | yes | Random string of 32+ characters. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | no | Token lifetime, default `8h` |
| `GEMINI_API_KEY` | no | Enables the AI analysis. Without it the rules-based fallback is used and the UI says so |
| `GEMINI_MODEL` | no | Gemini model name, see `.env.example` |
| `CORS_ORIGIN` | no | Allowed frontend origin(s), comma-separated. Default `http://localhost:3000` |
| `PORT` | no | Default `5000` |

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start with auto-reload |
| `npm start` | Start (production) |
| `npm test` | Run the unit tests (validation, totals, retrieval, auth and access rules) |
| `npm run seed` | **Dev only.** Creates demo users and 8 sample claims. Deletes all existing claims. Refuses to run in production |
| `npm run set-role -- <email> <employee\|reviewer>` | Promote or demote an account, e.g. to create the first reviewer |

## Accounts and roles

Public registration always creates an **employee**. To create a reviewer, register the account, then run
`npm run set-role -- you@example.com reviewer` (or edit the user's `role` in Atlas).

| | Employee | Reviewer |
|---|---|---|
| Submit a claim (always as themselves) | yes | yes |
| See claims | only their own | all |
| See AI analysis, overrides, internal history | no | yes |
| Answer clarification questions | yes, on their own claims | no |
| Approve, reject, request clarification, override, re-run analysis | no | yes, except on their own claims |

Sign-in is split into an employee portal and a reviewer portal: each sends a `portal` value and the server refuses
accounts of the other role. Sessions are JWTs (HS256) sent as `Authorization: Bearer <token>`. The user is reloaded on
every request, so deactivating an account or changing a role takes effect immediately. Passwords use bcrypt (cost 12)
and login/register are rate limited (30 attempts per 15 minutes per IP).

## API

All routes except `/api/health`, `/api/auth/register` and `/api/auth/login` need a Bearer token.

| Method | Path | Who | Body |
|---|---|---|---|
| GET | `/api/health` | public | |
| POST | `/api/auth/register` | public | `name`, `email`, `password` |
| POST | `/api/auth/login` | public | `email`, `password`, `portal` (`employee` or `reviewer`) |
| GET | `/api/auth/me` | any | |
| GET | `/api/policy` | any | |
| GET | `/api/claims?status=&q=` | any (employees: own only) | |
| GET | `/api/claims/summary` | any (employees: own only) | |
| POST | `/api/claims` | any | `date` (YYYY-MM-DD), `category`, `amount`, `currency`, `description`, `receiptAvailable` |
| GET | `/api/claims/:id` | any (employees: own only) | returns `{ claim, history }` |
| POST | `/api/claims/:id/clarifications/:cid/answer` | the claimant | `answer` |
| POST | `/api/claims/:id/approve` | reviewer | `note` (required if the claim has policy issues) |
| POST | `/api/claims/:id/reject` | reviewer | `note` (the reason) |
| POST | `/api/claims/:id/override` | reviewer | `category`, `reason` |
| POST | `/api/claims/:id/clarifications` | reviewer | `question` |
| POST | `/api/claims/:id/reanalyse` | reviewer | |

## How a claim is processed

1. **Input validation** rejects missing fields, invalid or future dates, unsupported currencies and bad amounts (HTTP 400
   with field-level messages).
2. **Deterministic checks** (`services/validation.js`, pure functions): missing receipt, stale claim, per-claim and
   monthly category limits after currency conversion, pre-approval threshold, exact and possible duplicates.
3. **Policy retrieval** (`services/retrieval.js`) picks the relevant policy sections.
4. **AI analysis** (`services/ai.js`) sends only those sections to Gemini. It returns a category, confidence, findings
   with citations, and questions. Citations that are not in the retrieved set are dropped, findings without a citation
   are labelled unverified, and confidence below 0.6 is marked uncertain.
5. **Verdict merge:** deterministic issues override the AI. An AI "comply" becomes "review" if any check failed.
6. If the AI call fails or no key is set, a rules-based classifier produces the analysis instead.

## Project structure

```
backend/
├── src/
│   ├── server.js              # connects to MongoDB and starts the server
│   ├── app.js                 # middleware and routes
│   ├── config/                # env.js, db.js, policy.js (limits and citable policy text)
│   ├── models/                # User, Claim, AuditLog
│   ├── services/              # validation, totals, retrieval, ai, access, authValidation, claimService
│   ├── routes/                # auth, claims, policy
│   ├── middleware/            # auth (requireAuth, requireRole), error handling
│   ├── utils/                 # HttpError, asyncHandler
│   └── scripts/               # seed.js, set-role.js
└── tests/                     # validation.test.js, auth.test.js
```

## Deploying (Render)

- New **Web Service**, Root Directory `backend`, Build Command `npm install`, Start Command `npm start`, Free instance.
- Add the environment variables above. Set `CORS_ORIGIN` to the exact frontend URL (no trailing slash).
- In Atlas, allow `0.0.0.0/0` under Network Access (free hosts do not have a fixed IP).
- Every `git push` to the main branch redeploys automatically.

## Troubleshooting

| Problem | Likely cause |
|---|---|
| `MONGODB_URI is not set` or `JWT_SECRET must be set` | Missing `.env` file or variable |
| `Server selection timed out` | Atlas Network Access does not allow your IP, or the connection string is wrong |
| AI panel says "Rules-based fallback" | No `GEMINI_API_KEY`, a wrong model name, or a quota error. The panel shows the exact message |
| Browser shows a CORS error | `CORS_ORIGIN` does not exactly match the frontend URL |
