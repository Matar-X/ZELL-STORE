const { Resend } = require("resend");
const resend = new Resend(process.env.re_ZnTxgc1p_9LRPMMJxdcxF69NvWSheZEhq);
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const cors = require("cors");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// 1. خدمة جميع الملفات الثابتة (CSS, الصور, ملفات الـ HTML) من نفس مجلد الـ backend
app.use(express.static(__dirname));

// 2. الصفحة الرئيسية
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "test.html"));
});

// 3. حل مشكلة Cannot GET لجميع صفحات الـ HTML الأخرى تلقائياً
app.get("/:page", (req, res, next) => {
    const page = req.params.page;
    if (page.endsWith(".html")) {
        const filePath = path.join(__dirname, page);
        return res.sendFile(filePath, (err) => {
            if (err) next();
        });
    }
    next();
});

// ==============================
// DATABASE SETUP (Vercel Safe)
// ==============================
let db = null;
try {
    const Database = require("better-sqlite3");
    const fs = require('fs');
    // تحديد مسار آمن للقاعدة سواء محلياً أو على Vercel
  const dbPath = "zell.db";

    db = new Database(dbPath);

    // Database Tables Initialization
    db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            birthdate TEXT,
            birthday_coupon_year INTEGER,
            email_verified INTEGER DEFAULT 0,
            verification_code TEXT,
            verification_expires TEXT
        )
    `).run();

    // إضافة أعمدة تلقائياً لجدول users في حال كانت قاعدة بيانات قديمة وناقصة الأعمدة دي
    try { db.prepare("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'").run(); } catch (err) {}
    try { db.prepare("ALTER TABLE users ADD COLUMN birthdate TEXT").run(); } catch (err) {}
    try { db.prepare("ALTER TABLE users ADD COLUMN birthday_coupon_year INTEGER").run(); } catch (err) {}
    try { db.prepare("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0").run(); } catch (err) {}
    try { db.prepare("ALTER TABLE users ADD COLUMN verification_code TEXT").run(); } catch (err) {}
    try { db.prepare("ALTER TABLE users ADD COLUMN verification_expires TEXT").run(); } catch (err) {}

    db.prepare(`
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            collection TEXT NOT NULL,
            description TEXT NOT NULL,
            image TEXT NOT NULL
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            customer_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            address TEXT NOT NULL,
            total_amount REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            governorate TEXT,
            shipping_cost REAL DEFAULT 0,
            delivery_estimate TEXT,
            coupon_code TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    `).run();

    // إضافة عمود المقاس لجدول order_items في حال عدم وجوده
    try { db.prepare("ALTER TABLE order_items ADD COLUMN size TEXT DEFAULT 'M'").run(); } catch (err) {}

    // ==============================
    // STOCK PER SIZE
    // ==============================
    db.prepare(`
        CREATE TABLE IF NOT EXISTS product_stock (
            product_id INTEGER NOT NULL,
            size TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (product_id, size),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    `).run();

    const AVAILABLE_SIZES = ["M", "L", "XL", "XXL"];
    const DEFAULT_STOCK_PER_SIZE = 6;

    // INITIAL PRODUCTS
    const productCount = db.prepare("SELECT COUNT(*) AS count FROM products").get();
    if (productCount.count === 0) {
        const insertProduct = db.prepare(`
            INSERT INTO products (name, price, collection, description, image)
            VALUES (?, ?, ?, ?, ?)
        `);
        insertProduct.run("THE LAST SEAT", 950, "IMAGINATION", "Some things leave before we notice.", "images/sudden-abduction.png");
        insertProduct.run("THE LAST TRACE", 950, "IMPACT", "What happens may disappear. The impact remains.", "images/sudden-abduction-impact.png");
    }

    // تأكد إن كل منتج له صف مخزون لكل مقاس (6 قطع افتراضيًا لكل مقاس)
    const allProducts = db.prepare("SELECT id FROM products").all();
    const insertStockIfMissing = db.prepare(`
        INSERT OR IGNORE INTO product_stock (product_id, size, quantity)
        VALUES (?, ?, ?)
    `);
    for (const product of allProducts) {
        for (const size of AVAILABLE_SIZES) {
            insertStockIfMissing.run(product.id, size, DEFAULT_STOCK_PER_SIZE);
        }
    }
} catch (err) {
    console.log("SQLite skipped or error in Vercel environment:", err.message);
}

// ==============================
// SHIPPING ZONES CONFIGURATION
// ==============================
const CAIRO_DELTA_GOVERNORATES = [
    "Cairo", "Giza", "Qalyubia", "Sharqia", "Gharbia",
    "Monufia", "Dakahlia", "Kafr El Sheikh", "Damietta", "Beheira"
];

const OTHER_GOVERNORATES = [
    "Alexandria", "Matrouh", "North Sinai", "South Sinai", "Port Said",
    "Ismailia", "Suez", "Fayoum", "Beni Suef", "Minya", "Assiut",
    "Sohag", "Qena", "Luxor", "Aswan", "Red Sea", "New Valley"
];

const SHIPPING_RULES = {
    delta: { cost: 70, deliveryEstimate: "3 DAYS", zoneLabel: "CAIRO & DELTA" },
    other: { cost: 90, deliveryEstimate: "1 WEEK", zoneLabel: "OUTSIDE CAIRO & DELTA" }
};

function normalizeGovernorate(value) {
    return String(value || "").trim().toLowerCase();
}

function getShippingForGovernorate(governorate) {
    const clean = normalizeGovernorate(governorate);
    if (!clean) return null;

    const isDelta = CAIRO_DELTA_GOVERNORATES.some(name => normalizeGovernorate(name) === clean);
    if (isDelta) {
        const match = CAIRO_DELTA_GOVERNORATES.find(name => normalizeGovernorate(name) === clean);
        return { governorate: match, zone: "delta", ...SHIPPING_RULES.delta };
    }

    const match = OTHER_GOVERNORATES.find(name => normalizeGovernorate(name) === clean);
    if (!match) return null;

    return { governorate: match, zone: "other", ...SHIPPING_RULES.other };
}

// ==============================
// BIRTHDAY HELPERS
// ==============================
function toMMDD(dateObject) {
    return `${String(dateObject.getMonth() + 1).padStart(2, "0")}-${String(dateObject.getDate()).padStart(2, "0")}`;
}

function isBirthdayToday(birthdate) {
    if (!birthdate) return false;
    const parts = String(birthdate).trim().split("-");
    if (parts.length !== 3) return false;
    return `${parts[1]}-${parts[2]}` === toMMDD(new Date());
}

// ==============================
// NODEMAILER CONFIGURATION
// ==============================
// ==============================
// NODEMAILER CONFIGURATION
// ==============================
// ==============================
// NODEMAILER CONFIGURATION
// ==============================
// ==============================
// NODEMAILER CONFIGURATION (Railway IPv4 Fix)
// ==============================
// ==============================
// RESEND EMAIL CONFIGURATION
// ==============================
const { Resend } = require("resend");


const ADMIN_EMAILS = [
    "omaralisalama8@gmail.com",
    "nadamoamed73@gmail.com",
    "abdelrahmanahmad266@gmail.com"
];

async function sendOrderEmail(orderDetails) {
    if (!orderDetails || !orderDetails.items) return;

    // 1. تجهيز قائمة المنتجات
    const itemsList = orderDetails.items
        .map(item => `<li><strong>${item.name}</strong> | SIZE: ${item.size || 'M'} (x${item.quantity}) - ${item.price} EGP</li>`)
        .join("");

    const shipping = orderDetails.shipping || {};
    const costBreakdown = `
        <p><strong>Subtotal:</strong> ${Number(orderDetails.subtotalAmount || 0).toFixed(2)} EGP</p>
        ${orderDetails.discountAmount ? `<p><strong>Discount (${orderDetails.couponCode}):</strong> -${Number(orderDetails.discountAmount).toFixed(2)} EGP</p>` : ""}
        <p><strong>Shipping (${shipping.governorate || "-"}):</strong> ${Number(shipping.cost || 0).toFixed(2)} EGP</p>
        <h3><strong>Total:</strong> ${Number(orderDetails.totalAmount || 0).toFixed(2)} EGP</h3>
    `;

    // 2. تصميم رسالة الأدمن (فيها الآيدي وتفاصيل العميل والطلب)
    const adminHtmlText = `
        <h2>🚨 NEW ORDER RECEIVED (ADMIN NOTIFICATION)</h2>
        <p><strong>Database Order ID:</strong> #${orderDetails.orderId}</p>
        <p><strong>Public Order Code:</strong> ${orderDetails.publicOrderCode}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
        <hr>
        <h3>CUSTOMER INFORMATION</h3>
        <p><strong>Name:</strong> ${orderDetails.customerName}</p>
        <p><strong>Phone:</strong> ${orderDetails.phone}</p>
        <p><strong>Address:</strong> ${orderDetails.address}</p>
        <p><strong>User Email:</strong> ${orderDetails.userEmail}</p>
        <p><strong>Governorate:</strong> ${shipping.governorate || "-"}</p>
        <p><strong>Estimated Delivery:</strong> ${shipping.deliveryEstimate || "-"}</p>
        <hr>
        <h3>ORDERED ITEMS</h3>
        <ul>${itemsList}</ul>
        <hr>
        <h3>COST BREAKDOWN</h3>
        ${costBreakdown}
    `;

    // 3. تصميم رسالة العميل (تأكيد الطلب)
    const customerHtmlText = `
        <h2>ORDER CONFIRMATION - ZELL STORE</h2>
        <p>Hi ${orderDetails.customerName}, thank you for your order!</p>
        <p><strong>Order Code:</strong> ${orderDetails.publicOrderCode}</p>
        <p><strong>Estimated Delivery:</strong> ${shipping.deliveryEstimate || "-"}</p>
        <hr>
        <h3>ORDERED ITEMS</h3>
        <ul>${itemsList}</ul>
        <hr>
        <h3>COST BREAKDOWN</h3>
        ${costBreakdown}
        <hr>
        <p>We are preparing your order now!</p>
    `;

    try {
        // 📧 الرسالة الأولى: بتتبعت للـ 3 أدمنز مع بعض في نفس الوقت
        const adminPromise = resend.emails.send({
            from: "ZELL Store <onboarding@resend.dev>",
            to: ADMIN_EMAILS, // مصفوفة الـ 3 إيميلات بتوع الأدمن
            subject: `🚨 NEW ORDER RECEIVED #${orderDetails.orderId}`,
            html: adminHtmlText
        });

        // 📧 الرسالة الثانية: بتتبعت لإيميل العميل (Customer) فقط
        const customerPromise = resend.emails.send({
            from: "ZELL Store <onboarding@resend.dev>",
            to: orderDetails.userEmail, // إيميل العميل
            subject: "Order Confirmation - ZELL Store",
            html: customerHtmlText
        });

        // تشغيل الإرسال للإثنين في نفس الوقت
        await Promise.all([adminPromise, customerPromise]);
        console.log(`✅ Order emails sent successfully to Admins & Customer for order #${orderDetails.orderId}`);

    } catch (error) {
        console.error("❌ Resend Order Email Error:", error.message);
    }
}

