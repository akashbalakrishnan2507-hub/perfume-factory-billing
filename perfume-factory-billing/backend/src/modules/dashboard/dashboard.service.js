'use strict';

const { query } = require('../../config/db');
const { paiseToRupees } = require('../../utils/money');
const dayjs = require('dayjs');

async function getSummary() {
  const today = dayjs().format('YYYY-MM-DD');
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
  const monthEnd = dayjs().endOf('month').format('YYYY-MM-DD');

  // 1. Today's collections & financial stats
  const [[todayStats]] = await query(
    `SELECT 
       COUNT(*) AS bills_today,
       COALESCE(SUM(total_amount), 0) AS amount_today,
       COALESCE(SUM(paid_amount), 0) AS paid_today
     FROM collections WHERE (collection_date = ? OR DATE(created_at) = ?) AND deleted_at IS NULL`,
    [today, today]
  );

  // 2. Today's flower weight in KG
  const [[todayWeight]] = await query(
    `SELECT COALESCE(SUM(ci.weight_kg), 0) AS weight_today
     FROM collection_items ci
     JOIN collections col ON col.id = ci.collection_id
     WHERE (col.collection_date = ? OR DATE(col.created_at) = ?) AND col.deleted_at IS NULL`,
    [today, today]
  );

  // 3. Month stats
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

  // 4. Month flower weight in KG
  const [[monthWeight]] = await query(
    `SELECT COALESCE(SUM(ci.weight_kg), 0) AS weight_month
     FROM collection_items ci
     JOIN collections col ON col.id = ci.collection_id
     WHERE col.collection_date BETWEEN ? AND ? AND col.deleted_at IS NULL`,
    [monthStart, monthEnd]
  );

  // 5. Total all-time collection payments and pending balances
  const [[allTimeStats]] = await query(
    `SELECT 
       COALESCE(SUM(total_amount), 0) AS total_billed,
       COALESCE(SUM(paid_amount), 0) AS total_collected,
       COALESCE(SUM(total_amount - paid_amount), 0) AS total_pending
     FROM collections WHERE deleted_at IS NULL`
  );

  // 6. Counts
  const [[customerCount]] = await query("SELECT COUNT(*) AS cnt FROM customers WHERE deleted_at IS NULL AND status = 'active'");
  const [[flowerCount]] = await query("SELECT COUNT(*) AS cnt FROM flowers WHERE deleted_at IS NULL AND status = 'active'");

  // 7. Recent Activity (latest bills and payments combined)
  const [recentBills] = await query(
    `SELECT col.id, col.bill_number, col.collection_date, col.created_at, col.total_amount, col.paid_amount, col.payment_status,
            c.name AS customer_name, v.name AS village_name,
            'BILL' AS activity_type
     FROM collections col
     LEFT JOIN customers c ON c.id = col.customer_id
     LEFT JOIN villages v ON v.id = col.village_id
     WHERE col.deleted_at IS NULL
     ORDER BY col.created_at DESC LIMIT 8`
  );

  // Fetch flower names & weights for recent bills
  const recentBillIds = recentBills.map((b) => b.id);
  const itemsByBill = {};
  if (recentBillIds.length > 0) {
    const placeholders = recentBillIds.map(() => '?').join(',');
    const [items] = await query(
      `SELECT ci.collection_id, ci.weight_kg, f.name AS flower_name
       FROM collection_items ci
       LEFT JOIN flowers f ON f.id = ci.flower_id
       WHERE ci.collection_id IN (${placeholders})`,
      recentBillIds
    );
    for (const item of items) {
      if (!itemsByBill[item.collection_id]) itemsByBill[item.collection_id] = [];
      itemsByBill[item.collection_id].push(item);
    }
  }

  const [recentPayments] = await query(
    `SELECT p.id, p.payment_number, p.amount, p.payment_mode, p.paid_at AS created_at,
            col.bill_number, c.name AS customer_name, v.name AS village_name,
            'PAYMENT' AS activity_type
     FROM payments p
     JOIN collections col ON col.id = p.collection_id
     LEFT JOIN customers c ON c.id = col.customer_id
     LEFT JOIN villages v ON v.id = col.village_id
     ORDER BY p.paid_at DESC LIMIT 8`
  );

  const formattedBills = recentBills.map((b) => {
    const bItems = itemsByBill[b.id] || [];
    const flowers = bItems.map((i) => i.flower_name).join(', ') || 'General';
    const totalWeight = bItems.reduce((acc, i) => acc + parseFloat(i.weight_kg || 0), 0);
    return {
      id: `bill-${b.id}`,
      type: 'BILL',
      title: `Bill ${b.bill_number}`,
      time: b.created_at,
      customer_name: b.customer_name,
      village_name: b.village_name,
      flowers_summary: flowers,
      weight_kg: parseFloat(totalWeight.toFixed(3)),
      amount_rupees: paiseToRupees(b.total_amount),
      paid_amount_rupees: paiseToRupees(b.paid_amount),
      pending_amount_rupees: paiseToRupees(b.total_amount - b.paid_amount),
      payment_status: b.payment_status,
      icon: '🧾',
    };
  });

  const formattedPayments = recentPayments.map((p) => ({
    id: `pmt-${p.id}`,
    type: 'PAYMENT',
    title: `Payment ${p.payment_number} (${p.payment_mode})`,
    time: p.created_at,
    customer_name: p.customer_name,
    village_name: p.village_name,
    bill_number: p.bill_number,
    amount_rupees: paiseToRupees(p.amount),
    icon: '💳',
  }));

  const recentActivity = [...formattedBills, ...formattedPayments]
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 10);

  // 8. Flower-wise summary for this month
  const [flowerSummaryRows] = await query(
    `SELECT f.id, f.name AS flower_name, f.local_name,
            COALESCE(SUM(ci.weight_kg), 0) AS total_weight_kg,
            COALESCE(SUM(ci.amount), 0) AS total_amount,
            COUNT(DISTINCT col.id) AS bill_count
     FROM flowers f
     LEFT JOIN collection_items ci ON ci.flower_id = f.id
     LEFT JOIN collections col ON col.id = ci.collection_id 
       AND col.collection_date BETWEEN ? AND ? 
       AND col.deleted_at IS NULL
     WHERE f.deleted_at IS NULL AND f.status = 'active'
     GROUP BY f.id 
     ORDER BY total_amount DESC`,
    [monthStart, monthEnd]
  );

  const totalFlowerWeight = flowerSummaryRows.reduce((acc, f) => acc + parseFloat(f.total_weight_kg || 0), 0);
  const flowerSummary = flowerSummaryRows.map((f) => {
    const weight = parseFloat(f.total_weight_kg || 0);
    const sharePct = totalFlowerWeight > 0 ? ((weight / totalFlowerWeight) * 100).toFixed(1) : '0.0';
    return {
      ...f,
      total_weight_kg: parseFloat(weight.toFixed(2)),
      total_amount_rupees: paiseToRupees(f.total_amount),
      share_percentage: sharePct,
    };
  });

  const todayFlowerWeightKg = parseFloat(Number(todayWeight.weight_today || 0).toFixed(2));
  const todayPurchaseAmountRupees = paiseToRupees(todayStats.amount_today);
  const monthlyRevenueRupees = paiseToRupees(monthStats.amount_month);
  const collectedAmountRupees = paiseToRupees(allTimeStats.total_collected);
  const pendingPaymentsRupees = paiseToRupees(allTimeStats.total_pending);

  return {
    // 7 Explicit Real MySQL KPI metrics required by spec
    kpi: {
      today_bills: Number(todayStats.bills_today || 0),
      today_flower_weight_kg: todayFlowerWeightKg,
      today_purchase_amount_rupees: todayPurchaseAmountRupees,
      monthly_revenue_rupees: monthlyRevenueRupees,
      collected_amount_rupees: collectedAmountRupees,
      pending_payments_rupees: pendingPaymentsRupees,
      active_farmers: Number(customerCount.cnt || 0),
    },
    today: {
      bills: todayStats.bills_today,
      weight_kg: todayFlowerWeightKg,
      amount_rupees: todayPurchaseAmountRupees,
      paid_rupees: paiseToRupees(todayStats.paid_today),
      pending_rupees: paiseToRupees(todayStats.amount_today - todayStats.paid_today),
    },
    month: {
      bills: monthStats.bills_month,
      weight_kg: parseFloat(Number(monthWeight.weight_month || 0).toFixed(2)),
      amount_rupees: monthlyRevenueRupees,
      paid_rupees: paiseToRupees(monthStats.paid_month),
      pending_rupees: paiseToRupees(monthStats.pending_month),
      unpaid_count: monthStats.unpaid_count,
      partial_count: monthStats.partial_count,
    },
    totals: {
      active_customers: customerCount.cnt,
      active_flowers: flowerCount.cnt,
      collected_amount_rupees: collectedAmountRupees,
      pending_payments_rupees: pendingPaymentsRupees,
    },
    recent_activity: recentActivity,
    flower_summary: flowerSummary,
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
