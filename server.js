const express = require("express");
const path = require("path");
const session = require("express-session");
const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const multer = require("multer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const shopRouter = require("./routes/shop");
const authRouter = require("./routes/auth");
const adminRouter = require("./routes/admin");
const checkoutRouter = require("./routes/checkout");

const {
  ensureDefaultCategories,
  getAllCategories,
} = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const HTTPS_KEY_PATH = process.env.HTTPS_KEY_PATH;
const HTTPS_CERT_PATH = process.env.HTTPS_CERT_PATH;
const HTTPS_ENABLED = process.env.HTTPS_ENABLED === "true";
const uploadsDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Security middleware
app.use(
  helmet({
    // Safari ile yaşanan CSS yükleme sorunları için CSP şimdilik kapalı.
    contentSecurityPolicy: false,
  })
);
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const unique = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname || ".jpg") || ".jpg";
    cb(null, `img-${unique}${ext}`);
  },
});

function isSafeImage(file) {
  return (
    file &&
    /^image\//.test(file.mimetype || "") &&
    /\.(png|jpe?g|gif|webp)$/i.test(file.originalname || "")
  );
}

// Basit magic-number kontrolü (opsiyonel AV için hook)
function hasValidMagic(buffer) {
  if (!buffer || buffer.length < 4) return false;
  const jpg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const png =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const gif =
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38;
  return jpg || png || gif;
}

// AV taraması için placeholder (ör: clamav entegrasyonu burada çağrılabilir)
async function scanFileForMalware() {
  return true;
}

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (!isSafeImage(file)) {
      return cb(new Error("Sadece görsel dosyaları yükleyebilirsiniz."));
    }
    // Magic number check (multer 2 buffer yoksa skip)
    if (file.buffer && !hasValidMagic(file.buffer)) {
      return cb(new Error("Geçersiz görsel dosyası."));
    }
    return cb(null, true);
  },
});

/* ---- Kategoriler ---- */
const DEFAULT_CATEGORIES = [
  { id: "kilif", label: "Kılıflar", image_url: "https://images.unsplash.com/photo-1571171637578-41bc2dd41cd2?auto=format&fit=crop&w=600&q=80" },
  { id: "cam", label: "Cam Koruyucu", image_url: "https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=600&q=80" },
  { id: "sarf", label: "Şarj & Kablo", image_url: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80" },
  { id: "powerbank", label: "Powerbank", image_url: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=600&q=80" },
  { id: "kulaklik", label: "Kulaklık", image_url: "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=600&q=80" },
  { id: "sarjcihazlari", label: "Şarj Cihazları", image_url: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=600&q=80" },
  { id: "kablo", label: "Kablolar", image_url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80" },
];
ensureDefaultCategories(DEFAULT_CATEGORIES);

/* ---- View & statik ayarları ---- */

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true })); // form verisi için
app.use("/auth/login", authLimiter);
app.use("/admin/login", authLimiter);
app.use("/checkout", checkoutLimiter);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "cok-gizli-bir-anahtar", // PROD'da .env
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 gün
    },
  })
);

/* ---- Tüm view'lara ortak değişkenler ---- */

app.use((req, res, next) => {
  const baseCategories = getAllCategories();
  const categories = [{ id: "all", label: "Tümü" }, ...baseCategories];

  const cart = req.session?.cart || [];
  const itemCount = cart.reduce((sum, item) => sum + item.qty, 0);

  res.locals.cartCount = itemCount;
  res.locals.searchQuery = (req.query?.q || "").trim();
  // Oturum açmış alıcı bilgisi
  res.locals.currentUser = req.session?.user || null;
  res.locals.isAdmin = !!req.session?.isAdmin;
  res.locals.categories = categories;
  res.locals.baseCategories = baseCategories;
  req.categories = baseCategories;

  next();
});

/* ---- ROUTER'LAR ---- */
app.use("/", shopRouter({ upload }));
app.use("/", authRouter());
app.use("/", checkoutRouter());
app.use("/admin", adminRouter({ upload }));

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  const isHtml = req.accepts("html");
  const message =
    process.env.NODE_ENV === "production"
      ? "Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin."
      : err.message || "Beklenmeyen hata";

  if (isHtml) {
    return res
      .status(500)
      .send(
        `<h1>Hata</h1><p>${message}</p><p>${process.env.NODE_ENV === "production" ? "" : (err.stack || "")}</p>`
      );
  }

  return res.status(500).json({ error: message });
});

/* ---- SERVER ---- */

const httpServer = app.listen(PORT, () => {
  console.log(`🚀 HTTP server: http://localhost:${PORT}`);
});

if (HTTPS_ENABLED && HTTPS_KEY_PATH && HTTPS_CERT_PATH) {
  try {
    const key = fs.readFileSync(HTTPS_KEY_PATH);
    const cert = fs.readFileSync(HTTPS_CERT_PATH);
    https
      .createServer({ key, cert }, app)
      .listen(HTTPS_PORT, () => {
        console.log(`🔒 HTTPS server: https://localhost:${HTTPS_PORT}`);
      });
  } catch (err) {
    console.error("HTTPS başlatılırken hata:", err.message);
  }
}