// HELPER FUNCTIONS & AUTH MIDDLEWARE
function createSession(userId) {
    if (!db) return null;
    const token = crypto.randomBytes(32).toString("hex");
    db.prepare(`INSERT INTO sessions (token, user_id) VALUES (?, ?)`).run(token, userId);
    return token;
}

function authenticateToken(req, res, next) {
    if (!db) return res.status(500).json({ message: "Database unavailable." });
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

    if (!token) return res.status(401).json({ message: "Unauthorized: Access token is missing." });

    const user = db.prepare(`
        SELECT users.id, users.name, users.email, users.role, users.birthdate
        FROM users
        INNER JOIN sessions ON users.id = sessions.user_id
        WHERE sessions.token = ?
    `).get(token);

    if (!user) return res.status(401).json({ message: "Unauthorized: Invalid or expired session." });

    req.user = user;
    req.token = token;
    next();
}

function getUserFromRequest(req) {
    if (!db) return null;
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
    if (!token) return null;

    return db.prepare(`
        SELECT users.id, users.name, users.email, users.birthdate, users.birthday_coupon_year
        FROM users
        INNER JOIN sessions ON users.id = sessions.user_id
        WHERE sessions.token = ?
    `).get(token) || null;
}

// COUPON ENGINE
function evaluateCoupon(couponCode, user) {
    const code = String(couponCode || "").trim().toUpperCase();
    if (!code) return { valid: false, rate: 0, code: "", message: "Please enter a coupon code." };

    if (code === "ZELL10") {
        return { valid: true, rate: 0.10, code, label: "DISCOUNT (10%)", message: "Coupon ZELL10 applied (10% OFF)." };
    }

    if (code === "BDAY15") {
        if (!user) return { valid: false, rate: 0, code, message: "BDAY15 is only available for signed-in accounts." };
        if (!user.birthdate) return { valid: false, rate: 0, code, message: "Add your birthdate in your account to use BDAY15." };
        if (!isBirthdayToday(user.birthdate)) return { valid: false, rate: 0, code, message: "BDAY15 is only valid on your birthday." };

        const currentYear = new Date().getFullYear();
        if (user.birthday_coupon_year === currentYear) {
            return { valid: false, rate: 0, code, message: "You already used your birthday discount this year." };
        }

        return { valid: true, rate: 0.15, code, label: "BIRTHDAY DISCOUNT (15%)", message: "Happy birthday! BDAY15 applied (15% OFF)." };
    }

    return { valid: false, rate: 0, code, message: "Invalid coupon code." };
}

