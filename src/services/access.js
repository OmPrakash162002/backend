// Role and ownership rules, as pure functions.
export const isReviewer = (user) => user?.role === 'reviewer';
export const isOwner = (claim, user) => String(claim.claimantId) === String(user?._id ?? user?.id);

// What an employee may see of their own claim's history.
const EMPLOYEE_VISIBLE_ACTIONS = new Set([
  'CLAIM_SUBMITTED', 'CLARIFICATION_REQUESTED', 'CLARIFICATION_ANSWERED', 'APPROVED', 'REJECTED',
]);

/** Employees do not see the AI analysis, reviewer overrides, or internal analysis history. */
export function toEmployeeView(claimPlain, history) {
  const { ai, override, ...claim } = claimPlain; // eslint-disable-line no-unused-vars
  return { claim, history: history.filter((h) => EMPLOYEE_VISIBLE_ACTIONS.has(h.action)) };
}
