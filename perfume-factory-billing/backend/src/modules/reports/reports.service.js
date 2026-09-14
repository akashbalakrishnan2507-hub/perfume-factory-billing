'use strict';

const { query } = require('../../config/db');
const { paiseToRupees } = require('../../utils/money');
const dayjs = require('dayjs');

function fmt(paise) { return paiseToRupees(paise || 0); }

// ── 1. Daily Report ─────────────────────────────────────────────────────────
async function getDailyReport(date) {
  const d = date || dayjs().format('YYYY-MM-DD');

  const [collections] = await query(
    `SELECT col.*, c.name AS customer_name, c.mobile AS customer_mobile, v.name AS village_name
     FROM collections col
     LEFT JOIN customers c ON c.id = col.customer_id
     LEFT JOIN villages v ON v.id = col.village_id
     WHERE col.collection_date = ? AND col.deleted_at IS NULL
     ORDER BY col.created_at ASC`,
    [d]
  );

  const collectionIds = collections.map((c) => c.id);
  const itemsByColl = {};
  if (collectionIds.length > 0) {
    const placeholders = collectionIds.map(() => '?').join(',');
    const [items] = await query(
      `SELECT ci.*, f.name AS flower_name
       FROM collection_items ci
       LEFT JOIN flowers f ON f.id = ci.flower_id
       WHERE ci.collection_id IN (${placeholders})`,
      collectionIds
    );
    for (const item of items) {
      if (!itemsByColl[item.collection_id]) itemsByColl[item.collection_id] = [];
      itemsByColl[item.collection_id].push(item);
    }
  }

  const [[summary]] = await query(
    `SELECT 
       COUNT(*) AS total_bills,
       COALESCE(SUM(total_amount), 0) AS total_amount,
       COALESCE(SUM(paid_amount), 0) AS total_paid,
       COALESCE(SUM(total_amount - paid_amount), 0) AS total_pending,
       SUM(CASE WHEN payment_status = 'PAID' THEN 1 ELSE 0 END) AS paid_count,
       SUM(CASE WHEN payment_status = 'PARTIALLY_PAID' THEN 1 ELSE 0 END) AS partial_count,
       SUM(CASE WHEN payment_status = 'UNPAID' THEN 1 ELSE 0 END) AS unpaid_count
     FROM collections WHERE collection_date = ? AND deleted_at IS NULL`,
    [d]
  );

  const [[weightSum]] = await query(
    `SELECT COALESCE(SUM(ci.weight_kg), 0) AS total_weight_kg
     FROM collection_items ci
     JOIN collections col ON col.id = ci.collection_id
     WHERE col.collection_date = ? AND col.deleted_at IS NULL`,
    [d]
  );

  return {
    date: d,
    summary: {
      total_bills: summary.total_bills,
      total_weight_kg: parseFloat(Number(weightSum.total_weight_kg || 0).toFixed(2)),
      total_amount_rupees: fmt(summary.total_amount),
      total_paid_rupees: fmt(summary.total_paid),
      total_pending_rupees: fmt(summary.total_pending),
      paid_count: summary.paid_count || 0,
      partial_count: summary.partial_count || 0,
      unpaid_count: summary.unpaid_count || 0,
    },
    collections: collections.map((c) => {
      const items = itemsByColl[c.id] || [];
      const weight = items.reduce((acc, i) => acc + parseFloat(i.weight_kg || 0), 0);
      const flowers = items.map((i) => i.flower_name).join(', ') || 'General';
      return {
        ...c,
        total_weight_kg: parseFloat(weight.toFixed(3)),
        flowers_summary: flowers,
        total_amount_rupees: fmt(c.total_amount),
        paid_amount_rupees: fmt(c.paid_amount),
        pending_amount_rupees: fmt(c.total_amount - c.paid_amount),
      };
    }),
  };
}

