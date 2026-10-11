const round = (n) => Math.round(n * 100) / 100;

/** Totals in the base currency. Rejected claims count in byStatus but not in the grand total. */
export function calculateTotals(claims) {
  const totals = { grandTotalBase: 0, count: 0, byStatus: {}, byCategory: {}, byClaimant: {} };
  const bump = (map, key, base) => {
    map[key] ??= { count: 0, totalBase: 0 };
    map[key].count += 1;
    map[key].totalBase = round(map[key].totalBase + base);
  };
  for (const c of claims) {
    const base = c.amountBase || 0;
    totals.count += 1;
    bump(totals.byStatus, c.status, base);
    if (c.status === 'rejected') continue;
    totals.grandTotalBase = round(totals.grandTotalBase + base);
    bump(totals.byCategory, c.effectiveCategory || 'unclassified', base);
    bump(totals.byClaimant, c.claimant, base);
  }
  return totals;
}
