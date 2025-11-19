const express = require("express");
const path = require("path");
const session = require("express-session"); 

const app = express();
const PORT = 3000;

// EJS ayarları
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Statik dosyalar
app.use(express.static(path.join(__dirname, "public")));

app.use(express.urlencoded({ extended: true })); // form verisi için

app.use(
  session({
    secret: "cok-gizli-bir-anahtar", // TODO: .env'ye taşırız sonra
    resave: false,
    saveUninitialized: false,
  })
);


/* ---- Fake ürün & kategori verisi ---- */

const categories = [
  { id: "all", label: "Tümü" },
  { id: "kilif", label: "Kılıflar" },
  { id: "cam", label: "Cam Koruyucu" },
  { id: "sarf", label: "Şarj & Kablo" },
  { id: "powerbank", label: "Powerbank" },
];

let products = [
  {
    id: 1,
    name: "Şeffaf Telefon Kılıfı",
    desc: "iPhone & Samsung için uyumlu",
    category: "kilif",
  },
  {
    id: 2,
    name: "Renkli Silikon Kılıf",
    desc: "12 farklı renk seçeneği",
    category: "kilif",
  },
  {
    id: 3,
    name: "Cam Ekran Koruyucu",
    desc: "9H sertlik, tam koruma",
    category: "cam",
  },
  {
    id: 4,
    name: "Privacy Cam Koruyucu",
    desc: "Yandan görünmeyi engeller",
    category: "cam",
  },
  {
    id: 5,
    name: "Hızlı Şarj Adaptörü",
    desc: "20W PD hızlı şarj destekli",
    category: "sarf",
  },
  {
    id: 6,
    name: "Type-C Şarj Kablosu",
    desc: "1.5m, örgü kablo",
    category: "sarf",
  },
  {
    id: 7,
    name: "Magsafe Powerbank",
    desc: "5000 mAh kablosuz şarj",
    category: "powerbank",
  },
  {
    id: 8,
    name: "Slim Powerbank",
    desc: "10000 mAh, ultra ince gövde",
    category: "powerbank",
  },
];

/* ---- ROUTE'lar ---- */

// Basit admin kullanıcı (ileride DB'den gelecek)
const ADMIN_USER = {
  username: "admin",
  password: "admin123", // şimdilik plain, sonra hash + DB yaparız
};

// Admin koruma middleware'i
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.redirect("/admin/login");
}

// Ürün listesi (admin)
app.get("/admin/products", requireAdmin, (req, res) => {
  res.render("admin/products", { products, categories });
});

// Yeni ürün formu
app.get("/admin/products/new", requireAdmin, (req, res) => {
  res.render("admin/product-form", {
    categories,
    error: null,
  });
});

// Yeni ürün kaydetme
app.post("/admin/products", requireAdmin, (req, res) => {
  const { name, desc, category } = req.body;

  if (!name || !category) {
    return res.render("admin/product-form", {
      categories,
      error: "İsim ve kategori zorunludur.",
    });
  }

  const newProduct = {
    id: products.length ? products[products.length - 1].id + 1 : 1,
    name,
    desc: desc || "",
    category,
  };

  products.push(newProduct);
  res.redirect("/admin/products");
});

// Ürün silme (çok basit)
app.get("/admin/products/delete/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  products = products.filter((p) => p.id !== id);
  res.redirect("/admin/products");
});

// Ana sayfa: öne çıkan ürünler (ilk 4)
app.get("/", (req, res) => {
  res.render("index", { products: products.slice(0, 4) });
});

// Ürünler sayfası + kategori filtresi
app.get("/products", (req, res) => {
  const activeCategory = req.query.cat || "all";

  const filteredProducts =
    activeCategory === "all"
      ? products
      : products.filter((p) => p.category === activeCategory);

  res.render("products", {
    products: filteredProducts,
    categories,
    activeCategory,
  });
});

// ---- ADMIN ROUTES ----

// Login formu
app.get("/admin/login", (req, res) => {
  if (req.session.isAdmin) {
    return res.redirect("/admin");
  }
  res.render("admin/login", { error: null });
});

// Login POST
app.post("/admin/login", (req, res) => {
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
app.get("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin/login");
  });
});

// Admin dashboard (korumalı)
app.get("/admin", requireAdmin, (req, res) => {
  res.render("admin/dashboard", { products, categories });
});

// Basit Hakkımızda & İletişim sayfaları (şimdilik)
app.get("/about", (req, res) => {
  res.render("about");
});

app.get("/contact", (req, res) => {
  res.render("contact");
});

app.listen(PORT, () => {
  console.log(`🚀 Server çalışıyor: http://localhost:${PORT}`);
});