'use strict';

const { query } = require('../../config/db');
const { paiseToRupees } = require('../../utils/money');
const { emitEvent } = require('../../socket');
const dayjs = require('dayjs');

function pg(p, ps) {
  const page = Math.max(1, parseInt(p, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(ps, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

async function listFlowers({ page, pageSize, search, status }) {
  const { page: p, pageSize: ps, offset } = pg(page, pageSize);
  let where = 'WHERE f.deleted_at IS NULL';
  const params = [];
  if (search) {
    where += ' AND (f.name LIKE ? OR f.local_name LIKE ? OR f.botanical_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status) {
    where += ' AND f.status = ?';
    params.push(status);
  }

  const [[{ total }]] = await query(
    `SELECT COUNT(*) AS total FROM flowers f ${where}`,
    params
  );

  const [rows] = await query(
    `SELECT f.*, 
            fr.id AS rate_id, 
            fr.rate_per_kg AS current_rate_paise, 
            fr.effective_from AS rate_effective_from
     FROM flowers f
     LEFT JOIN flower_rates fr ON fr.flower_id = f.id AND fr.is_active = 1
     ${where} 
     ORDER BY f.name ASC 
     LIMIT ? OFFSET ?`,
    [...params, ps, offset]
  );

  return {
    data: rows.map((r) => ({
      ...r,
      current_rate_rupees: r.current_rate_paise ? paiseToRupees(r.current_rate_paise) : null,
      effective_date: r.rate_effective_from ? dayjs(r.rate_effective_from).format('YYYY-MM-DD') : null,
    })),
    meta: { page: p, pageSize: ps, total },
  };
}

async function getFlowerById(id) {
  const [rows] = await query(
    `SELECT f.*, fr.id AS rate_id, fr.rate_per_kg AS current_rate_paise, fr.effective_from AS rate_effective_from
     FROM flowers f
     LEFT JOIN flower_rates fr ON fr.flower_id = f.id AND fr.is_active = 1
     WHERE f.id = ? AND f.deleted_at IS NULL`,
    [id]
  );
  if (rows.length === 0) {
    const e = new Error('Flower not found');
    e.isOperational = true;
    e.statusCode = 404;
    e.code = 'NOT_FOUND';
    throw e;
  }
  const r = rows[0];
  return {
    ...r,
    current_rate_rupees: r.current_rate_paise ? paiseToRupees(r.current_rate_paise) : null,
    effective_date: r.rate_effective_from ? dayjs(r.rate_effective_from).format('YYYY-MM-DD') : null,
  };
}

async function createFlower({ name, botanical_name, local_name, unit, notes }) {
  const [r] = await query(
    'INSERT INTO flowers (name, botanical_name, local_name, unit, notes) VALUES (?, ?, ?, ?, ?)',
    [name, botanical_name || null, local_name || null, unit || 'kg', notes || null]
  );
  const created = await getFlowerById(r.insertId);
  emitEvent('rate:updated', { flower: created });
  return created;
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
  if (updates.length > 0) {
    params.push(id);
    await query(`UPDATE flowers SET ${updates.join(', ')} WHERE id = ?`, params);
  }
  const updated = await getFlowerById(id);
  emitEvent('rate:updated', { flower: updated });
  return updated;
}

async function getFlowerRates(flowerId) {
  await getFlowerById(flowerId);
  const [rates] = await query(
    `SELECT fr.*, u.name AS created_by_name FROM flower_rates fr
     LEFT JOIN users u ON u.id = fr.created_by
     WHERE fr.flower_id = ? ORDER BY fr.effective_from DESC, fr.id DESC`,
    [flowerId]
  );
  return rates.map((r) => ({
    ...r,
    rate_per_kg_rupees: paiseToRupees(r.rate_per_kg),
    effective_date: dayjs(r.effective_from).format('YYYY-MM-DD'),
  }));
}

async function setFlowerRate(flowerId, ratePerKgPaise, userId, effectiveFrom) {
  await getFlowerById(flowerId);
  const effectiveDate = effectiveFrom
    ? dayjs(effectiveFrom).format('YYYY-MM-DD HH:mm:ss')
    : dayjs().format('YYYY-MM-DD HH:mm:ss');

  // Close any currently active rate for this flower
  await query(
    'UPDATE flower_rates SET is_active = 0, effective_to = ? WHERE flower_id = ? AND is_active = 1',
    [effectiveDate, flowerId]
  );

  // Insert new active rate
  const [r] = await query(
    'INSERT INTO flower_rates (flower_id, rate_per_kg, is_active, effective_from, created_by) VALUES (?, ?, 1, ?, ?)',
    [flowerId, ratePerKgPaise, effectiveDate, userId || null]
  );

  const [rows] = await query('SELECT * FROM flower_rates WHERE id = ?', [r.insertId]);
  const result = {
    ...rows[0],
    rate_per_kg_rupees: paiseToRupees(rows[0].rate_per_kg),
    effective_date: dayjs(rows[0].effective_from).format('YYYY-MM-DD'),
  };

  emitEvent('rate:updated', { flowerId, rate: result });
  return result;
}

async function updateFlowerRate(rateId, { rate_per_kg_paise, effective_from }) {
  const [existing] = await query('SELECT * FROM flower_rates WHERE id = ?', [rateId]);
  if (existing.length === 0) {
    const e = new Error('Rate record not found');
    e.isOperational = true;
    e.statusCode = 404;
    e.code = 'NOT_FOUND';
    throw e;
  }

  const updates = [], params = [];
  if (rate_per_kg_paise !== undefined) {
    updates.push('rate_per_kg = ?');
    params.push(rate_per_kg_paise);
  }
  if (effective_from !== undefined) {
    updates.push('effective_from = ?');
    params.push(dayjs(effective_from).format('YYYY-MM-DD HH:mm:ss'));
  }

  if (updates.length > 0) {
    params.push(rateId);
    await query(`UPDATE flower_rates SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  const [updated] = await query('SELECT * FROM flower_rates WHERE id = ?', [rateId]);
  const result = {
    ...updated[0],
    rate_per_kg_rupees: paiseToRupees(updated[0].rate_per_kg),
    effective_date: dayjs(updated[0].effective_from).format('YYYY-MM-DD'),
  };

  emitEvent('rate:updated', { flowerId: updated[0].flower_id, rate: result });
  return result;
}

async function getActiveRates() {
  const [rows] = await query(
    `SELECT f.id, f.name, f.local_name, f.botanical_name, f.unit,
            fr.id AS rate_id, fr.rate_per_kg AS rate_paise, fr.effective_from
     FROM flowers f
     LEFT JOIN flower_rates fr ON fr.flower_id = f.id AND fr.is_active = 1
     WHERE f.deleted_at IS NULL AND f.status = 'active'
     ORDER BY f.name ASC`
  );

  return rows.map((r) => ({
    ...r,
    current_rate_rupees: r.rate_paise ? paiseToRupees(r.rate_paise) : null,
    effective_date: r.effective_from ? dayjs(r.effective_from).format('YYYY-MM-DD') : null,
  }));
}

module.exports = {
  listFlowers,
  getFlowerById,
  createFlower,
  updateFlower,
  getFlowerRates,
  setFlowerRate,
  updateFlowerRate,
  getActiveRates,
};
