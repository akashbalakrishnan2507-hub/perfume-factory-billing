'use strict';

const { query } = require('../../config/db');
const { paiseToRupees } = require('../../utils/money');
const dayjs = require('dayjs');

async function getSummary() {
  const today = dayjs().format('YYYY-MM-DD');
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
  const monthEnd = dayjs().endOf('month').format('YYYY-MM-DD');

  const [[todayStats]] = await query(
    `SELECT 
       COUNT(*) AS bills_today,
       COALESCE(SUM(total_amount), 0) AS amount_today,
       COALESCE(SUM(paid_amount), 0) AS paid_today
     FROM collections WHERE collection_date = ? AND deleted_at IS NULL`,
    [today]
  );

  const [[monthStats]] = await query(
    `SELECT 
       COUNT(*) AS bills_month,
       COALESCE(SUM(total_amount), 0) AS amount_month,
       COALESCE(SUM(paid_amount), 0) AS paid_month,
       COALESCE(SUM(total_amount - paid_amount), 0) AS pending_month,
       SUM(CASE WHEN payment_status = 'UNPAID' THEN 1 ELSE 0 END) AS unpaid_count,
       SUM(CASE WHEN payment_status = 'PARTIALLY_PAID' THEN 1 ELSE 0 END) AS partial_count
     FROM collections WHERE collection_date BETWEEN ? AND ? AND deleted_at IS NULL`,
    [monthStart, monthEnd]
  );

  const [[customerCount]] = await query("SELECT COUNT(*) AS cnt FROM customers WHERE deleted_at IS NULL AND status = 'active'");
  const [[flowerCount]] = await query("SELECT COUNT(*) AS cnt FROM flowers WHERE deleted_at IS NULL AND status = 'active'");

  return {
    today: {
      bills: todayStats.bills_today,
      amount_rupees: paiseToRupees(todayStats.amount_today),
      paid_rupees: paiseToRupees(todayStats.paid_today),
      pending_rupees: paiseToRupees(todayStats.amount_today - todayStats.paid_today),
    },
    month: {
      bills: monthStats.bills_month,
      amount_rupees: paiseToRupees(monthStats.amount_month),
      paid_rupees: paiseToRupees(monthStats.paid_month),
      pending_rupees: paiseToRupees(monthStats.pending_month),
      unpaid_count: monthStats.unpaid_count,
      partial_count: monthStats.partial_count,
    },
    totals: {
      active_customers: customerCount.cnt,
      active_flowers: flowerCount.cnt,
    },
  };
}

async function getCharts() {
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
  const monthEnd = dayjs().endOf('month').format('YYYY-MM-DD');
  const sixMonthsAgo = dayjs().subtract(5, 'month').startOf('month').format('YYYY-MM-DD');

  // Monthly trend (last 6 months)
  const [monthlyTrend] = await query(
    `SELECT 
       DATE_FORMAT(collection_date, '%Y-%m') AS month_key,
       DATE_FORMAT(collection_date, '%b %Y') AS month_label,
       COUNT(*) AS bill_count,
       COALESCE(SUM(total_amount), 0) AS total_amount,
       COALESCE(SUM(paid_amount), 0) AS paid_amount
     FROM collections
     WHERE collection_date >= ? AND deleted_at IS NULL
     GROUP BY month_key ORDER BY month_key ASC`,
    [sixMonthsAgo]
  );

  // Flower-wise breakdown (current month)
  const [flowerBreakdown] = await query(
    `SELECT f.name AS flower_name, f.local_name,
            COALESCE(SUM(ci.weight_kg), 0) AS total_weight_kg,
            COALESCE(SUM(ci.amount), 0) AS total_amount
     FROM flowers f
     LEFT JOIN collection_items ci ON ci.flower_id = f.id
     LEFT JOIN collections col ON col.id = ci.collection_id
       AND col.collection_date BETWEEN ? AND ?
       AND col.deleted_at IS NULL
     WHERE f.deleted_at IS NULL AND f.status = 'active'
     GROUP BY f.id ORDER BY total_amount DESC`,
    [monthStart, monthEnd]
  );

  // Village-wise breakdown (current month)
  const [villageBreakdown] = await query(
    `SELECT v.name AS village_name, v.district,
            COUNT(col.id) AS bill_count,
            COALESCE(SUM(col.total_amount), 0) AS total_amount
     FROM villages v
     LEFT JOIN collections col ON col.village_id = v.id
       AND col.collection_date BETWEEN ? AND ?
       AND col.deleted_at IS NULL
     WHERE v.deleted_at IS NULL AND v.status = 'active'
     GROUP BY v.id ORDER BY total_amount DESC`,
    [monthStart, monthEnd]
  );

  return {
    monthly_trend: monthlyTrend.map((r) => ({
      ...r,
      total_amount_rupees: paiseToRupees(r.total_amount),
      paid_amount_rupees: paiseToRupees(r.paid_amount),
    })),
    flower_breakdown: flowerBreakdown.map((r) => ({
      ...r,
      total_weight_kg: parseFloat(r.total_weight_kg || 0).toFixed(2),
      total_amount_rupees: paiseToRupees(r.total_amount),
    })),
    village_breakdown: villageBreakdown.map((r) => ({
      ...r,
      total_amount_rupees: paiseToRupees(r.total_amount),
    })),
  };
}

module.exports = { getSummary, getCharts };
