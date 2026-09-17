const express = require("express");
const path = require("path");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// 1. خدمة جميع الملفات الثابتة (CSS, الصور, ملفات الـ HTML الأخرى) من نفس مجلد الـ backend
app.use(express.static(__dirname));

// 2. الصفحة الرئيسية
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "test.html"));
});

// 3. حل سحري لـ Cannot GET: السماح بفتح أي صفحة HTML مباشرة عبر كتابة اسمها في الرابط (مثل /impact.html أو /cart.html)
app.get("/:page", (req, res, next) => {
    const page = req.params.page;
    // التأكد من أن الطلب لملف HTML وليس مسار API
    if (page.endsWith(".html")) {
        const filePath = path.join(__dirname, page);
        return res.sendFile(filePath, (err) => {
            if (err) next(); // لو الملف مش موجود، ينقل للخطأ العادي
        });
    }
    next();
});

// 4. تهيئة SQLite بشكل آمن
let db = null;
try {
    const Database = require("better-sqlite3");
    db = new Database("zell.db");
} catch (err) {
    console.log("SQLite skipped on Vercel environment.");
}

module.exports = app;