const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const cors = require("cors");
const nodemailer = require("nodemailer");
const path = require("path");

// 1. إنشاء التطبيق أولاً
const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// 2. خدمة ملفات الواجهة (CSS / HTML / Images)
app.use(express.static(path.join(__dirname, "..")));

// 3. الصفحة الرئيسية
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "test.html"));
});

// 4. تهيئة SQLite بشكل آمن
let db = null;
try {
    const Database = require("better-sqlite3");
    db = new Database("zell.db");
} catch (err) {
    console.log("SQLite skipped on Vercel environment.");
}

// 5. تصدير التطبيق في آاخر الملف
module.exports = app;