// API ROUTES
app.get("/products", (req, res) => {
    if (!db) return res.json([]);
    const products = db.prepare("SELECT * FROM products ORDER BY id ASC").all();
    res.json(products);
});

app.get("/products/:id", (req, res) => {
    if (!db) return res.status(500).json({ message: "Database unavailable." });
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found." });

    const stockRows = db.prepare("SELECT size, quantity FROM product_stock WHERE product_id = ?").all(product.id);
    const stock = {};
    stockRows.forEach(row => { stock[row.size] = row.quantity; });

    res.json({ ...product, stock });
});

app.get("/shipping-zones", (req, res) => {
    const zones = [
        ...CAIRO_DELTA_GOVERNORATES.map(name => ({ governorate: name, zone: "delta", ...SHIPPING_RULES.delta })),
        ...OTHER_GOVERNORATES.map(name => ({ governorate: name, zone: "other", ...SHIPPING_RULES.other }))
    ];
    res.json({ zones });
});

app.post("/validate-coupon", (req, res) => {
    const user = getUserFromRequest(req);
    const result = evaluateCoupon(req.body && req.body.couponCode, user);
    res.json(result);
});

function generateVerificationCode() {
    return String(crypto.randomInt(100000, 999999));
}

async function sendVerificationEmail(email, name, code) {
    try {
        await resend.emails.send({
            from: "ZELL Store <onboarding@resend.dev>",
            to: email,
            subject: "Your ZELL verification code",
            html: `
                <div style="font-family: sans-serif; padding: 20px; color: #333;">
                    <h2>Hi ${name},</h2>
                    <p>Your ZELL verification code is:</p>
                    <h1 style="background: #f4f4f4; display: inline-block; padding: 10px 20px; letter-spacing: 4px;">${code}</h1>
                    <p>This code expires in 15 minutes. Enter it on the site to activate your account.</p>
                    <p>If you didn't request this, you can ignore this email.</p>
                </div>
            `
        });
        console.log(`✅ Verification email sent to ${email}`);
    } catch (error) {
        console.error("❌ Resend Verification Email Error:", error.message);
        throw error;
    }
}

