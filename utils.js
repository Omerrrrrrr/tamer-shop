const path = require("path");
let dbModule;

function slugify(text = "") {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidCategoryId(id, baseCategories = []) {
  return baseCategories.some((cat) => cat.id === id);
}

function computeSalePrice(product) {
  const base = Number(product?.price || 0);
  const discount = Math.max(0, Number(product?.discount_percent || 0));
  const safeDiscount = Math.min(discount, 90);
  const raw = base * (1 - safeDiscount / 100);
  const sale = Math.round(raw * 100) / 100; // 2 ondalık hassasiyet
  return Number.isNaN(sale) ? 0 : Math.max(0, sale);
}

function withPricing(product) {
  if (!product) return null;
  const discountPercent = Math.max(0, Number(product.discount_percent || 0));
  const salePrice = computeSalePrice(product);
  return {
    ...product,
    discount_percent: discountPercent,
    salePrice,
  };
}

function collectImages(req) {
  let images = [];
  const imageUrls = req.body?.imageUrls || "";
  if (imageUrls) {
    images = imageUrls
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (req.files && req.files.length) {
    const uploaded = req.files.map((f) =>
      "/uploads/" + path.basename(f.path || f.filename || "")
    );
    images = images.concat(uploaded);
  }
  return images;
}

function luhnCheck(numStr = "") {
  const digits = (numStr || "").replace(/\D/g, "");
  let sum = 0;
  let toggle = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    if (toggle) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    toggle = !toggle;
  }
  return digits.length >= 12 && sum % 10 === 0;
}

function detectCardBrand(numStr = "") {
  const n = (numStr || "").replace(/\D/g, "");
  if (/^4[0-9]{6,}$/.test(n)) return "visa";
  if (/^5[1-5][0-9]{5,}$/.test(n) || /^2(2[2-9]|[3-6][0-9]|7[01])[0-9]{4,}$/.test(n)) return "mastercard";
  if (/^3[47][0-9]{5,}$/.test(n)) return "amex";
  return "card";
}

function validateCheckoutForm({ name, email, cardNumber, exp, cvc }) {
  const errors = [];
  const cardNumberDigits = (cardNumber || "").replace(/\D/g, "");
  const expDigits = (exp || "").replace(/\D/g, "");
  const cvcDigits = (cvc || "").replace(/\D/g, "").slice(0, 4);

  if (!name || name.trim().length < 3) {
    errors.push("Kart üzerindeki isim en az 3 karakter olmalıdır.");
  }

  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    errors.push("Geçerli bir e-posta adresi girin veya boş bırakın.");
  }

  if (cardNumberDigits.length < 12 || cardNumberDigits.length > 19) {
    errors.push("Kart numarası 12-19 hane arasında olmalıdır.");
  }
  if (!luhnCheck(cardNumberDigits)) {
    errors.push("Kart numarası doğrulamasından geçmedi.");
  }

  if (expDigits.length !== 4) {
    errors.push("SKT formatı AA/YY olmalıdır.");
  } else {
    const month = Number(expDigits.slice(0, 2));
    const year = Number("20" + expDigits.slice(2));
    if (month < 1 || month > 12) {
      errors.push("SKT ay bilgisi hatalı.");
    } else {
      const expDate = new Date(year, month);
      const now = new Date();
      if (expDate <= now) {
        errors.push("Kartın son kullanma tarihi geçmiş görünüyor.");
      }
    }
  }

  if (cvcDigits.length < 3 || cvcDigits.length > 4) {
    errors.push("CVC 3 veya 4 haneli olmalıdır.");
  }

  const valid = errors.length === 0;
  return { valid, errors, cardNumberDigits, expDigits, cvcDigits };
}

function computeCartTotalsFromDb(cart = []) {
  if (!dbModule) {
    dbModule = require("./db");
  }
  const items = [];
  let totalAmount = 0;
  for (const item of cart) {
    const product = withPricing(dbModule.getProductById(item.id));
    if (!product) continue;
    const qty = Math.max(1, Number(item.qty || 1));
    const unitPrice = computeSalePrice(product);
    items.push({
      id: product.id,
      name: product.name,
      qty,
      price: unitPrice,
      originalPrice: product.price || unitPrice,
      discountPercent: product.discount_percent || 0,
    });
    totalAmount += unitPrice * qty;
  }
  const shipping = totalAmount >= 500 ? 0 : 29.9;
  const payable = totalAmount + shipping;
  const totalItems = items.reduce((s, i) => s + i.qty, 0);
  return { items, totalAmount, totalItems, shipping, payable };
}

module.exports = {
  slugify,
  isValidCategoryId,
  computeSalePrice,
  withPricing,
  collectImages,
  luhnCheck,
  detectCardBrand,
  validateCheckoutForm,
  computeCartTotalsFromDb,
};
