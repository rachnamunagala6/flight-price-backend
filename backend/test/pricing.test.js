const test = require('node:test');
const assert = require('node:assert/strict');
const { cacheKey, pickReasonableFlight } = require('../lib/pricing');

test('cacheKey combines route and dates into a stable string', () => {
  assert.equal(cacheKey('DEN', 'AUS', '2027-03-14', '2027-03-21'), 'DEN-AUS-2027-03-14-2027-03-21');
});

test('pickReasonableFlight rejects a cheap multi-stop marathon in favor of a sane option', () => {
  const picked = pickReasonableFlight([
    { price: 240, duration: 16 * 60, stops: 3 },
    { price: 260, duration: 5 * 60 + 20, stops: 1 },
    { price: 310, duration: 4 * 60 + 50, stops: 0 },
  ]);
  assert.equal(picked.price, 260);
});

test('pickReasonableFlight still returns the cheapest option when every itinerary genuinely needs 2 stops', () => {
  const picked = pickReasonableFlight([
    { price: 410, duration: 9 * 60, stops: 2 },
    { price: 500, duration: 10 * 60, stops: 2 },
  ]);
  assert.equal(picked.price, 410);
});

test('pickReasonableFlight falls back to plain cheapest when duration data is missing', () => {
  const picked = pickReasonableFlight([
    { price: 199, duration: null, stops: null },
    { price: 250, duration: null, stops: null },
  ]);
  assert.equal(picked.price, 199);
});

test('pickReasonableFlight prefers a slightly pricier 1-stop option over an even pricier nonstop', () => {
  const picked = pickReasonableFlight([
    { price: 350, duration: 3 * 60, stops: 0 },
    { price: 220, duration: 4 * 60 + 30, stops: 1 },
  ]);
  assert.equal(picked.price, 220);
});
