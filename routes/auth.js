const express = require("express");
const { createUser, getUserByEmail } = require("../db");
const { hashPassword, verifyPassword } = require("../auth-utils");

module.exports = function authRouter() {
  const router = express.Router();

  router.get("/auth/register", (req, res) => {
    if (req.session.user) {
      return res.redirect("/products");
    }

    res.render("auth/register", {
      error: null,
      form: { name: "", email: "" },
    });
  });

  router.post("/auth/register", (req, res) => {
    const name = (req.body?.name || "").trim();
    const email = (req.body?.email || "").trim().toLowerCase();
    const password = req.body?.password || "";

    const hasBasicFields = name && email && password;
    const passwordStrongEnough = password.length >= 6;

    if (!hasBasicFields || !passwordStrongEnough) {
      return res.render("auth/register", {
        error: "İsim, e-posta ve en az 6 karakterlik şifre zorunludur.",
        form: { name, email },
      });
    }

    const existing = getUserByEmail(email);
    if (existing) {
      return res.render("auth/register", {
        error: "Bu e-posta ile daha önce kayıt oluşturulmuş.",
        form: { name, email },
      });
    }

    const passwordHash = hashPassword(password);
    const userId = createUser({ name, email, passwordHash });

    req.session.user = { id: userId, name, email };
    res.redirect("/products");
  });

  router.get("/auth/login", (req, res) => {
    if (req.session.user) {
      return res.redirect("/products");
    }

    res.render("auth/login", {
      error: null,
      form: { email: "" },
    });
  });

  router.post("/auth/login", (req, res) => {
    const email = (req.body?.email || "").trim().toLowerCase();
    const password = req.body?.password || "";

    const user = getUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.render("auth/login", {
        error: "E-posta veya şifre hatalı.",
        form: { email },
      });
    }

    req.session.user = { id: user.id, name: user.name, email: user.email };
    res.redirect("/products");
  });

  router.get("/auth/logout", (req, res) => {
    if (req.session) {
      delete req.session.user;
    }
    res.redirect("/");
  });

  return router;
};
