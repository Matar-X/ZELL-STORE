const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const cors = require("cors");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();

// ==============================
// SQLITE SAFE INITIALIZATION (VERCEL FRIENDLY)
// ==============================
let db = null;
try {
    const Database = require("better-sqlite3");
    db = new Database("zell.db");
    
    // Create Tables safely
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

    // Migrations
    try { db.prepare("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'").run(); } catch (err) {}
    try { db.prepare("ALTER TABLE users ADD COLUMN birthdate TEXT").run(); } catch (err) {}
    try { db.prepare("ALTER TABLE users ADD COLUMN birthday_coupon_year INTEGER").run(); } catch (err) {}
    try { db.prepare("ALTER TABLE orders ADD COLUMN governorate TEXT").run(); } catch (err) {}
    try { db.prepare("ALTER TABLE orders ADD COLUMN shipping_cost REAL DEFAULT 0").run(); } catch (err) {}
    try { db.prepare("ALTER TABLE orders ADD COLUMN delivery_estimate TEXT").run(); } catch (err) {}
    try { db.prepare("ALTER TABLE orders ADD COLUMN coupon_code TEXT").run(); } catch (err) {}

    // Initial products
    const productCount = db.prepare("SELECT COUNT(*) AS count FROM products").get();
    if (productCount && productCount.count === 0) {
        const insertProduct = db.prepare(`
            INSERT INTO products (name, price, collection, description, image)
            VALUES (?, ?, ?, ?, ?)
        `);
        insertProduct.run("THE LAST SEAT", 950, "IMAGINATION", "Some things leave before we notice.", "images/sudden-abduction.png");
        insertProduct.run("THE LAST TRACE", 950, "IMPACT", "What happens may disappear. The impact remains.", "images/sudden-abduction-impact.png");
    }
} catch (err) {
    console.log("SQLite initialization skipped/failed on Vercel:", err.message);
}

// Middlewares
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Serve Frontend Files from Root Directory
app.use(express.static(path.join(__dirname, "..")));

// Default Route -> test.html
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "test.html"));
});

// API Routes
app.get("/products", (req, res) => {
    if (!db) return res.json([]);
    try {
        const products = db.prepare("SELECT * FROM products ORDER BY id ASC").all();
        res.json(products);
    } catch (e) {
        res.json([]);
    }
});

// Export App for Vercel Serverless
module.exports = app;