// ── 2. Weekly Report ────────────────────────────────────────────────────────
async function getWeeklyReport(from, to) {
  const f = from || dayjs().subtract(6, 'day').format('YYYY-MM-DD');
  const t = to || dayjs().format('YYYY-MM-DD');

  const [daily] = await query(
    `SELECT 
       col.collection_date AS date,
       COUNT(DISTINCT col.id) AS bill_count,
       COALESCE(SUM(ci.weight_kg), 0) AS total_weight_kg,
       COALESCE(SUM(col_unique.total_amount), 0) AS total_amount,
       COALESCE(SUM(col_unique.paid_amount), 0) AS total_paid
     FROM collections col
     LEFT JOIN (
       SELECT id, total_amount, paid_amount FROM collections WHERE deleted_at IS NULL
     ) col_unique ON col_unique.id = col.id
     LEFT JOIN collection_items ci ON ci.collection_id = col.id
     WHERE col.collection_date BETWEEN ? AND ? AND col.deleted_at IS NULL
     GROUP BY col.collection_date 
     ORDER BY col.collection_date ASC`,
    [f, t]
  );

  const [[summary]] = await query(
    `SELECT 
       COUNT(*) AS total_bills,
       COALESCE(SUM(total_amount), 0) AS total_amount,
       COALESCE(SUM(paid_amount), 0) AS total_paid,
       COALESCE(SUM(total_amount - paid_amount), 0) AS total_pending
     FROM collections WHERE collection_date BETWEEN ? AND ? AND deleted_at IS NULL`,
    [f, t]
  );

  const [[weightSum]] = await query(
    `SELECT COALESCE(SUM(ci.weight_kg), 0) AS total_weight_kg
     FROM collection_items ci
     JOIN collections col ON col.id = ci.collection_id
     WHERE col.collection_date BETWEEN ? AND ? AND col.deleted_at IS NULL`,
    [f, t]
  );

  return {
    from: f,
    to: t,
    summary: {
      total_bills: summary.total_bills,
      total_weight_kg: parseFloat(Number(weightSum.total_weight_kg || 0).toFixed(2)),
      total_amount_rupees: fmt(summary.total_amount),
      total_paid_rupees: fmt(summary.total_paid),
      total_pending_rupees: fmt(summary.total_pending),
    },
    daily: daily.map((r) => ({
      date: r.date,
      bill_count: r.bill_count,
      total_weight_kg: parseFloat(Number(r.total_weight_kg || 0).toFixed(2)),
      total_amount_rupees: fmt(r.total_amount),
      paid_amount_rupees: fmt(r.total_paid),
      pending_amount_rupees: fmt(r.total_amount - r.total_paid),
    })),
  };
}