app.post("/register", async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database unavailable." });
    const { name, email, password, birthdate } = req.body;
    const cleanName = String(name || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(password || "");
    const cleanBirthdate = birthdate ? String(birthdate).trim() : null;

    if (!cleanName || !cleanEmail || !cleanPassword) {
        return res.status(400).json({ message: "Name, email, and password are required." });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(cleanEmail)) {
        return res.status(400).json({ message: "Please enter a valid email address." });
    }

    try {
        const hashedPassword = await bcrypt.hash(cleanPassword, 10);
        const code = generateVerificationCode();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        const result = db.prepare(`
            INSERT INTO users (name, email, password, birthdate, email_verified, verification_code, verification_expires)
            VALUES (?, ?, ?, ?, 0, ?, ?)
        `).run(cleanName, cleanEmail, hashedPassword, cleanBirthdate, code, expiresAt);

        try {
            await sendVerificationEmail(cleanEmail, cleanName, code);
        } catch (mailErr) {
            console.error("VERIFICATION EMAIL ERROR:", mailErr.message);
            return res.status(500).json({ message: "Account created but we couldn't send the verification email. Please try resending it." });
        }

        res.status(201).json({
            message: "Account created. Check your email for a verification code.",
            requiresVerification: true,
            user: { id: result.lastInsertRowid, name: cleanName, email: cleanEmail }
        });
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({ message: "This email is already registered." });
        }
        res.status(500).json({ message: "Internal server error." });
    }
});

