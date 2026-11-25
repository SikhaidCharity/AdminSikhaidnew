// "Add one more" offers on the website's donation card (website: lib/extra-offers.js), shown only on the
// hidden A/B test copies of two campaigns: the Langar Sewa test offers a blanket, the Mission Garmahat test
// offers langar for 5 people, ₹500 each. The donation keeps what the donor
// chose (opted in with a quantity, or opted out) so the Extra Opt page can count it.
export const EXTRA_UNIT_PRICE = 500;
export const EXTRA_MAX_QTY = 20;
// A ?test=1 link on the website (for checking real payments) prices the offer at ₹10; such donations are marked test.
export const EXTRA_TEST_PRICE = 10;

export const EXTRA_OFFERS = {
  blanket: { label: 'Blanket', units: 'blankets', from: 'langar-sewa-testing-1', fromLabel: 'Langar Sewa (test page)', each: '₹500 per blanket' },
  langar: { label: 'Langar (5 people)', units: 'langar', from: 'mission-garmahat-testing-1', fromLabel: 'Mission Garmahat (test page)', each: '₹500 feeds 5 people' },
};

// The offer as sent by the website, checked: only a known offer on its own campaign, and the amount is
// worked out here (quantity × ₹500), not taken from the browser.
export function cleanExtra(extra, causeSlug) {
  const kind = EXTRA_OFFERS[extra?.offer];
  if (!kind || kind.from !== causeSlug) return null;
  const accepted = Boolean(extra.accepted);
  const qty = accepted ? Math.min(EXTRA_MAX_QTY, Math.max(1, Math.floor(Number(extra.qty) || 1))) : 0;
  const test = extra.test === true;
  const unitPrice = test ? EXTRA_TEST_PRICE : EXTRA_UNIT_PRICE;
  return { offer: extra.offer, accepted, qty, unitPrice, amount: qty * unitPrice, ...(test && { test: true }) };
}
