'use strict';

/**
 * Seed script for demo data.
 * Idempotent: checks before inserting so it can be re-run safely.
 * 
 * Demo data:
 * - 1 Admin, 1 Staff user
 * - 3 Villages
 * - 4 Customers (farmers)
 * - 4 Flowers with initial rates
 * - 3 Sample collections with payments
 */

require('../config/env');

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const env = require('../config/env');
const { calculateItemAmount, calculateCollectionTotal } = require('../../utils/money');

const dayjs = require('dayjs');

async function seed() {
  console.log('[seed] Starting seed data insertion...');

  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    multipleStatements: false,
  });

  try {
    // ── Users ────────────────────────────────────────────────────────────
    const adminHash = await bcrypt.hash('admin123', env.bcryptSaltRounds);
    const staffHash = await bcrypt.hash('staff123', env.bcryptSaltRounds);

    const [existingUsers] = await conn.execute('SELECT COUNT(*) AS cnt FROM users');
    if (existingUsers[0].cnt === 0) {
      await conn.execute(
        `INSERT INTO users (email, name, password_hash, role, permissions) VALUES
         (?, 'Factory Admin', ?, 'admin', '[]'),
         (?, 'Staff Member', ?, 'staff', '["can_edit_rates"]')`,
        ['admin@perfumefactory.com', adminHash, 'staff@perfumefactory.com', staffHash]
      );
      console.log('[seed] ✅ Users created');
    } else {
      console.log('[seed] ⏭  Users already exist');
    }

    // ── Villages ─────────────────────────────────────────────────────────
    const [existingVillages] = await conn.execute('SELECT COUNT(*) AS cnt FROM villages');
    let villageIds = [];
    if (existingVillages[0].cnt === 0) {
      const villages = [
        ['Thoppur', 'Dindigul', 'Tamil Nadu', '624208'],
        ['Nilakottai', 'Dindigul', 'Tamil Nadu', '624208'],
        ['Keelakuilkudi', 'Madurai', 'Tamil Nadu', '625703'],
      ];
      for (const [name, district, state, pincode] of villages) {
        const [r] = await conn.execute(
          'INSERT INTO villages (name, district, state, pincode) VALUES (?, ?, ?, ?)',
          [name, district, state, pincode]
        );
        villageIds.push(r.insertId);
      }
      console.log('[seed] ✅ Villages created');
    } else {
      const [rows] = await conn.execute('SELECT id FROM villages ORDER BY id LIMIT 3');
      villageIds = rows.map((r) => r.id);
      console.log('[seed] ⏭  Villages already exist');
    }

    // ── Customers ────────────────────────────────────────────────────────
    const [existingCustomers] = await conn.execute('SELECT COUNT(*) AS cnt FROM customers');
    let customerIds = [];
    if (existingCustomers[0].cnt === 0) {
      const customers = [
        ['Murugesan Rajan', '9876543210', villageIds[0], 'SBI', '12345678901', 'SBIN0001234'],
        ['Lakshmi Devi', '9876543211', villageIds[0], 'IOB', '98765432101', 'IOBA0001234'],
        ['Selvam Kumar', '9876543212', villageIds[1], 'Canara Bank', '45678901234', 'CNRB0001234'],
        ['Geetha Bai', '9876543213', villageIds[2], 'SBI', '11223344556', 'SBIN0005678'],
      ];
      for (const [name, mobile, village_id, bank_name, account_number, ifsc_code] of customers) {
        const [r] = await conn.execute(
          'INSERT INTO customers (name, mobile, village_id, bank_name, account_number, ifsc_code) VALUES (?, ?, ?, ?, ?, ?)',
          [name, mobile, village_id, bank_name, account_number, ifsc_code]
        );
        customerIds.push(r.insertId);
      }
      console.log('[seed] ✅ Customers created');
    } else {
      const [rows] = await conn.execute('SELECT id FROM customers ORDER BY id LIMIT 4');
      customerIds = rows.map((r) => r.id);
      console.log('[seed] ⏭  Customers already exist');
    }

    // ── Flowers ──────────────────────────────────────────────────────────
    const [existingFlowers] = await conn.execute('SELECT COUNT(*) AS cnt FROM flowers');
    let flowerIds = [];
    if (existingFlowers[0].cnt === 0) {
      const flowers = [
        ['Jasmine (Madurai Malli)', 'Jasminum sambac', 'மல்லி', 'kg'],
        ['Edward Rose', 'Rosa × hybrida', 'ரோஜா', 'kg'],
        ['Tuberose (Sampangi)', 'Agave amica', 'சம்பங்கி', 'kg'],
        ['Marigold (Sevanthi)', 'Tagetes erecta', 'செவந்தி', 'kg'],
      ];
      for (const [name, botanical_name, local_name, unit] of flowers) {
        const [r] = await conn.execute(
          'INSERT INTO flowers (name, botanical_name, local_name, unit) VALUES (?, ?, ?, ?)',
          [name, botanical_name, local_name, unit]
        );
        flowerIds.push(r.insertId);
      }
      console.log('[seed] ✅ Flowers created');
    } else {
      const [rows] = await conn.execute('SELECT id FROM flowers ORDER BY id LIMIT 4');
      flowerIds = rows.map((r) => r.id);
      console.log('[seed] ⏭  Flowers already exist');
    }

    // ── Flower Rates ─────────────────────────────────────────────────────
    // Rates in paise per kg: Jasmine=8000 (₹80), Rose=6000 (₹60), Tuberose=7000 (₹70), Marigold=4000 (₹40)
    const [existingRates] = await conn.execute('SELECT COUNT(*) AS cnt FROM flower_rates');
    let rateIds = [];
    if (existingRates[0].cnt === 0) {
      const rates = [8000, 6000, 7000, 4000]; // paise per kg
      for (let i = 0; i < flowerIds.length; i++) {
        const [r] = await conn.execute(
          'INSERT INTO flower_rates (flower_id, rate_per_kg, is_active) VALUES (?, ?, 1)',
          [flowerIds[i], rates[i]]
        );
        rateIds.push(r.insertId);
      }
      console.log('[seed] ✅ Flower rates created');
    } else {
      const [rows] = await conn.execute(
        'SELECT id FROM flower_rates WHERE is_active = 1 ORDER BY id LIMIT 4'
      );
      rateIds = rows.map((r) => r.id);
      console.log('[seed] ⏭  Flower rates already exist');
    }

    // ── Bill Sequences ────────────────────────────────────────────────────
    const currentYear = dayjs().year();
    const [seqRows] = await conn.execute(
      'SELECT id FROM bill_sequences WHERE year = ?', [currentYear]
    );
    if (seqRows.length === 0) {
      await conn.execute(
        'INSERT INTO bill_sequences (year, current_seq) VALUES (?, 0)', [currentYear]
      );
      console.log('[seed] ✅ Bill sequence initialized for year', currentYear);
    }

    // ── Sample Collections ────────────────────────────────────────────────
    const [existingCollections] = await conn.execute('SELECT COUNT(*) AS cnt FROM collections');
    if (existingCollections[0].cnt === 0 && customerIds.length >= 4 && flowerIds.length >= 4) {
      const [adminRow] = await conn.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
      const adminId = adminRow[0]?.id || null;

      // Fetch actual rate_per_kg values from DB
      const [rateRows] = await conn.execute(
        'SELECT id, flower_id, rate_per_kg FROM flower_rates WHERE is_active = 1 ORDER BY id'
      );
      const rateMap = {};
      rateRows.forEach((r) => { rateMap[r.flower_id] = { rateId: r.id, rate: r.rate_per_kg }; });

      // Collection 1: Customer 1, Jasmine 50kg + Rose 30kg, fully paid
      await createSampleCollection(conn, {
        customerIdx: 0, villageIdx: 0, adminId, customerIds, villageIds, flowerIds,
        rateMap, billSeqYear: currentYear,
        date: dayjs().subtract(7, 'day').format('YYYY-MM-DD'),
        items: [
          { flowerIdx: 0, weightKg: 50.0 },
          { flowerIdx: 1, weightKg: 30.0 },
        ],
        discount: 0,
        otherCharges: 0,
        payments: ['full'],
      });

      // Collection 2: Customer 2, Tuberose 80kg, partially paid
      await createSampleCollection(conn, {
        customerIdx: 1, villageIdx: 0, adminId, customerIds, villageIds, flowerIds,
        rateMap, billSeqYear: currentYear,
        date: dayjs().subtract(3, 'day').format('YYYY-MM-DD'),
        items: [{ flowerIdx: 2, weightKg: 80.0 }],
        discount: 50000, // ₹500 discount
        otherCharges: 0,
        payments: ['half'],
      });

      // Collection 3: Customer 3, Marigold 200kg, unpaid
      await createSampleCollection(conn, {
        customerIdx: 2, villageIdx: 1, adminId, customerIds, villageIds, flowerIds,
        rateMap, billSeqYear: currentYear,
        date: dayjs().format('YYYY-MM-DD'),
        items: [{ flowerIdx: 3, weightKg: 200.0 }],
        discount: 0,
        otherCharges: 10000, // ₹100 transport
        payments: [],
      });

      console.log('[seed] ✅ Sample collections and payments created');
    } else {
      console.log('[seed] ⏭  Collections already exist or prerequisite data missing');
    }

    console.log('\n[seed] 🌸 Seed complete!');
    console.log('  Admin login:  admin@perfumefactory.com / admin123');
    console.log('  Staff login:  staff@perfumefactory.com / staff123');
  } catch (err) {
    console.error('[seed] ❌ Error:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

async function createSampleCollection(conn, {
  customerIdx, villageIdx, adminId, customerIds, villageIds, flowerIds,
  rateMap, billSeqYear, date, items, discount, otherCharges, payments,
}) {
  // Get next bill number (simplified for seed — no row lock needed during seed)
  const [seqRow] = await conn.execute(
    'SELECT current_seq FROM bill_sequences WHERE year = ? FOR UPDATE',
    [billSeqYear]
  );
  // Note: FOR UPDATE in seed context without explicit transaction won't truly lock,
  // but seed runs sequentially so it's fine
  const nextSeq = (seqRow[0]?.current_seq || 0) + 1;
  await conn.execute(
    'UPDATE bill_sequences SET current_seq = ? WHERE year = ?',
    [nextSeq, billSeqYear]
  );
  const billNumber = `PF-${billSeqYear}-${String(nextSeq).padStart(4, '0')}`;

  const itemAmounts = [];
  const itemRows = [];

  for (const { flowerIdx, weightKg } of items) {
    const flowerId = flowerIds[flowerIdx];
    const rateInfo = rateMap[flowerId];
    if (!rateInfo) {
      console.warn(`[seed] No active rate found for flower ${flowerId}`);
      continue;
    }
    const amount = calculateItemAmount(weightKg, rateInfo.rate);
    itemAmounts.push(amount);
    itemRows.push({ flowerId, rateId: rateInfo.rateId, ratePerKg: rateInfo.rate, weightKg, amount });
  }

  const totalAmount = calculateCollectionTotal(itemAmounts, discount, otherCharges);

  // Insert collection
  const [collRes] = await conn.execute(
    `INSERT INTO collections 
      (bill_number, customer_id, village_id, collection_date, total_amount, discount, other_charges, paid_amount, payment_status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'UNPAID', ?)`,
    [
      billNumber, customerIds[customerIdx], villageIds[villageIdx],
      date, totalAmount, discount, otherCharges, adminId
    ]
  );
  const collectionId = collRes.insertId;

  // Insert items
  for (const item of itemRows) {
    await conn.execute(
      `INSERT INTO collection_items (collection_id, flower_id, flower_rate_id, weight_kg, rate_per_kg, amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [collectionId, item.flowerId, item.rateId, item.weightKg, item.ratePerKg, item.amount]
    );
  }

  // Insert payments
  let paidTotal = 0;
  let pmtSeq = 0;
  for (const pmtType of payments) {
    pmtSeq++;
    let pmtAmount = 0;
    if (pmtType === 'full') pmtAmount = totalAmount;
    if (pmtType === 'half') pmtAmount = Math.floor(totalAmount / 2);
    if (typeof pmtType === 'number') pmtAmount = pmtType;

    if (pmtAmount <= 0) continue;

    const pmtNumber = `PMT-${billSeqYear}-${String(pmtSeq).padStart(4, '0')}`;
    await conn.execute(
      `INSERT INTO payments (collection_id, payment_number, amount, payment_mode, paid_at, created_by)
       VALUES (?, ?, ?, 'CASH', NOW(), ?)`,
      [collectionId, pmtNumber, pmtAmount, adminId]
    );
    paidTotal += pmtAmount;
  }

  // Update paid_amount and payment_status
  let paymentStatus = 'UNPAID';
  if (paidTotal >= totalAmount) paymentStatus = 'PAID';
  else if (paidTotal > 0) paymentStatus = 'PARTIALLY_PAID';

  await conn.execute(
    'UPDATE collections SET paid_amount = ?, payment_status = ? WHERE id = ?',
    [paidTotal, paymentStatus, collectionId]
  );

  console.log(`[seed]    → Created collection ${billNumber} (${paymentStatus})`);
}

seed();
