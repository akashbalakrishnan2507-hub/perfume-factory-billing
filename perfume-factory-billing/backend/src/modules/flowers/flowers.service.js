'use strict';

const { query } = require('../../config/db');
const { paiseToRupees } = require('../../utils/money');

function pg(p, ps) {
  const page = Math.max(1, parseInt(p, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(ps, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

async function listFlowers({ page, pageSize, search, status }) {
  const { page: p, pageSize: ps, offset } = pg(page, pageSize);
  let where = 'WHERE deleted_at IS NULL';
  const params = [];
  if (search) { where += ' AND (name LIKE ? OR local_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (status) { where += ' AND status = ?'; params.push(status); }

  const [[{ total }]] = await query(`SELECT COUNT(*) AS total FROM flowers ${where}`, params);
  const [rows] = await query(
    `SELECT f.*, fr.rate_per_kg AS current_rate_paise, fr.effective_from AS rate_effective_from
     FROM flowers f
     LEFT JOIN flower_rates fr ON fr.flower_id = f.id AND fr.is_active = 1
     ${where.replace('WHERE deleted_at', 'WHERE f.deleted_at')} ORDER BY f.name ASC LIMIT ? OFFSET ?`,
    [...params, ps, offset]
  );
  return {
    data: rows.map((r) => ({
      ...r,
      current_rate_rupees: r.current_rate_paise ? paiseToRupees(r.current_rate_paise) : null,
    })),
    meta: { page: p, pageSize: ps, total },
  };
}

async function getFlowerById(id) {
  const [rows] = await query(
    `SELECT f.*, fr.id AS rate_id, fr.rate_per_kg AS current_rate_paise, fr.effective_from
     FROM flowers f
     LEFT JOIN flower_rates fr ON fr.flower_id = f.id AND fr.is_active = 1
     WHERE f.id = ? AND f.deleted_at IS NULL`,
    [id]
  );
  if (rows.length === 0) { const e = new Error('Flower not found'); e.isOperational = true; e.statusCode = 404; e.code = 'NOT_FOUND'; throw e; }
  const r = rows[0];
  return { ...r, current_rate_rupees: r.current_rate_paise ? paiseToRupees(r.current_rate_paise) : null };
}

async function createFlower({ name, botanical_name, local_name, unit, notes }) {
  const [r] = await query(
    'INSERT INTO flowers (name, botanical_name, local_name, unit, notes) VALUES (?, ?, ?, ?, ?)',
    [name, botanical_name || null, local_name || null, unit || 'kg', notes || null]
  );
  return getFlowerById(r.insertId);
}

async function updateFlower(id, { name, botanical_name, local_name, unit, notes, status }) {
  await getFlowerById(id);
  const updates = [], params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (botanical_name !== undefined) { updates.push('botanical_name = ?'); params.push(botanical_name); }
  if (local_name !== undefined) { updates.push('local_name = ?'); params.push(local_name); }
  if (unit !== undefined) { updates.push('unit = ?'); params.push(unit); }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (updates.length > 0) { params.push(id); await query(`UPDATE flowers SET ${updates.join(', ')} WHERE id = ?`, params); }
  return getFlowerById(id);
}

async function getFlowerRates(flowerId) {
  await getFlowerById(flowerId);
  const [rates] = await query(
    `SELECT fr.*, u.name AS created_by_name FROM flower_rates fr
     LEFT JOIN users u ON u.id = fr.created_by
     WHERE fr.flower_id = ? ORDER BY fr.effective_from DESC`,
    [flowerId]
  );
  return rates.map((r) => ({ ...r, rate_per_kg_rupees: paiseToRupees(r.rate_per_kg) }));
}

async function setFlowerRate(flowerId, ratePerKgPaise, userId) {
  await getFlowerById(flowerId);
  // Close any currently active rate for this flower
  await query(
    'UPDATE flower_rates SET is_active = 0, effective_to = NOW() WHERE flower_id = ? AND is_active = 1',
    [flowerId]
  );
  // Insert new active rate
  const [r] = await query(
    'INSERT INTO flower_rates (flower_id, rate_per_kg, is_active, created_by) VALUES (?, ?, 1, ?)',
    [flowerId, ratePerKgPaise, userId || null]
  );
  const [rows] = await query('SELECT * FROM flower_rates WHERE id = ?', [r.insertId]);
  return { ...rows[0], rate_per_kg_rupees: paiseToRupees(rows[0].rate_per_kg) };
}

module.exports = { listFlowers, getFlowerById, createFlower, updateFlower, getFlowerRates, setFlowerRate };