// ── 3. Monthly Report ───────────────────────────────────────────────────────
async function getMonthlyReport(month, year) {
  const m = parseInt(month, 10) || dayjs().month() + 1;
  const y = parseInt(year, 10) || dayjs().year();
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const to = dayjs(from).endOf('month').format('YYYY-MM-DD');

  const [daily] = await query(
    `SELECT 
       col.collection_date AS date,
       COUNT(DISTINCT col.id) AS bill_count,
       COALESCE(SUM(ci.weight_kg), 0) AS total_weight_kg,
       COALESCE(SUM(col_u.total_amount), 0) AS total_amount,
       COALESCE(SUM(col_u.paid_amount), 0) AS total_paid
     FROM collections col
     LEFT JOIN (
       SELECT id, total_amount, paid_amount FROM collections WHERE deleted_at IS NULL
     ) col_u ON col_u.id = col.id
     LEFT JOIN collection_items ci ON ci.collection_id = col.id
     WHERE col.collection_date BETWEEN ? AND ? AND col.deleted_at IS NULL
     GROUP BY col.collection_date ORDER BY col.collection_date ASC`,
    [from, to]
  );

  const [[summary]] = await query(
    `SELECT 
       COUNT(*) AS total_bills,
       COALESCE(SUM(total_amount), 0) AS total_amount,
       COALESCE(SUM(paid_amount), 0) AS total_paid,
       COALESCE(SUM(total_amount - paid_amount), 0) AS total_pending
     FROM collections WHERE collection_date BETWEEN ? AND ? AND deleted_at IS NULL`,
    [from, to]
  );

  const [[weightSum]] = await query(
    `SELECT COALESCE(SUM(ci.weight_kg), 0) AS total_weight_kg
     FROM collection_items ci
     JOIN collections col ON col.id = ci.collection_id
     WHERE col.collection_date BETWEEN ? AND ? AND col.deleted_at IS NULL`,
    [from, to]
  );

  return {
    month: m, year: y, from, to,
    summary: {
      total_bills: summary.total_bills,
      total_weight_kg: parseFloat(Number(weightSum.total_weight_kg || 0).toFixed(2)),
      total_amount_rupees: fmt(summary.total_amount),
      total_paid_rupees: fmt(summary.total_paid),
      total_pending_rupees: fmt(summary.total_pending),
    },
    daily: daily.map((r) => ({
      date: r.date,
      bill_count: r.bill_count,
      total_weight_kg: parseFloat(Number(r.total_weight_kg || 0).toFixed(2)),
      total_amount_rupees: fmt(r.total_amount),
      paid_amount_rupees: fmt(r.total_paid),
      pending_amount_rupees: fmt(r.total_amount - r.total_paid),
    })),
  };
}

// ── 4. Farmer-wise Report ───────────────────────────────────────────────────
async function getFarmerReport({ customer_id, from, to }) {
  const f = from || dayjs().subtract(30, 'day').format('YYYY-MM-DD');
  const t = to || dayjs().format('YYYY-MM-DD');

  let where = 'col.collection_date BETWEEN ? AND ? AND col.deleted_at IS NULL';
  const params = [f, t];
  if (customer_id) {
    where += ' AND col.customer_id = ?';
    params.push(customer_id);
  }

  const [rows] = await query(
    `SELECT c.id AS customer_id, c.name AS customer_name, c.mobile AS customer_mobile,
            v.name AS village_name,
            COUNT(DISTINCT col.id) AS bill_count,
            COALESCE(SUM(ci.weight_kg), 0) AS total_weight_kg,
            COALESCE(SUM(col_u.total_amount), 0) AS total_amount,
            COALESCE(SUM(col_u.paid_amount), 0) AS total_paid
     FROM customers c
     LEFT JOIN villages v ON v.id = c.village_id
     JOIN collections col ON col.customer_id = c.id AND ${where}
     LEFT JOIN (
       SELECT id, total_amount, paid_amount FROM collections WHERE deleted_at IS NULL
     ) col_u ON col_u.id = col.id
     LEFT JOIN collection_items ci ON ci.collection_id = col.id
     WHERE c.deleted_at IS NULL
     GROUP BY c.id ORDER BY total_amount DESC`,
    params
  );

  const totalWeight = rows.reduce((acc, r) => acc + parseFloat(r.total_weight_kg || 0), 0);
  const totalAmount = rows.reduce((acc, r) => acc + Number(r.total_amount || 0), 0);
  const totalPaid = rows.reduce((acc, r) => acc + Number(r.total_paid || 0), 0);
  const totalBills = rows.reduce((acc, r) => acc + Number(r.bill_count || 0), 0);

  return {
    from: f, to: t,
    summary: {
      total_farmers: rows.length,
      total_bills: totalBills,
      total_weight_kg: parseFloat(totalWeight.toFixed(2)),
      total_amount_rupees: fmt(totalAmount),
      total_paid_rupees: fmt(totalPaid),
      total_pending_rupees: fmt(totalAmount - totalPaid),
    },
    data: rows.map((r) => ({
      customer_id: r.customer_id,
      customer_name: r.customer_name,
      customer_mobile: r.customer_mobile,
      village_name: r.village_name || '-',
      bill_count: r.bill_count,
      total_weight_kg: parseFloat(Number(r.total_weight_kg || 0).toFixed(2)),
      total_amount_rupees: fmt(r.total_amount),
      paid_amount_rupees: fmt(r.total_paid),
      pending_amount_rupees: fmt(r.total_amount - r.total_paid),
    })),
  };
}

