'use strict';

const { query } = require('../../config/db');
const { paiseToRupees } = require('../../utils/money');
const dayjs = require('dayjs');

// ── Helpers ───────────────────────────────────────────────────────────────

function fmt(paise) { return paiseToRupees(paise || 0); }

// ── Daily Report ──────────────────────────────────────────────────────────

async function getDailyReport(date) {
  const d = date || dayjs().format('YYYY-MM-DD');

  const [collections] = await query(
    `SELECT col.*, c.name AS customer_name, v.name AS village_name
     FROM collections col
     LEFT JOIN customers c ON c.id = col.customer_id
     LEFT JOIN villages v ON v.id = col.village_id
     WHERE col.collection_date = ? AND col.deleted_at IS NULL
     ORDER BY col.created_at ASC`,
    [d]
  );

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

  return {
    date: d,
    summary: {
      total_bills: summary.total_bills,
      total_amount_rupees: fmt(summary.total_amount),
      total_paid_rupees: fmt(summary.total_paid),
      total_pending_rupees: fmt(summary.total_pending),
      paid_count: summary.paid_count,
      partial_count: summary.partial_count,
      unpaid_count: summary.unpaid_count,
    },
    collections: collections.map((c) => ({
      ...c,
      total_amount_rupees: fmt(c.total_amount),
      paid_amount_rupees: fmt(c.paid_amount),
      pending_amount_rupees: fmt(c.total_amount - c.paid_amount),
    })),
  };
}

// ── Monthly Report ─────────────────────────────────────────────────────────

async function getMonthlyReport(month, year) {
  const m = parseInt(month, 10) || dayjs().month() + 1;
  const y = parseInt(year, 10) || dayjs().year();
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const to = dayjs(from).endOf('month').format('YYYY-MM-DD');

  const [daily] = await query(
    `SELECT 
       collection_date AS date,
       COUNT(*) AS bill_count,
       COALESCE(SUM(total_amount), 0) AS total_amount,
       COALESCE(SUM(paid_amount), 0) AS paid_amount
     FROM collections
     WHERE collection_date BETWEEN ? AND ? AND deleted_at IS NULL
     GROUP BY collection_date ORDER BY collection_date ASC`,
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

  return {
    month: m, year: y, from, to,
    summary: {
      total_bills: summary.total_bills,
      total_amount_rupees: fmt(summary.total_amount),
      total_paid_rupees: fmt(summary.total_paid),
      total_pending_rupees: fmt(summary.total_pending),
    },
    daily: daily.map((r) => ({
      date: r.date,
      bill_count: r.bill_count,
      total_amount_rupees: fmt(r.total_amount),
      paid_amount_rupees: fmt(r.paid_amount),
    })),
  };
}

// ── Village-wise Report ────────────────────────────────────────────────────

async function getVillageReport({ village_id, from, to }) {
  const f = from || dayjs().subtract(30, 'day').format('YYYY-MM-DD');
  const t = to || dayjs().format('YYYY-MM-DD');
  let where = 'col.collection_date BETWEEN ? AND ? AND col.deleted_at IS NULL';
  const params = [f, t];
  if (village_id) { where += ' AND col.village_id = ?'; params.push(village_id); }

  const [rows] = await query(
    `SELECT v.id AS village_id, v.name AS village_name, v.district,
            COUNT(col.id) AS bill_count,
            COALESCE(SUM(col.total_amount), 0) AS total_amount,
            COALESCE(SUM(col.paid_amount), 0) AS paid_amount
     FROM villages v
     LEFT JOIN collections col ON col.village_id = v.id AND ${where}
     GROUP BY v.id ORDER BY total_amount DESC`,
    params
  );

  return {
    from: f, to: t,
    data: rows.map((r) => ({
      ...r,
      total_amount_rupees: fmt(r.total_amount),
      paid_amount_rupees: fmt(r.paid_amount),
      pending_amount_rupees: fmt(r.total_amount - r.paid_amount),
    })),
  };
}

// ── Flower-wise Report ─────────────────────────────────────────────────────

async function getFlowerReport({ flower_id, from, to }) {
  const f = from || dayjs().subtract(30, 'day').format('YYYY-MM-DD');
  const t = to || dayjs().format('YYYY-MM-DD');
  let where = 'col.collection_date BETWEEN ? AND ? AND col.deleted_at IS NULL';
  const params = [f, t];
  if (flower_id) { where += ' AND ci.flower_id = ?'; params.push(flower_id); }

  const [rows] = await query(
    `SELECT fl.id AS flower_id, fl.name AS flower_name, fl.local_name,
            COUNT(DISTINCT col.id) AS bill_count,
            COALESCE(SUM(ci.weight_kg), 0) AS total_weight_kg,
            COALESCE(SUM(ci.amount), 0) AS total_amount
     FROM flowers fl
     LEFT JOIN collection_items ci ON ci.flower_id = fl.id
     LEFT JOIN collections col ON col.id = ci.collection_id AND ${where}
     WHERE fl.deleted_at IS NULL
     GROUP BY fl.id ORDER BY total_amount DESC`,
    params
  );

  return {
    from: f, to: t,
    data: rows.map((r) => ({
      ...r,
      total_weight_kg: parseFloat(r.total_weight_kg || 0).toFixed(2),
      total_amount_rupees: fmt(r.total_amount),
    })),
  };
}

// ── Payments Report ────────────────────────────────────────────────────────

async function getPaymentsReport({ status, from, to }) {
  const f = from || dayjs().subtract(30, 'day').format('YYYY-MM-DD');
  const t = to || dayjs().format('YYYY-MM-DD');
  let where = 'col.collection_date BETWEEN ? AND ? AND col.deleted_at IS NULL';
  const params = [f, t];
  if (status) { where += ' AND col.payment_status = ?'; params.push(status); }

  const [rows] = await query(
    `SELECT col.bill_number, col.collection_date, col.payment_status,
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
     FROM collections WHERE ${where}`,
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

module.exports = { getDailyReport, getMonthlyReport, getVillageReport, getFlowerReport, getPaymentsReport };
