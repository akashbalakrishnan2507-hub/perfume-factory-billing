'use strict';

const { query } = require('../../config/db');
const { paiseToRupees } = require('../../utils/money');
const { emitEvent } = require('../../socket');

function pg(p, ps) {
  const page = Math.max(1, parseInt(p, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(ps, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function formatCustomer(row) {
  const totalAmountPaise = Number(row.total_amount || 0);
  const paidAmountPaise = Number(row.paid_amount || 0);
  const pendingAmountPaise = totalAmountPaise - paidAmountPaise;

  return {
    ...row,
    total_supplied_weight_kg: parseFloat(row.total_supplied_weight_kg || 0),
    total_amount_paise: totalAmountPaise,
    paid_amount_paise: paidAmountPaise,
    pending_amount_paise: pendingAmountPaise,
    total_amount_rupees: paiseToRupees(totalAmountPaise),
    paid_amount_rupees: paiseToRupees(paidAmountPaise),
    pending_amount_rupees: paiseToRupees(pendingAmountPaise),
    total_bills: Number(row.total_bills || 0),
  };
}

async function listCustomers({ page, pageSize, search, village_id, status }) {
  const { page: p, pageSize: ps, offset } = pg(page, pageSize);
  let where = 'WHERE c.deleted_at IS NULL';
  const params = [];

  if (search) {
    where += ' AND (c.name LIKE ? OR c.mobile LIKE ? OR c.address LIKE ? OR v.name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (village_id) {
    where += ' AND c.village_id = ?';
    params.push(village_id);
  }
  if (status) {
    where += ' AND c.status = ?';
    params.push(status);
  }

  const [[{ total }]] = await query(
    `SELECT COUNT(*) AS total 
     FROM customers c 
     LEFT JOIN villages v ON v.id = c.village_id 
     ${where}`,
    params
  );

  const [rows] = await query(
    `SELECT c.*, 
            v.name AS village_name, 
            v.district,
            COALESCE(ca.total_amount, 0) AS total_amount,
            COALESCE(ca.paid_amount, 0) AS paid_amount,
            COALESCE(ca.total_bills, 0) AS total_bills,
            COALESCE(wa.total_weight_kg, 0) AS total_supplied_weight_kg
     FROM customers c
     LEFT JOIN villages v ON v.id = c.village_id
     LEFT JOIN (
       SELECT customer_id,
              COALESCE(SUM(total_amount), 0) AS total_amount,
              COALESCE(SUM(paid_amount), 0) AS paid_amount,
              COUNT(*) AS total_bills
       FROM collections
       WHERE deleted_at IS NULL
       GROUP BY customer_id
     ) ca ON ca.customer_id = c.id
     LEFT JOIN (
       SELECT col.customer_id,
              COALESCE(SUM(ci.weight_kg), 0) AS total_weight_kg
       FROM collection_items ci
       JOIN collections col ON col.id = ci.collection_id
       WHERE col.deleted_at IS NULL
       GROUP BY col.customer_id
     ) wa ON wa.customer_id = c.id
     ${where}
     ORDER BY c.id DESC
     LIMIT ? OFFSET ?`,
    [...params, ps, offset]
  );

  return {
    data: rows.map(formatCustomer),
    meta: { page: p, pageSize: ps, total },
  };
}

async function getCustomerById(id) {
  const [rows] = await query(
    `SELECT c.*, 
            v.name AS village_name, 
            v.district,
            COALESCE(ca.total_amount, 0) AS total_amount,
            COALESCE(ca.paid_amount, 0) AS paid_amount,
            COALESCE(ca.total_bills, 0) AS total_bills,
            COALESCE(wa.total_weight_kg, 0) AS total_supplied_weight_kg
     FROM customers c
     LEFT JOIN villages v ON v.id = c.village_id
     LEFT JOIN (
       SELECT customer_id,
              COALESCE(SUM(total_amount), 0) AS total_amount,
              COALESCE(SUM(paid_amount), 0) AS paid_amount,
              COUNT(*) AS total_bills
       FROM collections
       WHERE deleted_at IS NULL
       GROUP BY customer_id
     ) ca ON ca.customer_id = c.id
     LEFT JOIN (
       SELECT col.customer_id,
              COALESCE(SUM(ci.weight_kg), 0) AS total_weight_kg
       FROM collection_items ci
       JOIN collections col ON col.id = ci.collection_id
       WHERE col.deleted_at IS NULL
       GROUP BY col.customer_id
     ) wa ON wa.customer_id = c.id
     WHERE c.id = ? AND c.deleted_at IS NULL`,
    [id]
  );

  if (rows.length === 0) {
    const e = new Error('Customer (Farmer) not found');
    e.isOperational = true;
    e.statusCode = 404;
    e.code = 'NOT_FOUND';
    throw e;
  }

  return formatCustomer(rows[0]);
}

async function createCustomer(data) {
  const { name, mobile, alternate_mobile, village_id, address, bank_name, account_number, ifsc_code, notes } = data;
  const [r] = await query(
    'INSERT INTO customers (name, mobile, alternate_mobile, village_id, address, bank_name, account_number, ifsc_code, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [name, mobile, alternate_mobile || null, village_id, address || null, bank_name || null, account_number || null, ifsc_code || null, notes || null]
  );
  const created = await getCustomerById(r.insertId);
  emitEvent('customer:updated', created);
  return created;
}

async function updateCustomer(id, data) {
  await getCustomerById(id);
  const fields = ['name', 'mobile', 'alternate_mobile', 'village_id', 'address', 'bank_name', 'account_number', 'ifsc_code', 'notes', 'status'];
  const updates = [], params = [];
  for (const f of fields) {
    if (data[f] !== undefined) { updates.push(`${f} = ?`); params.push(data[f]); }
  }
  if (updates.length > 0) {
    params.push(id);
    await query(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`, params);
  }
  const updated = await getCustomerById(id);
  emitEvent('customer:updated', updated);
  return updated;
}

async function deleteCustomer(id) {
  await getCustomerById(id);
  await query('UPDATE customers SET deleted_at = NOW() WHERE id = ?', [id]);
  emitEvent('customer:updated', { id, deleted: true });
}

async function getCustomerHistory(id, { page, pageSize } = {}) {
  const customer = await getCustomerById(id);
  const { page: p, pageSize: ps, offset } = pg(page, pageSize);

  const [[{ total }]] = await query(
    'SELECT COUNT(*) AS total FROM collections WHERE customer_id = ? AND deleted_at IS NULL', [id]
  );

  const [collections] = await query(
    `SELECT col.id, col.bill_number, col.collection_date, col.total_amount, col.paid_amount, col.payment_status, col.remarks, col.created_at
     FROM collections col
     WHERE col.customer_id = ? AND col.deleted_at IS NULL
     ORDER BY col.collection_date DESC, col.created_at DESC LIMIT ? OFFSET ?`,
    [id, ps, offset]
  );

  // Fetch line items for these collections
  const collectionIds = collections.map((c) => c.id);
  let itemsByCollection = {};
  if (collectionIds.length > 0) {
    const placeholders = collectionIds.map(() => '?').join(',');
    const [items] = await query(
      `SELECT ci.*, f.name AS flower_name, f.local_name, f.unit
       FROM collection_items ci
       LEFT JOIN flowers f ON f.id = ci.flower_id
       WHERE ci.collection_id IN (${placeholders})
       ORDER BY ci.id ASC`,
      collectionIds
    );

    for (const item of items) {
      if (!itemsByCollection[item.collection_id]) itemsByCollection[item.collection_id] = [];
      itemsByCollection[item.collection_id].push({
        ...item,
        weight_kg: parseFloat(item.weight_kg),
        rate_per_kg_rupees: paiseToRupees(item.rate_per_kg),
        amount_rupees: paiseToRupees(item.amount),
      });
    }
  }

  // Totals summary
  const [[summary]] = await query(
    `SELECT 
       COALESCE(SUM(total_amount), 0) AS total_billed,
       COALESCE(SUM(paid_amount), 0) AS total_paid
     FROM collections WHERE customer_id = ? AND deleted_at IS NULL`,
    [id]
  );

  const [[weightSummary]] = await query(
    `SELECT COALESCE(SUM(ci.weight_kg), 0) AS total_weight_kg
     FROM collection_items ci
     JOIN collections col ON col.id = ci.collection_id
     WHERE col.customer_id = ? AND col.deleted_at IS NULL`,
    [id]
  );

  return {
    customer,
    data: collections.map((c) => {
      const items = itemsByCollection[c.id] || [];
      const totalWeight = items.reduce((acc, i) => acc + (i.weight_kg || 0), 0);
      const flowersSummary = items.map((i) => i.flower_name).join(', ') || 'General';
      return {
        ...c,
        items,
        total_weight_kg: parseFloat(totalWeight.toFixed(3)),
        flowers_summary: flowersSummary,
        total_amount_rupees: paiseToRupees(c.total_amount),
        paid_amount_rupees: paiseToRupees(c.paid_amount),
        pending_amount_rupees: paiseToRupees(c.total_amount - c.paid_amount),
      };
    }),
    summary: {
      total_weight_kg: parseFloat(Number(weightSummary.total_weight_kg || 0).toFixed(3)),
      total_billed_rupees: paiseToRupees(summary.total_billed),
      total_paid_rupees: paiseToRupees(summary.total_paid),
      total_pending_rupees: paiseToRupees(summary.total_billed - summary.total_paid),
      total_bills: total,
    },
    meta: { page: p, pageSize: ps, total },
  };
}

module.exports = {
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerHistory,
};
