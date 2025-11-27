const crypto = require("crypto");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return derivedKey === key;
}

module.exports = { hashPassword, verifyPassword };