// ── 5. Village-wise Report ──────────────────────────────────────────────────
async function getVillageReport({ village_id, from, to }) {
  const f = from || dayjs().subtract(30, 'day').format('YYYY-MM-DD');
  const t = to || dayjs().format('YYYY-MM-DD');
  let where = 'col.collection_date BETWEEN ? AND ? AND col.deleted_at IS NULL';
  const params = [f, t];
  if (village_id) { where += ' AND col.village_id = ?'; params.push(village_id); }

  const [rows] = await query(
    `SELECT v.id AS village_id, v.name AS village_name, v.district,
            COUNT(DISTINCT col.id) AS bill_count,
            COALESCE(SUM(ci.weight_kg), 0) AS total_weight_kg,
            COALESCE(SUM(col_u.total_amount), 0) AS total_amount,
            COALESCE(SUM(col_u.paid_amount), 0) AS total_paid
     FROM villages v
     JOIN collections col ON col.village_id = v.id AND ${where}
     LEFT JOIN (
       SELECT id, total_amount, paid_amount FROM collections WHERE deleted_at IS NULL
     ) col_u ON col_u.id = col.id
     LEFT JOIN collection_items ci ON ci.collection_id = col.id
     WHERE v.deleted_at IS NULL
     GROUP BY v.id ORDER BY total_amount DESC`,
    params
  );

  const totalWeight = rows.reduce((acc, r) => acc + parseFloat(r.total_weight_kg || 0), 0);
  const totalAmount = rows.reduce((acc, r) => acc + Number(r.total_amount || 0), 0);
  const totalPaid = rows.reduce((acc, r) => acc + Number(r.total_paid || 0), 0);
  const totalBills = rows.reduce((acc, r) => acc + Number(r.bill_count || 0), 0);

  return {
    from: f, to: t,
    summary: {
      total_villages: rows.length,
      total_bills: totalBills,
      total_weight_kg: parseFloat(totalWeight.toFixed(2)),
      total_amount_rupees: fmt(totalAmount),
      total_paid_rupees: fmt(totalPaid),
      total_pending_rupees: fmt(totalAmount - totalPaid),
    },
    data: rows.map((r) => ({
      village_id: r.village_id,
      village_name: r.village_name,
      district: r.district,
      bill_count: r.bill_count,
      total_weight_kg: parseFloat(Number(r.total_weight_kg || 0).toFixed(2)),
      total_amount_rupees: fmt(r.total_amount),
      paid_amount_rupees: fmt(r.total_paid),
      pending_amount_rupees: fmt(r.total_amount - r.total_paid),
    })),
  };
}

