const Database = require("better-sqlite3");
const path = require("path");

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, "data.db");
const db = new Database(dbPath);

// Tabloyu oluştur (yoksa)
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    price REAL NOT NULL DEFAULT 0,
    image_url TEXT,
    discount_percent REAL NOT NULL DEFAULT 0
  );
`);

// Basit kullanıcı tablosu
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Sipariş tablosu
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    customer_email TEXT,
    total_amount REAL NOT NULL,
    shipping_amount REAL NOT NULL,
    payable_amount REAL NOT NULL,
    items_json TEXT NOT NULL,
    card_brand TEXT,
    card_last4 TEXT,
    status TEXT NOT NULL DEFAULT 'paid',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Kategori tablosu
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    image_url TEXT
  );
`);

// Yorum tablosu
db.exec(`
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    author_name TEXT NOT NULL,
    content TEXT NOT NULL,
    admin_reply TEXT,
    user_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Eski tabloda images_json yoksa ekle (ilk çalıştırmada ekler, sonraki denemelerde hata önemli değil)
try {
  db.exec(`ALTER TABLE products ADD COLUMN images_json TEXT;`);
} catch (err) {
  // muhtemelen "duplicate column name: images_json" → sorun değil
}

try {
  db.exec(`ALTER TABLE categories ADD COLUMN image_url TEXT;`);
} catch (err) {
  // duplicate column name
}

try {
  db.exec(`ALTER TABLE comments ADD COLUMN user_id INTEGER;`);
} catch (err) {
  // duplicate column name
}

// Eski tabloda discount_percent yoksa ekle
try {
  db.exec(
    `ALTER TABLE products ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0;`
  );
} catch (err) {
  // duplicate column name ise yoksay
}

function mapProduct(row) {
  if (!row) return null;
  let images = [];
  if (row.images_json) {
    try {
      const parsed = JSON.parse(row.images_json);
      if (Array.isArray(parsed)) {
        images = parsed;
      }
    } catch (e) {
      // bozuk json ise boş geç
    }
  }
  return { ...row, images, discount_percent: row.discount_percent || 0 };
}

function getAllProducts() {
  const stmt = db.prepare("SELECT * FROM products ORDER BY id DESC");
  return stmt.all().map(mapProduct);
}

function getProductsFiltered({ category = "all", search = "" } = {}) {
  let sql = "SELECT * FROM products WHERE 1=1";
  const params = {};

  if (category && category !== "all") {
    sql += " AND category = @category";
    params.category = category;
  }

  if (search) {
    sql += " AND (name LIKE @search OR description LIKE @search)";
    params.search = `%${search}%`;
  }

  sql += " ORDER BY id DESC";

  const stmt = db.prepare(sql);
  return stmt.all(params).map(mapProduct);
}

function getProductById(id) {
  const stmt = db.prepare("SELECT * FROM products WHERE id = ?");
  const row = stmt.get(id);
  return mapProduct(row);
}

function createProduct({
  name,
  description,
  category,
  stock,
  price,
  images,
  discountPercent = 0,
}) {
  const imagesArray = Array.isArray(images) ? images : [];
  const mainImage = imagesArray[0] || null;
  const imagesJson =
    imagesArray.length > 0 ? JSON.stringify(imagesArray) : null;

  const stmt = db.prepare(
    `INSERT INTO products (name, description, category, stock, price, image_url, images_json, discount_percent)
     VALUES (@name, @description, @category, @stock, @price, @image_url, @images_json, @discount_percent)`
  );
  const info = stmt.run({
    name,
    description,
    category,
    stock,
    price,
    image_url: mainImage,
    images_json: imagesJson,
    discount_percent: discountPercent,
  });
  return info.lastInsertRowid;
}

function updateProduct(id, {
  name,
  description,
  category,
  stock,
  price,
  images,
  discountPercent = 0,
}) {
  const imagesArray = Array.isArray(images) ? images : [];
  const mainImage = imagesArray[0] || null;
  const imagesJson =
    imagesArray.length > 0 ? JSON.stringify(imagesArray) : null;

  const stmt = db.prepare(
    `UPDATE products
     SET name = @name,
         description = @description,
         category = @category,
         stock = @stock,
         price = @price,
         image_url = @image_url,
         images_json = @images_json,
         discount_percent = @discount_percent
     WHERE id = @id`
  );

  stmt.run({
    id,
    name,
    description,
    category,
    stock,
    price,
    image_url: mainImage,
    images_json: imagesJson,
    discount_percent: discountPercent,
  });
}

function deleteProduct(id) {
  const stmt = db.prepare("DELETE FROM products WHERE id = ?");
  return stmt.run(id);
}

/* ---- Kullanıcı işlemleri ---- */

function createUser({ name, email, passwordHash }) {
  const stmt = db.prepare(`
    INSERT INTO users (name, email, password_hash)
    VALUES (@name, @email, @password_hash)
  `);

  const info = stmt.run({
    name,
    email,
    password_hash: passwordHash,
  });

  return info.lastInsertRowid;
}

function getUserByEmail(email) {
  const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
  return stmt.get(email);
}

function getUserById(id) {
  const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
  return stmt.get(id);
}

function getStats() {
  const totalProducts = db.prepare("SELECT COUNT(*) as c FROM products").get()
    .c;
  const totalStock = db
    .prepare("SELECT COALESCE(SUM(stock),0) as s FROM products")
    .get().s;
  const totalCategories = db
    .prepare("SELECT COUNT(DISTINCT category) as c FROM products")
    .get().c;

  return { totalProducts, totalStock, totalCategories };
}

function getFeatured(limit = 4) {
  const stmt = db.prepare(
    "SELECT * FROM products ORDER BY id DESC LIMIT ?"
  );
  return stmt.all(limit).map(mapProduct);
}

/* ---- Kategoriler ---- */

function ensureDefaultCategories(defaults = []) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO categories (id, label, image_url) VALUES (@id, @label, @image_url)
  `);
  defaults.forEach((cat) => {
    if (cat?.id && cat?.label) {
      stmt.run({ id: cat.id, label: cat.label, image_url: cat.image_url || null });
    }
  });
}

