'use strict';

const path = require('path');
const fs = require('fs');
const net = require('net');
const env = require('./env');

let activeClient = null; // 'mysql' | 'sqlite'
let mysqlPool = null;
let sqliteDb = null;
let isInitialized = false;

// ── SQLite Schema Definition ──────────────────────────────────────────────
const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff',
  permissions   TEXT NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL DEFAULT (DATETIME('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (DATETIME('now','localtime')),
  deleted_at    TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS villages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  district      TEXT NOT NULL,
  state         TEXT NOT NULL DEFAULT 'Tamil Nadu',
  pincode       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL DEFAULT (DATETIME('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (DATETIME('now','localtime')),
  deleted_at    TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  mobile           TEXT NOT NULL UNIQUE,
  alternate_mobile TEXT DEFAULT NULL,
  village_id       INTEGER NOT NULL,
  address          TEXT DEFAULT NULL,
  bank_name        TEXT DEFAULT NULL,
  account_number   TEXT DEFAULT NULL,
  ifsc_code        TEXT DEFAULT NULL,
  notes            TEXT DEFAULT NULL,
  status           TEXT NOT NULL DEFAULT 'active',
  created_at       TEXT NOT NULL DEFAULT (DATETIME('now','localtime')),
  updated_at       TEXT NOT NULL DEFAULT (DATETIME('now','localtime')),
  deleted_at       TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS flowers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL UNIQUE,
  botanical_name TEXT DEFAULT NULL,
  local_name     TEXT DEFAULT NULL,
  unit           TEXT NOT NULL DEFAULT 'kg',
  notes          TEXT DEFAULT NULL,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     TEXT NOT NULL DEFAULT (DATETIME('now','localtime')),
  updated_at     TEXT NOT NULL DEFAULT (DATETIME('now','localtime')),
  deleted_at     TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS flower_rates (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  flower_id      INTEGER NOT NULL,
  rate_per_kg    INTEGER NOT NULL,
  is_active      INTEGER NOT NULL DEFAULT 1,
  effective_from TEXT NOT NULL DEFAULT (DATETIME('now','localtime')),
  effective_to   TEXT DEFAULT NULL,
  created_by     INTEGER DEFAULT NULL,
  created_at     TEXT NOT NULL DEFAULT (DATETIME('now','localtime')),
  updated_at     TEXT NOT NULL DEFAULT (DATETIME('now','localtime'))
);

CREATE TABLE IF NOT EXISTS bill_sequences (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  year        INTEGER NOT NULL UNIQUE,
  current_seq INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (DATETIME('now','localtime'))
);

CREATE TABLE IF NOT EXISTS collections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_number     TEXT NOT NULL UNIQUE,
  customer_id     INTEGER NOT NULL,
  village_id      INTEGER NOT NULL,
  collection_date TEXT NOT NULL,
  total_amount    INTEGER NOT NULL,
  discount        INTEGER NOT NULL DEFAULT 0,
  other_charges   INTEGER NOT NULL DEFAULT 0,
  paid_amount     INTEGER NOT NULL DEFAULT 0,
  payment_status  TEXT NOT NULL DEFAULT 'UNPAID',
  status          TEXT NOT NULL DEFAULT 'CONFIRMED',
  remarks         TEXT DEFAULT NULL,
  created_by      INTEGER DEFAULT NULL,
  created_at      TEXT NOT NULL DEFAULT (DATETIME('now','localtime')),
  updated_at      TEXT NOT NULL DEFAULT (DATETIME('now','localtime')),
  deleted_at      TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS collection_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id  INTEGER NOT NULL,
  flower_id      INTEGER NOT NULL,
  flower_rate_id INTEGER NOT NULL,
  weight_kg      REAL NOT NULL,
  rate_per_kg    INTEGER NOT NULL,
  amount         INTEGER NOT NULL,
  notes          TEXT DEFAULT NULL,
  created_at     TEXT NOT NULL DEFAULT (DATETIME('now','localtime'))
);

CREATE TABLE IF NOT EXISTS payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id  INTEGER NOT NULL,
  payment_number TEXT NOT NULL UNIQUE,
  amount         INTEGER NOT NULL,
  payment_mode   TEXT NOT NULL DEFAULT 'CASH',
  reference_number TEXT DEFAULT NULL,
  notes          TEXT DEFAULT NULL,
  paid_at        TEXT NOT NULL DEFAULT (DATETIME('now','localtime')),
  created_by     INTEGER DEFAULT NULL,
  created_at     TEXT NOT NULL DEFAULT (DATETIME('now','localtime')),
  updated_at     TEXT NOT NULL DEFAULT (DATETIME('now','localtime'))
);
`;

/**
 * Check if MySQL TCP port is open.
 */
function checkPortOpen(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isResolved = false;

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      isResolved = true;
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      isResolved = true;
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      isResolved = true;
      resolve(false);
    });
    socket.connect(port, host);
  });
}

/**
 * Clean SQL query for SQLite compatibility (removes MySQL specific locking directives).
 */
function cleanSqlForSqlite(sql) {
  return sql
    .replace(/\s+FOR\s+UPDATE/gi, '')
    .replace(/=\s*"([^"]+)"/g, "='$1'");
}

/**
 * Initialize SQLite database with helper functions matching MySQL dialect.
 */
function getSqliteDb() {
  if (!sqliteDb) {
    const { DatabaseSync } = require('node:sqlite');
    const dayjs = require('dayjs');

    const isVercel = Boolean(process.env.VERCEL);
    const dataDir = process.env.DATA_DIR || (isVercel ? '/tmp/data' : path.join(__dirname, '../../../data'));
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbFilePath = path.join(dataDir, 'perfume_factory.sqlite');
    sqliteDb = new DatabaseSync(dbFilePath);

    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    sqliteDb.exec('PRAGMA journal_mode = WAL;');

    // Register MySQL-compatible SQL functions in SQLite
    sqliteDb.function('NOW', () => dayjs().format('YYYY-MM-DD HH:mm:ss'));
    sqliteDb.function('CURDATE', () => dayjs().format('YYYY-MM-DD'));
    sqliteDb.function('YEAR', (d) => (d ? dayjs(d).year() : null));
    sqliteDb.function('MONTH', (d) => (d ? dayjs(d).month() + 1 : null));
    sqliteDb.function('DAY', (d) => (d ? dayjs(d).date() : null));
    sqliteDb.function('CONCAT', (...args) => args.join(''));
    sqliteDb.function('DATE_FORMAT', (d, fmt) => {
      if (!d) return null;
      const dt = dayjs(d);
      if (!fmt) return dt.format('YYYY-MM-DD');
      return fmt
        .replace('%Y', dt.format('YYYY'))
        .replace('%y', dt.format('YY'))
        .replace('%m', dt.format('MM'))
        .replace('%c', dt.format('M'))
        .replace('%d', dt.format('DD'))
        .replace('%e', dt.format('D'))
        .replace('%H', dt.format('HH'))
        .replace('%h', dt.format('hh'))
        .replace('%i', dt.format('mm'))
        .replace('%s', dt.format('ss'))
        .replace('%b', dt.format('MMM'))
        .replace('%M', dt.format('MMMM'));
    });
  }
  return sqliteDb;
}

/**
 * Execute query on SQLite with mysql2-compatible return format.
 */
function executeSqlite(sql, values = []) {
  const db = getSqliteDb();
  const cleanedSql = cleanSqlForSqlite(sql);
  const trimmed = cleanedSql.trim();
  const isSelect = /^(SELECT|PRAGMA|EXPLAIN)/i.test(trimmed);

  const stmt = db.prepare(cleanedSql);
  if (isSelect) {
    const rows = stmt.all(...values);
    return [rows, []];
  } else {
    const info = stmt.run(...values);
    const result = {
      insertId: Number(info.lastInsertRowid),
      affectedRows: Number(info.changes),
      changedRows: Number(info.changes),
    };
    return [result, []];
  }
}

/**
 * Seed initial SQLite database if empty.
 */
async function seedSqliteIfEmpty() {
  const db = getSqliteDb();
  db.exec(SQLITE_SCHEMA);

  const userCheck = db.prepare('SELECT COUNT(*) AS cnt FROM users').all();
  if (userCheck[0].cnt === 0) {
    const bcrypt = require('bcrypt');
    const dayjs = require('dayjs');

    const adminHash = await bcrypt.hash('admin123', 10);
    const staffHash = await bcrypt.hash('staff123', 10);

    // Users
    db.prepare(`
      INSERT INTO users (email, name, password_hash, role, permissions) VALUES
      ('admin@perfumefactory.com', 'Factory Admin', ?, 'admin', '[]'),
      ('staff@perfumefactory.com', 'Staff Member', ?, 'staff', '["can_edit_rates"]')
    `).run(adminHash, staffHash);

    // Villages
    db.prepare(`
      INSERT INTO villages (name, district, state, pincode) VALUES
      ('Thoppur', 'Dindigul', 'Tamil Nadu', '624208'),
      ('Nilakottai', 'Dindigul', 'Tamil Nadu', '624208'),
      ('Keelakuilkudi', 'Madurai', 'Tamil Nadu', '625703')
    `).run();

    // Customers
    db.prepare(`
      INSERT INTO customers (name, mobile, village_id, bank_name, account_number, ifsc_code) VALUES
      ('Murugesan Rajan', '9876543210', 1, 'SBI', '12345678901', 'SBIN0001234'),
      ('Lakshmi Devi', '9876543211', 1, 'IOB', '98765432101', 'IOBA0001234'),
      ('Selvam Kumar', '9876543212', 2, 'Canara Bank', '45678901234', 'CNRB0001234'),
      ('Geetha Bai', '9876543213', 3, 'SBI', '11223344556', 'SBIN0005678')
    `).run();

    // Flowers
    db.prepare(`
      INSERT INTO flowers (name, botanical_name, local_name, unit) VALUES
      ('Jasmine (Madurai Malli)', 'Jasminum sambac', 'மல்லி', 'kg'),
      ('Edward Rose', 'Rosa × hybrida', 'ரோஜா', 'kg'),
      ('Tuberose (Sampangi)', 'Agave amica', 'சம்பங்கி', 'kg'),
      ('Marigold (Sevanthi)', 'Tagetes erecta', 'செவந்தி', 'kg')
    `).run();

    // Flower Rates (paise per kg: 8000=₹80, 6000=₹60, 7000=₹70, 4000=₹40)
    db.prepare(`
      INSERT INTO flower_rates (flower_id, rate_per_kg, is_active) VALUES
      (1, 8000, 1),
      (2, 6000, 1),
      (3, 7000, 1),
      (4, 4000, 1)
    `).run();

    // Bill Sequences
    const currentYear = dayjs().year();
    db.prepare('INSERT INTO bill_sequences (year, current_seq) VALUES (?, 3)').run(currentYear);

    // Sample Collections & Payments
    const colDate1 = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
    const colDate2 = dayjs().subtract(3, 'day').format('YYYY-MM-DD');
    const colDate3 = dayjs().format('YYYY-MM-DD');

    // Coll 1: 50kg Jasmine (₹4,000) + 30kg Rose (₹1,800) = ₹5,800 (580000 paise), fully paid
    db.prepare(`
      INSERT INTO collections (bill_number, customer_id, village_id, collection_date, total_amount, discount, other_charges, paid_amount, payment_status, created_by)
      VALUES (?, 1, 1, ?, 580000, 0, 0, 580000, 'PAID', 1)
    `).run(`PF-${currentYear}-0001`, colDate1);
    db.prepare(`INSERT INTO collection_items (collection_id, flower_id, flower_rate_id, weight_kg, rate_per_kg, amount) VALUES (1, 1, 1, 50.0, 8000, 400000)`).run();
    db.prepare(`INSERT INTO collection_items (collection_id, flower_id, flower_rate_id, weight_kg, rate_per_kg, amount) VALUES (1, 2, 2, 30.0, 6000, 180000)`).run();
    db.prepare(`INSERT INTO payments (collection_id, payment_number, amount, payment_mode, paid_at, created_by) VALUES (1, ?, 580000, 'CASH', ?, 1)`).run(`PMT-${currentYear}-0001`, colDate1);

    // Coll 2: 80kg Tuberose (₹5,600) - discount ₹500 = ₹5,100 (510000 paise), ₹2,550 paid
    db.prepare(`
      INSERT INTO collections (bill_number, customer_id, village_id, collection_date, total_amount, discount, other_charges, paid_amount, payment_status, created_by)
      VALUES (?, 2, 1, ?, 510000, 50000, 0, 255000, 'PARTIALLY_PAID', 1)
    `).run(`PF-${currentYear}-0002`, colDate2);
    db.prepare(`INSERT INTO collection_items (collection_id, flower_id, flower_rate_id, weight_kg, rate_per_kg, amount) VALUES (2, 3, 3, 80.0, 7000, 560000)`).run();
    db.prepare(`INSERT INTO payments (collection_id, payment_number, amount, payment_mode, paid_at, created_by) VALUES (2, ?, 255000, 'UPI', ?, 1)`).run(`PMT-${currentYear}-0002`, colDate2);

    // Coll 3: 200kg Marigold (₹8,000) + ₹100 transport = ₹8,100 (810000 paise), UNPAID
    db.prepare(`
      INSERT INTO collections (bill_number, customer_id, village_id, collection_date, total_amount, discount, other_charges, paid_amount, payment_status, created_by)
      VALUES (?, 3, 2, ?, 810000, 0, 10000, 0, 'UNPAID', 1)
    `).run(`PF-${currentYear}-0003`, colDate3);
    db.prepare(`INSERT INTO collection_items (collection_id, flower_id, flower_rate_id, weight_kg, rate_per_kg, amount) VALUES (3, 4, 4, 200.0, 4000, 800000)`).run();

    console.log('[db] ✅ SQLite database initialized with sample demo data');
  }
}

/**
 * Initialize MySQL pool.
 */
function getMysqlPool() {
  if (!mysqlPool) {
    const mysql = require('mysql2/promise');
    mysqlPool = mysql.createPool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      waitForConnections: true,
      connectionLimit: 20,
      queueLimit: 0,
      timezone: '+00:00',
      charset: 'utf8mb4',
      multipleStatements: false,
    });

    mysqlPool.on('error', (err) => {
      console.error('[db] MySQL pool error:', err.code);
    });
  }
  return mysqlPool;
}

/**
 * Automatically determine database backend (MySQL or SQLite).
 */
async function initDb() {
  if (isInitialized) return activeClient;

  if (env.dbClient === 'mysql') {
    activeClient = 'mysql';
    getMysqlPool();
    isInitialized = true;
    return 'mysql';
  }

  if (env.dbClient === 'sqlite') {
    activeClient = 'sqlite';
    await seedSqliteIfEmpty();
    isInitialized = true;
    return 'sqlite';
  }

  // Auto-detection mode: check if MySQL is running
  const mysqlAvailable = await checkPortOpen(env.db.host, env.db.port, 600);
  if (mysqlAvailable) {
    try {
      getMysqlPool();
      const [rows] = await mysqlPool.execute('SELECT 1 AS ping');
      if (rows && rows[0]?.ping === 1) {
        activeClient = 'mysql';
        console.log(`[db] Connected to local MySQL at ${env.db.host}:${env.db.port}/${env.db.database}`);
        isInitialized = true;
        return 'mysql';
      }
    } catch {
      // Fall through to SQLite
    }
  }

  // Default fallback: SQLite
  activeClient = 'sqlite';
  await seedSqliteIfEmpty();
  console.log('[db] Running on local SQLite database (zero external dependencies required)');
  isInitialized = true;
  return 'sqlite';
}

/**
 * Execute query.
 */
async function query(sql, values = []) {
  if (!isInitialized) await initDb();

  if (activeClient === 'sqlite') {
    return executeSqlite(sql, values);
  } else {
    const db = getMysqlPool();
    return db.execute(sql, values);
  }
}

/**
 * Get a connection for transaction or manual management.
 */
async function getConnection() {
  if (!isInitialized) await initDb();

  if (activeClient === 'sqlite') {
    const db = getSqliteDb();
    return {
      execute: async (sql, values = []) => executeSqlite(sql, values),
      query: async (sql, values = []) => executeSqlite(sql, values),
      beginTransaction: async () => { db.exec('BEGIN IMMEDIATE'); },
      commit: async () => { db.exec('COMMIT'); },
      rollback: async () => { db.exec('ROLLBACK'); },
      release: () => {},
    };
  } else {
    return getMysqlPool().getConnection();
  }
}

/**
 * Run a callback inside a transaction.
 */
async function transaction(fn) {
  if (!isInitialized) await initDb();

  if (activeClient === 'sqlite') {
    const db = getSqliteDb();
    db.exec('BEGIN IMMEDIATE');
    const conn = {
      execute: async (sql, values = []) => executeSqlite(sql, values),
      query: async (sql, values = []) => executeSqlite(sql, values),
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    };
    try {
      const result = await fn(conn);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } else {
    const conn = await getMysqlPool().getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}

/**
 * Test connection and return status.
 */
async function testConnection() {
  await initDb();
  if (activeClient === 'sqlite') {
    const [rows] = executeSqlite('SELECT 1 AS ping');
    return rows[0].ping === 1;
  } else {
    const [rows] = await query('SELECT 1 AS ping');
    return rows[0].ping === 1;
  }
}

function getPool() {
  if (activeClient === 'sqlite') {
    return {
      execute: query,
      query,
      getConnection,
    };
  }
  return getMysqlPool();
}

module.exports = {
  query,
  getConnection,
  transaction,
  testConnection,
  getPool,
  initDb,
};
