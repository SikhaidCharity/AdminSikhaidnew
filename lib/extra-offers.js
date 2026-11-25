// "Add one more" offers on the website's donation card (website: lib/extra-offers.js), shown only on the
// hidden A/B test copies of two campaigns: the Langar Sewa test offers a blanket, the Mission Garmahat test
// offers langar for 8 people, ₹800 each. The donation keeps what the donor
// chose (opted in with a quantity, or opted out) so the Extra Opt page can count it.
export const EXTRA_UNIT_PRICE = 800;
export const EXTRA_MAX_QTY = 20;

export const EXTRA_OFFERS = {
  blanket: { label: 'Blanket', units: 'blankets', from: 'langar-sewa-testing-1', fromLabel: 'Langar Sewa (test page)', each: '₹800 per blanket' },
  langar: { label: 'Langar (8 people)', units: 'langar', from: 'mission-garmahat-testing-1', fromLabel: 'Mission Garmahat (test page)', each: '₹800 feeds 8 people' },
};

// The offer as sent by the website, checked: only a known offer on its own campaign, and the amount is
// worked out here (quantity × ₹800), not taken from the browser.
export function cleanExtra(extra, causeSlug) {
  const kind = EXTRA_OFFERS[extra?.offer];
  if (!kind || kind.from !== causeSlug) return null;
  const accepted = Boolean(extra.accepted);
  const qty = accepted ? Math.min(EXTRA_MAX_QTY, Math.max(1, Math.floor(Number(extra.qty) || 1))) : 0;
  return { offer: extra.offer, accepted, qty, unitPrice: EXTRA_UNIT_PRICE, amount: qty * EXTRA_UNIT_PRICE };
}