function getAllCategories() {
  const stmt = db.prepare("SELECT * FROM categories ORDER BY label ASC");
  return stmt.all();
}

function createCategory({ id, label, imageUrl }) {
  const stmt = db.prepare(`
    INSERT INTO categories (id, label, image_url) VALUES (@id, @label, @image_url)
  `);
  const info = stmt.run({ id, label, image_url: imageUrl || null });
  return info.lastInsertRowid;
}

function deleteCategory(id) {
  const stmt = db.prepare("DELETE FROM categories WHERE id = ?");
  return stmt.run(id);
}

function countProductsByCategory(id) {
  const stmt = db.prepare("SELECT COUNT(*) as c FROM products WHERE category = ?");
  return stmt.get(id).c;
}

/* ---- Yorumlar ---- */
function addComment({ productId, authorName, content, userId = null }) {
  const stmt = db.prepare(`
    INSERT INTO comments (product_id, author_name, content, user_id)
    VALUES (@product_id, @author_name, @content, @user_id)
  `);
  const info = stmt.run({
    product_id: productId,
    author_name: authorName,
    content,
    user_id: userId,
  });
  return info.lastInsertRowid;
}

function getComments({ productId } = {}) {
  let sql = "SELECT * FROM comments";
  const params = {};
  if (productId) {
    sql += " WHERE product_id = @productId";
    params.productId = productId;
  }
  sql += " ORDER BY id DESC";
  return db.prepare(sql).all(params);
}

function replyComment(id, replyText) {
  const stmt = db.prepare(
    "UPDATE comments SET admin_reply = @reply WHERE id = @id"
  );
  return stmt.run({ id, reply: replyText });
}

function deleteCommentById(id) {
  const stmt = db.prepare("DELETE FROM comments WHERE id = ?");
  return stmt.run(id);
}

function updateCommentContent(id, content) {
  const stmt = db.prepare("UPDATE comments SET content = @content WHERE id = @id");
  return stmt.run({ id, content });
}

/* ---- Siparişler ---- */
function createOrder({
  code,
  customer_name,
  customer_email,
  total_amount,
  shipping_amount,
  payable_amount,
  items_json,
  card_brand,
  card_last4,
  status = "paid",
}) {
  const stmt = db.prepare(`
    INSERT INTO orders
      (code, customer_name, customer_email, total_amount, shipping_amount, payable_amount, items_json, card_brand, card_last4, status)
    VALUES
      (@code, @customer_name, @customer_email, @total_amount, @shipping_amount, @payable_amount, @items_json, @card_brand, @card_last4, @status)
  `);
  const info = stmt.run({
    code,
    customer_name,
    customer_email,
    total_amount,
    shipping_amount,
    payable_amount,
    items_json,
    card_brand,
    card_last4,
    status,
  });
  return info.lastInsertRowid;
}

module.exports = {
  getAllProducts,
  getProductsFiltered,
  getProductById,
  createProduct,
  deleteProduct,
  getStats,
  getFeatured,
  updateProduct,
  db,
  createUser,
  getUserByEmail,
  getUserById,
  ensureDefaultCategories,
  getAllCategories,
  createCategory,
  deleteCategory,
  countProductsByCategory,
  createOrder,
  addComment,
  getComments,
  replyComment,
  deleteCommentById,
  updateCommentContent,
};
