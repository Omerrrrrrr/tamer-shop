const test = require("node:test");
const assert = require("node:assert/strict");
const {
  computeSalePrice,
  luhnCheck,
  validateCheckoutForm,
} = require("../utils");

test("computeSalePrice applies discount safely", () => {
  assert.equal(computeSalePrice({ price: 100, discount_percent: 20 }), 80);
  assert.equal(computeSalePrice({ price: 100, discount_percent: 0 }), 100);
  assert.equal(computeSalePrice({ price: 100, discount_percent: 200 }), 10); // capped at 90%
});

test("luhnCheck validates card numbers", () => {
  assert.ok(luhnCheck("4111111111111111"));
  assert.ok(!luhnCheck("4111111111111112"));
});

test("validateCheckoutForm detects errors", () => {
  const bad = validateCheckoutForm({
    name: "ab",
    email: "bad",
    cardNumber: "123",
    exp: "1299",
    cvc: "12",
  });
  assert.ok(!bad.valid);
  assert.ok(bad.errors.length >= 3);

  const good = validateCheckoutForm({
    name: "Test User",
    email: "test@example.com",
    cardNumber: "4111111111111111",
    exp: "1226",
    cvc: "123",
  });
  assert.ok(good.valid);
});
