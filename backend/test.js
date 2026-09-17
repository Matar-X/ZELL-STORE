const express = require("express");
const path = require("path");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// 1. خدمة ملفات الواجهة (CSS / HTML / Images) من نفس مجلد الـ backend
app.use(express.static(__dirname));

// 2. الصفحة الرئيسية (توجيه مباشر لـ test.html)
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "test.html"));
});

// 3. تهيئة SQLite بشكل آمن (اختياري حالياً)
let db = null;
try {
    const Database = require("better-sqlite3");
    db = new Database("zell.db");
} catch (err) {
    console.log("SQLite skipped on Vercel environment.");
}

module.exports = app;