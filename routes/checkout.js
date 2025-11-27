const express = require("express");
const { createOrder } = require("../db");
const {
  validateCheckoutForm,
  detectCardBrand,
  computeCartTotalsFromDb,
} = require("../utils");

module.exports = function checkoutRouter() {
  const router = express.Router();

  router.get("/checkout", (req, res) => {
    if (!req.session.cart || req.session.cart.length === 0) {
      return res.redirect("/cart");
    }
    const totals = computeCartTotalsFromDb(req.session.cart);

    res.render("checkout", {
      cart: totals.items,
      totals,
      error: null,
      success: null,
      form: { name: "", cardNumber: "", exp: "", cvc: "", email: "" },
    });
  });

  router.post("/checkout", (req, res) => {
    if (!req.session.cart || req.session.cart.length === 0) {
      return res.redirect("/cart");
    }
    const totals = computeCartTotalsFromDb(req.session.cart);

    const name = (req.body?.name || "").trim();
    const email = (req.body?.email || "").trim();
    const cardNumber = (req.body?.cardNumber || "").trim();
    const exp = (req.body?.exp || "").trim();
    const cvc = (req.body?.cvc || "").trim();

    const validation = validateCheckoutForm({
      name,
      email,
      cardNumber,
      exp,
      cvc,
    });

    if (!validation.valid) {
      return res.render("checkout", {
        cart: totals.items,
        totals,
        error: validation.errors[0] || "Kart bilgilerini eksiksiz ve doğru girin.",
        errorList: validation.errors,
        success: null,
        form: { name, cardNumber, exp, cvc, email },
      });
    }

    const orderCode = "ORD-" + Date.now().toString().slice(-6);
    const brand = detectCardBrand(validation.cardNumberDigits);
    const last4 = validation.cardNumberDigits.slice(-4);
    try {
      createOrder({
        code: orderCode,
        customer_name: name,
        customer_email: email || null,
        total_amount: totals.totalAmount,
        shipping_amount: totals.shipping,
        payable_amount: totals.payable,
        items_json: JSON.stringify(totals.items),
        card_brand: brand,
        card_last4: last4,
        status: "paid",
      });
    } catch (e) {
      return res.render("checkout", {
        cart: totals.items,
        totals,
        error: "Ödeme kaydedilirken hata oluştu, tekrar deneyin.",
        success: null,
        form: { name, cardNumber, exp, cvc, email },
      });
    }
    req.session.cart = [];

    res.render("checkout", {
      cart: [],
      totals,
      error: null,
      success: `Ödeme onaylandı. Sipariş kodu: ${orderCode} (${brand.toUpperCase()} •••• ${last4})`,
      form: { name: "", cardNumber: "", exp: "", cvc: "", email: "" },
    });
  });

  return router;
};
