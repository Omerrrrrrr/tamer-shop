const express = require("express");
const {
  getAllProducts,
  getAllCategories,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  createCategory,
  deleteCategory,
  countProductsByCategory,
  getComments,
  replyComment,
  deleteCommentById,
  updateCommentContent,
} = require("../db");
const {
  slugify,
  isValidCategoryId,
  withPricing,
  collectImages,
} = require("../utils");

const ADMIN_USER = {
  username: "admin",
  password: "admin123",
};

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.redirect("/admin/login");
}

module.exports = function adminRouter({ upload }) {
  const router = express.Router();

  // Login formu
  router.get("/login", (req, res) => {
    if (req.session.isAdmin) {
      return res.redirect("/admin");
    }
    res.render("admin/login", { error: null });
  });

  // Login POST
  router.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (
      username === ADMIN_USER.username &&
      password === ADMIN_USER.password
    ) {
      req.session.isAdmin = true;
      return res.redirect("/admin");
    }

    res.render("admin/login", { error: "Kullanıcı adı veya şifre hatalı." });
  });

  // Logout
  router.get("/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/admin/login");
    });
  });

  // Admin dashboard
  router.get("/", requireAdmin, (req, res) => {
    const products = getAllProducts().map(withPricing);
    const stats = {
      totalProducts: products.length,
      totalCategories: (getAllCategories() || []).length,
      totalStock: products.reduce((s, p) => s + Number(p.stock || 0), 0),
    };
    const categories = getAllCategories();
    const newCommentsCount = Number(req.session?.newComments || 0);
    req.session.newComments = 0; // gösterdikten sonra sıfırla

    res.render("admin/dashboard", {
      products,
      categories,
      stats,
      newCommentsCount,
    });
  });

  // Ürün listesi
  router.get("/products", requireAdmin, (req, res) => {
    const products = getAllProducts().map(withPricing);
    const categories = getAllCategories();
    res.render("admin/products", { products, categories });
  });

  // Kategori yönetimi
  router.get("/categories", requireAdmin, (req, res) => {
    const categories = getAllCategories();
    res.render("admin/categories", {
      categories,
      error: null,
      success: null,
    });
  });

  router.post("/categories", requireAdmin, (req, res) => {
    const label = (req.body?.label || "").trim();
    const imageUrl = (req.body?.imageUrl || "").trim();
    const customSlug = (req.body?.slug || "").trim().toLowerCase();
    const generatedSlug = slugify(label);
    const slug = customSlug || generatedSlug;

    const currentCategories = getAllCategories();

    if (!label || !slug) {
      return res.render("admin/categories", {
        categories: currentCategories,
        error: "Kategori adı zorunlu.",
        success: null,
      });
    }

    if (slug === "all") {
      return res.render("admin/categories", {
        categories: currentCategories,
        error: `"all" ID'si kullanılmaz.`,
        success: null,
      });
    }

    if (isValidCategoryId(slug, currentCategories)) {
      return res.render("admin/categories", {
        categories: currentCategories,
        error: "Bu kategori zaten eklenmiş.",
        success: null,
      });
    }

    try {
      createCategory({ id: slug, label, imageUrl });
      const updatedCategories = getAllCategories();
      res.render("admin/categories", {
        categories: updatedCategories,
        error: null,
        success: "Kategori eklendi.",
      });
    } catch (err) {
      res.render("admin/categories", {
        categories: currentCategories,
        error: "Kategori eklenirken hata oluştu.",
        success: null,
      });
    }
  });

  router.get("/categories/delete/:id", requireAdmin, (req, res) => {
    const id = req.params.id;
    const currentCategories = getAllCategories();

    if (!isValidCategoryId(id, currentCategories)) {
      return res.render("admin/categories", {
        categories: currentCategories,
        error: "Kategori bulunamadı.",
        success: null,
      });
    }

    const productCount = countProductsByCategory(id);
    if (productCount > 0) {
      return res.render("admin/categories", {
        categories: currentCategories,
        error: "Bu kategoriye bağlı ürünler var, silinemez.",
        success: null,
      });
    }

    deleteCategory(id);
    const updatedCategories = getAllCategories();
    res.render("admin/categories", {
      categories: updatedCategories,
      error: null,
      success: "Kategori silindi.",
    });
  });

  // Yeni ürün formu
  router.get("/products/new", requireAdmin, (req, res) => {
    const categories = getAllCategories();
    res.render("admin/product-form", {
      categories,
      error: null,
    });
  });

  // Yeni ürün kaydetme
  router.post("/products", requireAdmin, upload.array("imageFiles", 5), (req, res) => {
    const { name, desc, category, stock, price, discount } = req.body;
    const categories = getAllCategories();
    const baseCategories = categories;
    const images = collectImages(req);
    const discountPercent = Math.min(
      90,
      Math.max(0, Number(discount || 0))
    );

    const stockNumber = Number(stock);
    const priceNumber = Number(price || 0);

    const isValidCategory =
      category && isValidCategoryId(category, baseCategories);

    const isValidStock =
      !Number.isNaN(stockNumber) && stock !== "" && stockNumber >= 0;

    const isValidPrice =
      !Number.isNaN(priceNumber) && price !== "" && priceNumber > 0;

    if (!name || !isValidCategory || !isValidStock || !isValidPrice) {
      return res.render("admin/product-form", {
        categories,
        error:
          "İsim, geçerli kategori, stok ve fiyat (0 veya üzeri) zorunludur.",
      });
    }

    createProduct({
      name: name.trim(),
      description: (desc || "").trim(),
      category,
      stock: stockNumber,
      price: priceNumber,
      images,
      discountPercent,
    });

    res.redirect("/admin/products");
  });

  // Ürün düzenleme formu (GET)
  router.get("/products/edit/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const product = withPricing(getProductById(id));
    const categories = getAllCategories();

    if (!product) {
      return res.redirect("/admin/products");
    }

    res.render("admin/product-edit", {
      product,
      categories,
      error: null,
    });
  });

  // Ürün düzenleme kaydetme (POST)
  router.post("/products/edit/:id", requireAdmin, upload.array("imageFiles", 5), (req, res) => {
    const id = Number(req.params.id);
    const { name, desc, category, stock, price, discount } = req.body;
    const categories = getAllCategories();
    const baseCategories = categories;
    const images = collectImages(req);
    const discountPercent = Math.min(
      90,
      Math.max(0, Number(discount || 0))
    );

    const stockNumber = Number(stock);
    const priceNumber = Number(price || 0);

    const isValidCategory =
      category && isValidCategoryId(category, baseCategories);
    const isValidStock =
      !Number.isNaN(stockNumber) && stock !== "" && stockNumber >= 0;
    const isValidPrice =
      !Number.isNaN(priceNumber) && price !== "" && priceNumber > 0;

    if (!name || !isValidCategory || !isValidStock || !isValidPrice) {
      const product = withPricing(getProductById(id));
      return res.render("admin/product-edit", {
        product,
        categories,
        error:
          "İsim, geçerli kategori, stok ve fiyat (0 veya üzeri) zorunludur.",
      });
    }

    updateProduct(id, {
      name: name.trim(),
      description: (desc || "").trim(),
      category,
      stock: stockNumber,
      price: priceNumber,
      images,
      discountPercent,
    });

    res.redirect("/admin/products");
  });

  // Ürün silme
  router.get("/products/delete/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    deleteProduct(id);
    res.redirect("/admin/products");
  });

  // Yorumlar
  router.get("/comments", requireAdmin, (req, res) => {
    const productId = req.query.product ? Number(req.query.product) : null;
    const comments = getComments({ productId: productId || undefined });
    res.render("admin/comments", {
      comments,
      productId,
      error: null,
      success: null,
    });
  });

  router.post("/comments/reply/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const replyText = (req.body?.reply || "").trim();
    if (replyText) {
      replyComment(id, replyText);
    }
    res.redirect("/admin/comments");
  });

  router.post("/comments/delete/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    deleteCommentById(id);
    res.redirect("/admin/comments");
  });

  router.post("/comments/update/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const content = (req.body?.content || "").trim();
    if (content) {
      updateCommentContent(id, content);
    }
    res.redirect("/admin/comments");
  });

  return router;
};
