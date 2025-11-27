const express = require("express");
const {
  getFeatured,
  getStats,
  getProductsFiltered,
  getProductById,
} = require("../db");
const {
  isValidCategoryId,
  withPricing,
  computeSalePrice,
  computeCartTotalsFromDb,
} = require("../utils");
const { addComment, getComments, deleteCommentById } = require("../db");

function initCart(req) {
  if (!req.session.cart) {
    req.session.cart = [];
  }
}

module.exports = function shopRouter({ upload }) {
  const router = express.Router();

  // Ana sayfa
  router.get("/", (req, res) => {
    const featured = getFeatured(4).map(withPricing);
    const stats = getStats();
    const categories = res.locals.categories || [];
    const baseCategories = res.locals.baseCategories || [];

    res.render("index", {
      products: featured,
      categories,
      totalProducts: stats.totalProducts,
      totalCategories: stats.totalCategories || baseCategories.length,
      totalStock: stats.totalStock,
    });
  });

  // Ürünler
  router.get("/products", (req, res) => {
    const categories = res.locals.categories || [];
    const baseCategories = res.locals.baseCategories || [];
    let activeCategory = req.query.cat || "all";
    const searchTerm = req.query.q || "";

    if (
      activeCategory !== "all" &&
      !isValidCategoryId(activeCategory, baseCategories)
    ) {
      activeCategory = "all";
    }

    const products = getProductsFiltered({
      category: activeCategory,
      search: searchTerm,
    }).map(withPricing);

    res.render("products", {
      products,
      categories,
      activeCategory,
      searchTerm,
    });
  });

  // Ürün detay
  router.get("/products/:id", (req, res) => {
    const id = Number(req.params.id);
    const product = withPricing(getProductById(id));
    const categories = res.locals.categories || [];

    if (!product) {
      return res.redirect("/products");
    }

    const related = getProductsFiltered({
      category: product.category,
      search: "",
    })
      .filter((p) => p.id !== product.id)
      .map(withPricing)
      .slice(0, 4);
    const comments = getComments({ productId: id });

    res.render("product-detail", {
      product,
      related,
      categories,
      comments,
    });
  });

  // Sepet ekle
  router.get("/cart/add/:id", (req, res) => {
    const id = Number(req.params.id);
    const product = withPricing(getProductById(id));

    if (!product || product.stock <= 0 || Number(product.price || 0) <= 0) {
      return res.redirect("/products");
    }

    initCart(req);
    const unitPrice = computeSalePrice(product);
    const discountPercent = product.discount_percent || 0;
    const existing = req.session.cart.find((item) => item.id === id);
    if (existing) {
      existing.qty += 1;
      existing.price = unitPrice;
      existing.originalPrice = product.price || unitPrice;
      existing.discountPercent = discountPercent;
      existing.image_url = product.image_url || (product.images && product.images[0]) || null;
    } else {
      req.session.cart.push({
        id: product.id,
        name: product.name,
        qty: 1,
        price: unitPrice,
        originalPrice: product.price || unitPrice,
        discountPercent,
        image_url: product.image_url || (product.images && product.images[0]) || null,
      });
    }

    res.redirect("/cart");
  });

  // Sepet
  router.get("/cart", (req, res) => {
    initCart(req);
    res.render("cart", { cart: req.session.cart });
  });

  // Sepet adet güncelle
  router.post("/cart/update/:id", (req, res) => {
    initCart(req);
    const id = Number(req.params.id);
    const qty = Math.max(0, Number(req.body?.qty || 0));
    const cart = req.session.cart;

    const item = cart.find((p) => p.id === id);
    if (!item) return res.redirect("/cart");

    if (qty === 0) {
      req.session.cart = cart.filter((p) => p.id !== id);
    } else {
      item.qty = qty;
    }

    res.redirect("/cart");
  });

  // Sepetten sil
  router.get("/cart/remove/:id", (req, res) => {
    initCart(req);
    const id = Number(req.params.id);
    req.session.cart = req.session.cart.filter((item) => item.id !== id);
    res.redirect("/cart");
  });

  // Sayfalar
  router.get("/about", (req, res) => res.render("about"));
  router.get("/contact", (req, res) => res.render("contact"));

  // Checkout (GET/POST), mevcut session sepeti kullanıyor
  router.get("/checkout", (req, res) => {
    initCart(req);
    const cart = req.session.cart;

    if (!cart || cart.length === 0) {
      return res.redirect("/cart");
    }

    const totals = computeCartTotalsFromDb(cart);

    res.render("checkout", {
      cart: totals.items,
      totals,
      error: null,
      success: null,
      form: { name: "", cardNumber: "", exp: "", cvc: "", email: "" },
    });
  });

  router.post("/checkout", (req, res, next) => {
    // checkout POST burada değil; checkout router içinde
    next();
  });

  // Yorum ekleme
  router.post("/products/:id/comment", (req, res) => {
    const id = Number(req.params.id);
    const product = getProductById(id);
    if (!product) return res.redirect("/products");

    const name =
      (req.session?.user && req.session.user.name) ||
      (req.body?.name || "").trim() ||
      "Misafir";
    const content = (req.body?.content || "").trim();
    if (!content) {
      return res.redirect(`/products/${id}#comments`);
    }

    addComment({
      productId: id,
      authorName: name,
      content,
      userId: req.session?.user?.id || null,
    });
    // Admin uyarısı için session sayacı
    req.session.newComments = (req.session.newComments || 0) + 1;

    res.redirect(`/products/${id}#comments`);
  });

  // Yorum silme (kullanıcı kendi yorumunu silebilir)
  router.post("/products/:productId/comment/delete/:commentId", (req, res) => {
    const productId = Number(req.params.productId);
    const commentId = Number(req.params.commentId);
    const userId = req.session?.user?.id || null;
    const comments = getComments({ productId });
    const target = comments.find((c) => c.id === commentId);
    if (target && userId && target.user_id && target.user_id === userId) {
      deleteCommentById(commentId);
    }
    return res.redirect(`/products/${productId}#comments`);
  });

  return router;
};