app.post("/verify-email", async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database unavailable." });
    const { email, code } = req.body;
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanCode = String(code || "").trim();

    if (!cleanEmail || !cleanCode) {
        return res.status(400).json({ message: "Email and verification code are required." });
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(cleanEmail);
    if (!user) return res.status(404).json({ message: "Account not found." });

    if (user.email_verified) {
        const sessionToken = createSession(user.id);
        return res.json({ message: "Email already verified.", sessionToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    }

    if (!user.verification_code || user.verification_code !== cleanCode) {
        return res.status(400).json({ message: "Incorrect verification code." });
    }

    if (!user.verification_expires || new Date(user.verification_expires) < new Date()) {
        return res.status(400).json({ message: "This code has expired. Please request a new one." });
    }

    db.prepare(`
        UPDATE users SET email_verified = 1, verification_code = NULL, verification_expires = NULL
        WHERE id = ?
    `).run(user.id);

    const sessionToken = createSession(user.id);
    res.json({
        message: "Email verified successfully.",
        sessionToken,
        user: { id: user.id, name: user.name, email: user.email, role: user.role, birthdate: user.birthdate || null }
    });
});

app.post("/resend-verification", async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database unavailable." });
    const { email } = req.body;
    const cleanEmail = String(email || "").trim().toLowerCase();

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(cleanEmail);
    if (!user) return res.status(404).json({ message: "Account not found." });
    if (user.email_verified) return res.status(400).json({ message: "This email is already verified." });

    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    db.prepare("UPDATE users SET verification_code = ?, verification_expires = ? WHERE id = ?").run(code, expiresAt, user.id);

    try {
        await sendVerificationEmail(cleanEmail, user.name, code);
    } catch (mailErr) {
        console.error("RESEND VERIFICATION EMAIL ERROR:", mailErr.message);
        return res.status(500).json({ message: "Failed to send the verification email. Please try again shortly." });
    }

    res.json({ message: "A new verification code has been sent to your email." });
});

app.post("/login", async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database unavailable." });
    const { email, password } = req.body;
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(password || "");

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(cleanEmail);
    if (!user) return res.status(401).json({ message: "Invalid email or password." });

    const isMatch = await bcrypt.compare(cleanPassword, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid email or password." });

    if (!user.email_verified) {
        return res.status(403).json({
            message: "Please verify your email before signing in.",
            requiresVerification: true,
            email: user.email
        });
    }

    const sessionToken = createSession(user.id);
    res.json({
        message: "Login successful.",
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            birthdate: user.birthdate || null,
            isBirthdayToday: isBirthdayToday(user.birthdate)
        },
        sessionToken
    });
});

app.get("/me", authenticateToken, (req, res) => {
    res.json({
        user: {
            ...req.user,
            birthdate: req.user.birthdate || null,
            isBirthdayToday: isBirthdayToday(req.user.birthdate)
        }
    });
});

