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
    db = new Database("zell.db");

    // إضافة أعمدة تلقائياً لجدول users في حال عدم وجودها
    try { db.prepare("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'").run(); } catch (err) {}
    try { db.prepare("ALTER TABLE users ADD COLUMN birthdate TEXT").run(); } catch (err) {}
    try { db.prepare("ALTER TABLE users ADD COLUMN birthday_coupon_year INTEGER").run(); } catch (err) {}

    // أعمدة الشحن في جدول الأوردرات
    try { db.prepare("ALTER TABLE orders ADD COLUMN governorate TEXT").run(); } catch (err) {}
    try { db.prepare("ALTER TABLE orders ADD COLUMN shipping_cost REAL DEFAULT 0").run(); } catch (err) {}
    try { db.prepare("ALTER TABLE orders ADD COLUMN delivery_estimate TEXT").run(); } catch (err) {}
    try { db.prepare("ALTER TABLE orders ADD COLUMN coupon_code TEXT").run(); } catch (err) {}

    // Database Tables Initialization
    db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            birthdate TEXT
        )
    `).run();

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
    delta: { cost: 50, deliveryEstimate: "3 DAYS", zoneLabel: "CAIRO & DELTA" },
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
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: "omaralisalama8@gmail.com",
        pass: "wbai ipbb nzan efuf"
    }
});

const ADMIN_EMAILS = [
    "omaralisalama8@gmail.com",
    "nadamoamed73@gmail.com",
    "abdelrahmanahmad266@gmail.com"
];

async function sendOrderEmail(orderDetails) {
    if (!orderDetails || !orderDetails.items) return;
    const itemsList = orderDetails.items
        .map(item => `- ${item.name} | SIZE: ${item.size || 'M'} (x${item.quantity}) - ${item.price} EGP`)
        .join("\n");

    const shipping = orderDetails.shipping || {};
    const costBreakdown = [
        `Subtotal: ${Number(orderDetails.subtotalAmount || 0).toFixed(2)} EGP`,
        orderDetails.discountAmount ? `Discount (${orderDetails.couponCode}): -${Number(orderDetails.discountAmount).toFixed(2)} EGP` : null,
        `Shipping (${shipping.governorate || "-"}): ${Number(shipping.cost || 0).toFixed(2)} EGP`,
        `Total: ${Number(orderDetails.totalAmount || 0).toFixed(2)} EGP`
    ].filter(Boolean).join("\n");

    const deliveryBlock = `
DELIVERY:
--------------------
Governorate: ${shipping.governorate || "-"}
Zone: ${shipping.zoneLabel || "-"}
Estimated delivery: ${shipping.deliveryEstimate || "-"}`;

    const adminEmailText = `
=========================================
NEW ORDER RECEIVED (ADMIN NOTIFICATION)
=========================================
Database Order ID: #${orderDetails.orderId}
Public Order Code: ${orderDetails.publicOrderCode}
Date: ${new Date().toLocaleString()}

CUSTOMER INFORMATION:
--------------------
Name: ${orderDetails.customerName}
Phone: ${orderDetails.phone}
Address: ${orderDetails.address}
User Email: ${orderDetails.userEmail}
${deliveryBlock}

ORDERED ITEMS:
-------------
${itemsList}

COST BREAKDOWN:
-------------
${costBreakdown}
=========================================`;

    const customerEmailText = `
=========================================
ORDER CONFIRMATION - ZELL STORE
=========================================
Date: ${new Date().toLocaleString()}

CUSTOMER INFORMATION:
--------------------
Name: ${orderDetails.customerName}
Phone: ${orderDetails.phone}
Address: ${orderDetails.address}
Email: ${orderDetails.userEmail}
${deliveryBlock}

ORDERED ITEMS:
-------------
${itemsList}

COST BREAKDOWN:
-------------
${costBreakdown}
=========================================

Thank you for shopping with ZELL!
Your order should arrive within ${shipping.deliveryEstimate || "the estimated window"}.`;

    const adminPromises = ADMIN_EMAILS.map(recipient => 
        transporter.sendMail({
            from: '"ZELL Store" <omaralisalama8@gmail.com>',
            to: recipient,
            subject: `🚨 NEW ORDER RECEIVED #${orderDetails.orderId}`,
            text: adminEmailText
        }).catch(e => console.error(`Failed sending to admin ${recipient}:`, e.message))
    );

    const customerPromise = transporter.sendMail({
        from: '"ZELL Store" <omaralisalama8@gmail.com>',
        to: orderDetails.userEmail,
        subject: `Order Confirmation - ZELL Store`,
        text: customerEmailText
    }).catch(e => console.error(`Failed sending customer email to ${orderDetails.userEmail}:`, e.message));

    await Promise.all([...adminPromises, customerPromise]);
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

    try {
        const hashedPassword = await bcrypt.hash(cleanPassword, 10);
        const result = db.prepare(`
            INSERT INTO users (name, email, password, birthdate)
            VALUES (?, ?, ?, ?)
        `).run(cleanName, cleanEmail, hashedPassword, cleanBirthdate);

        res.status(201).json({
            message: "User account created successfully.",
            user: { id: result.lastInsertRowid, name: cleanName, email: cleanEmail }
        });
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({ message: "This email is already registered." });
        }
        res.status(500).json({ message: "Internal server error." });
    }
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

        const createOrderTransaction = db.transaction(() => {
            const orderResult = db.prepare(`
                INSERT INTO orders (user_id, customer_name, phone, address, total_amount, governorate, shipping_cost, delivery_estimate, coupon_code)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(userId, String(customerName).trim(), String(phone).trim(), String(address).trim(), totalAmount, shipping.governorate, shipping.cost, shipping.deliveryEstimate, appliedCouponCode);

            const orderId = orderResult.lastInsertRowid;
            const insertItem = db.prepare(`INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)`);
            for (const item of orderItemsToInsert) {
                insertItem.run(orderId, item.productId, item.quantity, item.price);
            }

            if (appliedCouponCode === "BDAY15" && userId) {
                db.prepare("UPDATE users SET birthday_coupon_year = ? WHERE id = ?").run(new Date().getFullYear(), userId);
            }
            return orderId;
        });

        const orderId = createOrderTransaction();
        const publicOrderCode = "ZLL-" + crypto.randomBytes(3).toString("hex").toUpperCase();

        res.status(201).json({
            message: "Order placed successfully.",
            orderCode: publicOrderCode,
            totalAmount,
            subtotalAmount,
            discountAmount,
            shipping: { governorate: shipping.governorate, zoneLabel: shipping.zoneLabel, cost: shipping.cost, deliveryEstimate: shipping.deliveryEstimate }
        });

        setTimeout(async () => {
            try {
                await sendOrderEmail({
                    orderId, publicOrderCode, totalAmount, customerName, phone, address,
                    userEmail: cleanEmail, items: orderItemsToInsert, subtotalAmount, discountAmount,
                    couponCode: appliedCouponCode, shipping
                });
            } catch (emailErr) {
                console.error("EMAIL ERROR:", emailErr.message);
            }
        }, 10);

    } catch (error) {
        console.error("Checkout transaction error:", error);
        return res.status(500).json({ message: "Failed to process order." });
    }
});

module.exports = app;