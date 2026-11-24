// The budgets that get their own page (/budget/<n>eok/), in 만원.
export const BUDGETS = [6, 8, 10, 12, 15].map((n) => ({ n, slug: `${n}eok`, v: n * 10000, label: `${n}억` }));
export const budgetOf = (slug) => BUDGETS.find((b) => b.slug === slug);