app.patch("/profile", authenticateToken, async (req, res) => {
    if (!db) return res.status(500).json({ message: "Database unavailable." });
    const { name, birthdate } = req.body;
    const userId = req.user.id;

    try {
        const currentUser = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
        if (!currentUser) return res.status(404).json({ message: "User not found." });

        const newName = name ? String(name).trim() : currentUser.name;
        const newBirthdate = (!currentUser.birthdate && birthdate) ? String(birthdate).trim() : currentUser.birthdate;

        db.prepare("UPDATE users SET name = ?, birthdate = ? WHERE id = ?").run(newName, newBirthdate, userId);

        const updatedUser = db.prepare("SELECT id, name, email, role, birthdate FROM users WHERE id = ?").get(userId);
        res.json({
            message: "Profile updated successfully.",
            user: updatedUser
        });
    } catch (error) {
        console.error("Profile update error:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});

app.post("/logout", authenticateToken, (req, res) => {
    if (db) db.prepare("DELETE FROM sessions WHERE token = ?").run(req.token);
    res.json({ message: "Logged out successfully." });
});

app.post("/checkout", async (req, res) => {
    try {
        if (!db) return res.status(500).json({ message: "Database unavailable." });
        const { items, customerName, phone, address, userEmail, couponCode, governorate } = req.body;

        const sessionUser = getUserFromRequest(req);
        const userId = sessionUser ? sessionUser.id : null;
        const finalEmail = sessionUser ? sessionUser.email : userEmail;

        const cleanEmail = String(finalEmail || "").trim().toLowerCase();
        if (!cleanEmail) return res.status(400).json({ message: "Customer email is required." });
        if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "Cart is empty." });

        let subtotalAmount = 0;
        const orderItemsToInsert = items.map((item) => {
            const productId = Number(item.productId || 1);
            const quantity = Number(item.quantity || 1);
            const price = Number(item.price || 0);
            const size = String(item.size || "M").trim();
            subtotalAmount += price * quantity;
            return { productId, quantity, price, name: item.name || "Product", size };
        });

        const shipping = getShippingForGovernorate(governorate);
        if (!shipping) return res.status(400).json({ message: "Please select a valid governorate for delivery." });

        let discountAmount = 0;
        let appliedCouponCode = null;

        if (couponCode && String(couponCode).trim() !== "") {
            const coupon = evaluateCoupon(couponCode, sessionUser);
            if (!coupon.valid) return res.status(400).json({ message: coupon.message });
            discountAmount = subtotalAmount * coupon.rate;
            appliedCouponCode = coupon.code;
        }

        const totalAmount = subtotalAmount - discountAmount + shipping.cost;

        // التحقق من توفر المخزون لكل قطعة قبل تنفيذ الأوردر
        for (const item of orderItemsToInsert) {
            const stockRow = db.prepare(
                "SELECT quantity FROM product_stock WHERE product_id = ? AND size = ?"
            ).get(item.productId, item.size);

            const availableQty = stockRow ? stockRow.quantity : 0;
            if (availableQty < item.quantity) {
                return res.status(409).json({
                    message: `Sorry, "${item.name}" in size ${item.size} is sold out or has less stock than requested.`
                });
            }
        }

        // تنفيذ عملية إنشاء الطلب وخصم المخزون داخل Transaction
        const createOrderTransaction = db.transaction(() => {
            const orderResult = db.prepare(`
                INSERT INTO orders (user_id, customer_name, phone, address, total_amount, governorate, shipping_cost, delivery_estimate, coupon_code)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(userId, String(customerName).trim(), String(phone).trim(), String(address).trim(), totalAmount, shipping.governorate, shipping.cost, shipping.deliveryEstimate, appliedCouponCode);

            const orderId = orderResult.lastInsertRowid;
            const insertItem = db.prepare(`INSERT INTO order_items (order_id, product_id, quantity, price, size) VALUES (?, ?, ?, ?, ?)`);
            const decrementStock = db.prepare(`
                UPDATE product_stock 
                SET quantity = quantity - ? 
                WHERE product_id = ? AND size = ?
            `);

            for (const item of orderItemsToInsert) {
                insertItem.run(orderId, item.productId, item.quantity, item.price, item.size);
                decrementStock.run(item.quantity, item.productId, item.size);
            }

            // إذا تم استخدام كود الخصم الخاص بعيد الميلاد، يسجل السنة لعدم تكرار استخدامه
            if (appliedCouponCode === "BDAY15" && userId) {
                const currentYear = new Date().getFullYear();
                db.prepare("UPDATE users SET birthday_coupon_year = ? WHERE id = ?").run(currentYear, userId);
            }

            return orderId;
        });

        const orderId = createOrderTransaction();
        const publicOrderCode = `ZELL-${1000 + Number(orderId)}`;

        const orderDetails = {
            orderId,
            publicOrderCode,
            customerName: String(customerName).trim(),
            phone: String(phone).trim(),
            address: String(address).trim(),
            userEmail: cleanEmail,
            items: orderItemsToInsert,
            subtotalAmount,
            discountAmount,
            couponCode: appliedCouponCode,
            totalAmount,
            shipping
        };

       // إرسال الإيميلات في الخلفية بدون تعطيل الـ Checkout
sendOrderEmail(orderDetails).catch(err => console.error("ORDER EMAIL BG ERROR:", err.message));

res.status(201).json({
    message: "Order placed successfully.",
    orderId,
    orderCode: publicOrderCode,
    shipping
});

    } catch (error) {
        console.error("CHECKOUT ERROR:", error);
        res.status(500).json({ message: "Failed to process order." });
    }
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`ZELL Server running on port ${PORT}`);
});