// ── 6. Flower-wise Report ───────────────────────────────────────────────────
async function getFlowerReport({ flower_id, from, to }) {
  const f = from || dayjs().subtract(30, 'day').format('YYYY-MM-DD');
  const t = to || dayjs().format('YYYY-MM-DD');
  let where = 'col.collection_date BETWEEN ? AND ? AND col.deleted_at IS NULL';
  const params = [f, t];
  if (flower_id) { where += ' AND ci.flower_id = ?'; params.push(flower_id); }

  const [rows] = await query(
    `SELECT fl.id AS flower_id, fl.name AS flower_name, fl.local_name, fl.unit,
            COUNT(DISTINCT col.id) AS bill_count,
            COALESCE(SUM(ci.weight_kg), 0) AS total_weight_kg,
            COALESCE(SUM(ci.amount), 0) AS total_amount,
            COALESCE(SUM(ci.amount * (col.paid_amount / NULLIF(col.total_amount, 0))), 0) AS estimated_paid
     FROM flowers fl
     JOIN collection_items ci ON ci.flower_id = fl.id
     JOIN collections col ON col.id = ci.collection_id AND ${where}
     WHERE fl.deleted_at IS NULL
     GROUP BY fl.id ORDER BY total_amount DESC`,
    params
  );

  const totalWeight = rows.reduce((acc, r) => acc + parseFloat(r.total_weight_kg || 0), 0);
  const totalAmount = rows.reduce((acc, r) => acc + Number(r.total_amount || 0), 0);
  const totalPaid = rows.reduce((acc, r) => acc + Number(r.estimated_paid || 0), 0);
  const totalBills = rows.reduce((acc, r) => acc + Number(r.bill_count || 0), 0);

  return {
    from: f, to: t,
    summary: {
      total_flowers: rows.length,
      total_bills: totalBills,
      total_weight_kg: parseFloat(totalWeight.toFixed(2)),
      total_amount_rupees: fmt(totalAmount),
      total_paid_rupees: fmt(totalPaid),
      total_pending_rupees: fmt(totalAmount - totalPaid),
    },
    data: rows.map((r) => {
      const w = parseFloat(r.total_weight_kg || 0);
      const amt = Number(r.total_amount || 0);
      const avgRatePaise = w > 0 ? Math.round(amt / w) : 0;
      const paidPaise = Math.round(Number(r.estimated_paid || 0));
      return {
        flower_id: r.flower_id,
        flower_name: r.flower_name,
        local_name: r.local_name || '',
        unit: r.unit || 'kg',
        bill_count: r.bill_count,
        total_weight_kg: parseFloat(w.toFixed(2)),
        avg_rate_rupees: fmt(avgRatePaise),
        total_amount_rupees: fmt(amt),
        paid_amount_rupees: fmt(paidPaise),
        pending_amount_rupees: fmt(amt - paidPaise),
      };
    }),
  };
}

// ── Payments Report ─────────────────────────────────────────────────────────
async function getPaymentsReport({ status, from, to }) {
  const f = from || dayjs().subtract(30, 'day').format('YYYY-MM-DD');
  const t = to || dayjs().format('YYYY-MM-DD');
  let where = 'col.collection_date BETWEEN ? AND ? AND col.deleted_at IS NULL';
  const params = [f, t];
  if (status) { where += ' AND col.payment_status = ?'; params.push(status); }

  const [rows] = await query(
    `SELECT col.id, col.bill_number, col.collection_date, col.payment_status,
            col.total_amount, col.paid_amount,
            (col.total_amount - col.paid_amount) AS pending_amount,
            c.name AS customer_name, v.name AS village_name
     FROM collections col
     LEFT JOIN customers c ON c.id = col.customer_id
     LEFT JOIN villages v ON v.id = col.village_id
     WHERE ${where}
     ORDER BY col.collection_date DESC`,
    params
  );

  const [[summary]] = await query(
    `SELECT 
       COALESCE(SUM(total_amount), 0) AS total_amount,
       COALESCE(SUM(paid_amount), 0) AS paid_amount,
       COALESCE(SUM(total_amount - paid_amount), 0) AS pending_amount
     FROM collections col WHERE ${where}`,
    params
  );

  return {
    from: f, to: t, status: status || 'ALL',
    summary: {
      total_amount_rupees: fmt(summary.total_amount),
      paid_amount_rupees: fmt(summary.paid_amount),
      pending_amount_rupees: fmt(summary.pending_amount),
    },
    data: rows.map((r) => ({
      ...r,
      total_amount_rupees: fmt(r.total_amount),
      paid_amount_rupees: fmt(r.paid_amount),
      pending_amount_rupees: fmt(r.pending_amount),
    })),
  };
}

module.exports = {
  getDailyReport,
  getWeeklyReport,
  getMonthlyReport,
  getFarmerReport,
  getVillageReport,
  getFlowerReport,
  getPaymentsReport,
};
