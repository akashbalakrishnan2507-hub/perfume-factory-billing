'use strict';

const { query } = require('../../config/db');

function pg(pageStr, pageSizeStr) {
  const page = Math.max(1, parseInt(pageStr, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

async function listVillages({ page, pageSize, search, district, status }) {
  const { page: p, pageSize: ps, offset } = pg(page, pageSize);
  let where = 'WHERE deleted_at IS NULL';
  const params = [];
  if (search) { where += ' AND (name LIKE ? OR district LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (district) { where += ' AND district = ?'; params.push(district); }
  if (status) { where += ' AND status = ?'; params.push(status); }

  const [[{ total }]] = await query(`SELECT COUNT(*) AS total FROM villages ${where}`, params);
  const [rows] = await query(
    `SELECT v.*, COUNT(c.id) AS customer_count 
     FROM villages v LEFT JOIN customers c ON c.village_id = v.id AND c.deleted_at IS NULL
     ${where.replace('WHERE deleted_at IS NULL', 'WHERE v.deleted_at IS NULL')}
     GROUP BY v.id ORDER BY v.name ASC LIMIT ? OFFSET ?`,
    [...params, ps, offset]
  );
  return { data: rows, meta: { page: p, pageSize: ps, total } };
}

async function getVillageById(id) {
  const [rows] = await query('SELECT * FROM villages WHERE id = ? AND deleted_at IS NULL', [id]);
  if (rows.length === 0) { const e = new Error('Village not found'); e.isOperational = true; e.statusCode = 404; e.code = 'NOT_FOUND'; throw e; }
  return rows[0];
}

async function createVillage({ name, district, state = 'Tamil Nadu', pincode }) {
  const [r] = await query('INSERT INTO villages (name, district, state, pincode) VALUES (?, ?, ?, ?)', [name, district, state, pincode]);
  return getVillageById(r.insertId);
}

async function updateVillage(id, { name, district, state, pincode, status }) {
  await getVillageById(id);
  const updates = [], params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (district !== undefined) { updates.push('district = ?'); params.push(district); }
  if (state !== undefined) { updates.push('state = ?'); params.push(state); }
  if (pincode !== undefined) { updates.push('pincode = ?'); params.push(pincode); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (updates.length > 0) { params.push(id); await query(`UPDATE villages SET ${updates.join(', ')} WHERE id = ?`, params); }
  return getVillageById(id);
}

async function deleteVillage(id) {
  await getVillageById(id);
  // Check for active customers
  const [[{ cnt }]] = await query('SELECT COUNT(*) AS cnt FROM customers WHERE village_id = ? AND deleted_at IS NULL', [id]);
  if (cnt > 0) {
    const e = new Error(`Cannot delete village: ${cnt} customer(s) are assigned to it`);
    e.isOperational = true; e.statusCode = 409; e.code = 'HAS_CUSTOMERS'; throw e;
  }
  await query('UPDATE villages SET deleted_at = NOW() WHERE id = ?', [id]);
}

module.exports = { listVillages, getVillageById, createVillage, updateVillage, deleteVillage };
