'use strict';

const { query } = require('../../config/db');
const { paiseToRupees } = require('../../utils/money');

function pg(p, ps) {
  const page = Math.max(1, parseInt(p, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(ps, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

async function listCustomers({ page, pageSize, search, village_id, status }) {
  const { page: p, pageSize: ps, offset } = pg(page, pageSize);
  let where = 'WHERE c.deleted_at IS NULL';
  const params = [];
  if (search) { where += ' AND (c.name LIKE ? OR c.mobile LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (village_id) { where += ' AND c.village_id = ?'; params.push(village_id); }
  if (status) { where += ' AND c.status = ?'; params.push(status); }

  const [[{ total }]] = await query(`SELECT COUNT(*) AS total FROM customers c ${where}`, params);
  const [rows] = await query(
    `SELECT c.*, v.name AS village_name, v.district FROM customers c
     LEFT JOIN villages v ON v.id = c.village_id
     ${where} ORDER BY c.name ASC LIMIT ? OFFSET ?`,
    [...params, ps, offset]
  );
  return { data: rows, meta: { page: p, pageSize: ps, total } };
}

async function getCustomerById(id) {
  const [rows] = await query(
    `SELECT c.*, v.name AS village_name, v.district FROM customers c
     LEFT JOIN villages v ON v.id = c.village_id
     WHERE c.id = ? AND c.deleted_at IS NULL`,
    [id]
  );
  if (rows.length === 0) { const e = new Error('Customer not found'); e.isOperational = true; e.statusCode = 404; e.code = 'NOT_FOUND'; throw e; }
  return rows[0];
}

async function createCustomer(data) {
  const { name, mobile, alternate_mobile, village_id, address, bank_name, account_number, ifsc_code, notes } = data;
  const [r] = await query(
    'INSERT INTO customers (name, mobile, alternate_mobile, village_id, address, bank_name, account_number, ifsc_code, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [name, mobile, alternate_mobile || null, village_id, address || null, bank_name || null, account_number || null, ifsc_code || null, notes || null]
  );
  return getCustomerById(r.insertId);
}

async function updateCustomer(id, data) {
  await getCustomerById(id);
  const fields = ['name', 'mobile', 'alternate_mobile', 'village_id', 'address', 'bank_name', 'account_number', 'ifsc_code', 'notes', 'status'];
  const updates = [], params = [];
  for (const f of fields) {
    if (data[f] !== undefined) { updates.push(`${f} = ?`); params.push(data[f]); }
  }
  if (updates.length > 0) { params.push(id); await query(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`, params); }
  return getCustomerById(id);
}

async function deleteCustomer(id) {
  await getCustomerById(id);
  await query('UPDATE customers SET deleted_at = NOW() WHERE id = ?', [id]);
}

async function getCustomerHistory(id, { page, pageSize } = {}) {
  await getCustomerById(id);
  const { page: p, pageSize: ps, offset } = pg(page, pageSize);

  const [[{ total }]] = await query(
    'SELECT COUNT(*) AS total FROM collections WHERE customer_id = ? AND deleted_at IS NULL', [id]
  );

  const [collections] = await query(
    `SELECT id, bill_number, collection_date, total_amount, paid_amount, payment_status, remarks, created_at
     FROM collections WHERE customer_id = ? AND deleted_at IS NULL
     ORDER BY collection_date DESC LIMIT ? OFFSET ?`,
    [id, ps, offset]
  );

  // Totals summary
  const [[summary]] = await query(
    `SELECT 
       COALESCE(SUM(total_amount), 0) AS total_billed,
       COALESCE(SUM(paid_amount), 0) AS total_paid
     FROM collections WHERE customer_id = ? AND deleted_at IS NULL`,
    [id]
  );

  return {
    data: collections.map((c) => ({
      ...c,
      total_amount_rupees: paiseToRupees(c.total_amount),
      paid_amount_rupees: paiseToRupees(c.paid_amount),
      pending_amount_rupees: paiseToRupees(c.total_amount - c.paid_amount),
    })),
    summary: {
      total_billed_rupees: paiseToRupees(summary.total_billed),
      total_paid_rupees: paiseToRupees(summary.total_paid),
      total_pending_rupees: paiseToRupees(summary.total_billed - summary.total_paid),
    },
    meta: { page: p, pageSize: ps, total },
  };
}

module.exports = { listCustomers, getCustomerById, createCustomer, updateCustomer, deleteCustomer, getCustomerHistory };
