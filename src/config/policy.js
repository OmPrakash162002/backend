// The organizational expense policy. Edit this file to change limits or wording.
// Amounts are in the base currency. "Sections" are what the AI retrieves and cites.

export const POLICY = {
  baseCurrency: 'INR',
  rates: { INR: 1, USD: 84, EUR: 92, GBP: 108 }, // fixed finance-team rates
  receiptThresholdBase: 500,
  preApprovalThresholdBase: 50000,
  maxClaimAgeDays: 60,
  duplicateWindowDays: 3,
  uncertaintyThreshold: 0.6, // AI confidence below this is marked "uncertain"
};

export const CATEGORIES = {
  meals: { label: 'Meals', perClaimLimit: 1500, monthlyLimit: 6000, sectionId: 'MEAL-1' },
  air_travel: { label: 'Air travel', perClaimLimit: 30000, monthlyLimit: 60000, sectionId: 'AIR-1' },
  ground_transport: { label: 'Ground transport', perClaimLimit: 3000, monthlyLimit: 10000, sectionId: 'GROUND-1' },
  lodging: { label: 'Lodging', perClaimLimit: 8000, monthlyLimit: 30000, sectionId: 'LODGE-1' },
  office_supplies: { label: 'Office supplies', perClaimLimit: 5000, monthlyLimit: 15000, sectionId: 'SUP-1' },
  software: { label: 'Software & subscriptions', perClaimLimit: 10000, monthlyLimit: 30000, sectionId: 'SW-1' },
  client_entertainment: { label: 'Client entertainment', perClaimLimit: 5000, monthlyLimit: 15000, sectionId: 'ENT-1' },
  training: { label: 'Training & conferences', perClaimLimit: 25000, monthlyLimit: 50000, sectionId: 'TRAIN-1' },
};

// "other" is something an employee can pick when unsure; the AI then classifies it.
export const CLAIMABLE_CATEGORIES = [...Object.keys(CATEGORIES), 'other'];

export const SECTIONS = [
  { id: 'GEN-RECEIPT', category: 'general', title: 'Receipts', keywords: [],
    text: 'A receipt is required for every claim above INR 500. Claims of INR 500 or less may be submitted without a receipt if the description explains the expense.' },
  { id: 'GEN-TIMELY', category: 'general', title: 'Timely submission', keywords: [],
    text: 'Claims must be submitted within 60 days of the expense date. Expenses dated in the future are not valid.' },
  { id: 'GEN-DUP', category: 'general', title: 'Duplicate claims', keywords: [],
    text: 'The same expense must not be claimed twice. A claim with the same claimant, amount and date, or a near-identical description within 3 days, is treated as a duplicate until the claimant explains otherwise.' },
  { id: 'GEN-PREAPPROVAL', category: 'general', title: 'Pre-approval for large claims', keywords: [],
    text: 'Any single claim above INR 50,000 requires written pre-approval from a department head. The approval reference must be stated in the description.' },
  { id: 'GEN-PERSONAL', category: 'general', title: 'Non-reimbursable items', keywords: ['alcohol', 'wine', 'beer', 'liquor', 'fine', 'penalty', 'personal', 'family', 'gift'],
    text: 'Personal expenses, alcohol, fines, penalties and expenses of family members are not reimbursable.' },
  { id: 'GEN-CURRENCY', category: 'general', title: 'Foreign currency', keywords: [],
    text: 'Foreign currency claims are converted to INR at the fixed finance-team rate. Supported currencies are INR, USD, EUR and GBP.' },

  { id: 'MEAL-1', category: 'meals', title: 'Business meals',
    keywords: ['meal', 'lunch', 'dinner', 'breakfast', 'snack', 'food', 'restaurant', 'cafe', 'coffee', 'catering', 'canteen'],
    text: 'Meals while working or travelling for business are reimbursable up to INR 1,500 per claim and INR 6,000 per month. Meals shared with external clients or prospects belong under Client entertainment (ENT-1), not here.' },
  { id: 'AIR-1', category: 'air_travel', title: 'Air travel',
    keywords: ['flight', 'airfare', 'airline', 'airport', 'boarding', 'plane', 'indigo', 'baggage'],
    text: 'Economy-class air travel for approved business trips is reimbursable up to INR 30,000 per claim and INR 60,000 per month. Fares should be booked at least 7 days in advance where possible.' },
  { id: 'GROUND-1', category: 'ground_transport', title: 'Ground transport',
    keywords: ['taxi', 'cab', 'uber', 'ola', 'rideshare', 'ride', 'metro', 'bus', 'train', 'fuel', 'petrol', 'toll', 'parking', 'auto', 'rickshaw'],
    text: 'Local business travel by taxi, ride-hailing, metro, bus, train or auto-rickshaw is reimbursable up to INR 3,000 per claim and INR 10,000 per month. Commuting between home and the regular workplace is not reimbursable.' },
  { id: 'LODGE-1', category: 'lodging', title: 'Lodging',
    keywords: ['hotel', 'stay', 'accommodation', 'lodging', 'room', 'night', 'guesthouse', 'airbnb', 'hostel'],
    text: 'Hotel or other lodging during approved business travel is reimbursable up to INR 8,000 per claim and INR 30,000 per month. Room-service and minibar charges are excluded.' },
  { id: 'SUP-1', category: 'office_supplies', title: 'Office supplies',
    keywords: ['stationery', 'pen', 'notebook', 'paper', 'printer', 'toner', 'cable', 'mouse', 'keyboard', 'supplies', 'office', 'desk', 'monitor'],
    text: 'Office supplies and small equipment needed for work are reimbursable up to INR 5,000 per claim and INR 15,000 per month. Equipment above this amount must be purchased through procurement.' },
  { id: 'SW-1', category: 'software', title: 'Software and subscriptions',
    keywords: ['software', 'subscription', 'license', 'licence', 'saas', 'hosting', 'domain', 'cloud', 'api', 'figma', 'github', 'plugin', 'app'],
    text: 'Work-related software and subscriptions are reimbursable up to INR 10,000 per claim and INR 30,000 per month, provided the tool has been approved by IT. Personal subscriptions are not reimbursable.' },
  { id: 'ENT-1', category: 'client_entertainment', title: 'Client entertainment',
    keywords: ['client', 'prospect', 'customer', 'entertainment', 'hospitality', 'partner', 'vendor', 'procurement'],
    text: 'Meals and entertainment with external clients or prospects are reimbursable up to INR 5,000 per claim and INR 15,000 per month. The description must name the client or company and the business purpose.' },
  { id: 'TRAIN-1', category: 'training', title: 'Training and conferences',
    keywords: ['training', 'course', 'conference', 'workshop', 'seminar', 'certification', 'exam', 'webinar', 'tuition', 'summit'],
    text: 'Job-related training, courses, certifications and conference fees are reimbursable up to INR 25,000 per claim and INR 50,000 per month with prior manager approval.' },
];

export const sectionById = (id) => SECTIONS.find((s) => s.id === id);
