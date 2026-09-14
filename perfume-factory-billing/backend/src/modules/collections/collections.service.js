'use strict';

/**
 * Collections Service - Core Business Logic
 *
 * Critical rules enforced here:
 * 1. Bill number generated via row-locked transaction (SELECT ... FOR UPDATE on bill_sequences)
 * 2. Flower rates locked at insert time from active flower_rates row (SELECT ... FOR UPDATE)
 * 3. Total amount computed SERVER-SIDE: SUM(items) - discount + other_charges
 * 4. Client-provided amounts are IGNORED
 * 5. Collections with payments cannot be deleted (soft or hard)
 * 6. Only remarks can be edited after a payment is recorded
 */

const { transaction, query } = require('../../config/db');
const { generateBillNumber } = require('../../utils/billNumber');
const { emitEvent } = require('../../socket');
const {
  calculateItemAmount,
  calculateCollectionTotal,
  rupeesToPaise,
  paiseToRupees,
} = require('../../utils/money');

const dayjs = require('dayjs');

function pg(p, ps) {
  const page = Math.max(1, parseInt(p, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(ps, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function parseDate(d) {
  if (!d) return dayjs().format('YYYY-MM-DD');
  return d;
}

/**
 * List collections with filters and pagination.
 */
async function listCollections({ page, pageSize, customer_id, village_id, flower_id,
  payment_status, status, date_from, date_to, search }) {
  const { page: p, pageSize: ps, offset } = pg(page, pageSize);

  let where = 'WHERE col.deleted_at IS NULL';
  const params = [];

  if (customer_id) { where += ' AND col.customer_id = ?'; params.push(customer_id); }
  if (village_id) { where += ' AND col.village_id = ?'; params.push(village_id); }
  if (payment_status) { where += ' AND col.payment_status = ?'; params.push(payment_status); }
  if (status) { where += ' AND col.status = ?'; params.push(status); }
  if (date_from) { where += ' AND col.collection_date >= ?'; params.push(date_from); }
  if (date_to) { where += ' AND col.collection_date <= ?'; params.push(date_to); }
  if (search) { where += ' AND (col.bill_number LIKE ? OR c.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (flower_id) {
    where += ' AND EXISTS (SELECT 1 FROM collection_items ci WHERE ci.collection_id = col.id AND ci.flower_id = ?)';
    params.push(flower_id);
  }

  const [[{ total }]] = await query(
    `SELECT COUNT(*) AS total FROM collections col
     LEFT JOIN customers c ON c.id = col.customer_id
     ${where}`,
    params
  );

  const [rows] = await query(
    `SELECT col.*, c.name AS customer_name, c.mobile AS customer_mobile,
            v.name AS village_name, v.district,
            u.name AS created_by_name
     FROM collections col
     LEFT JOIN customers c ON c.id = col.customer_id
     LEFT JOIN villages v ON v.id = col.village_id
     LEFT JOIN users u ON u.id = col.created_by
     ${where}
     ORDER BY col.collection_date DESC, col.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, ps, offset]
  );

  const collectionIds = rows.map((r) => r.id);
  const itemsByCollection = {};
  if (collectionIds.length > 0) {
    const placeholders = collectionIds.map(() => '?').join(',');
    const [items] = await query(
      `SELECT ci.*, f.name AS flower_name, f.local_name
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

  return {
    data: rows.map((r) => {
      const items = itemsByCollection[r.id] || [];
      const totalWeight = items.reduce((acc, i) => acc + (i.weight_kg || 0), 0);
      const flowersSummary = items.map((i) => i.flower_name).join(', ') || 'General';
      const ratesSummary = items.map((i) => `₹${i.rate_per_kg_rupees}/kg`).join(', ') || '-';
      return {
        ...formatCollection(r),
        items,
        total_weight_kg: parseFloat(totalWeight.toFixed(3)),
        flowers_summary: flowersSummary,
        rates_summary: ratesSummary,
      };
    }),
    meta: { page: p, pageSize: ps, total },
  };
}

/**
 * Get single collection with full details (items + payments).
 */
async function getCollectionById(id) {
  const [rows] = await query(
    `SELECT col.*, c.name AS customer_name, c.mobile AS customer_mobile,
            v.name AS village_name, v.district,
            u.name AS created_by_name
     FROM collections col
     LEFT JOIN customers c ON c.id = col.customer_id
     LEFT JOIN villages v ON v.id = col.village_id
     LEFT JOIN users u ON u.id = col.created_by
     WHERE col.id = ? AND col.deleted_at IS NULL`,
    [id]
  );

  if (rows.length === 0) {
    const e = new Error('Collection not found'); e.isOperational = true; e.statusCode = 404; e.code = 'NOT_FOUND'; throw e;
  }

  const collection = formatCollection(rows[0]);

  // Fetch line items
  const [items] = await query(
    `SELECT ci.*, f.name AS flower_name, f.local_name, f.unit
     FROM collection_items ci
     LEFT JOIN flowers f ON f.id = ci.flower_id
     WHERE ci.collection_id = ?
     ORDER BY ci.id ASC`,
    [id]
  );

  // Fetch payments
  const [payments] = await query(
    `SELECT p.*, u.name AS created_by_name FROM payments p
     LEFT JOIN users u ON u.id = p.created_by
     WHERE p.collection_id = ? ORDER BY p.paid_at ASC`,
    [id]
  );

  return {
    ...collection,
    items: items.map((item) => ({
      ...item,
      weight_kg: parseFloat(item.weight_kg),
      rate_per_kg_rupees: paiseToRupees(item.rate_per_kg),
      amount_rupees: paiseToRupees(item.amount),
      // Expose as paise for PDF
      rate_per_kg_paise: item.rate_per_kg,
      amount_paise: item.amount,
    })),
    payments: payments.map((pmt) => ({
      ...pmt,
      amount_rupees: paiseToRupees(pmt.amount),
      amount_paise: pmt.amount,
    })),
  };
}

/**
 * Create collection + items in a single transaction.
 * Bill number and rates are locked inside the transaction.
 *
 * @param {object} data - { customer_id, village_id, collection_date, items, discount, other_charges, remarks }
 * @param {number} userId - who created this
 */
async function createCollection(data, userId) {
  const {
    customer_id,
    village_id,
    collection_date,
    items = [],
    discount = 0,
    other_charges = 0,
    remarks,
  } = data;

  if (!items || items.length === 0) {
    const e = new Error('At least one flower item is required'); e.isOperational = true; e.statusCode = 400; e.code = 'VALIDATION_ERROR'; e.field = 'items'; throw e;
  }

  // Convert to paise
  const discountPaise = rupeesToPaise(discount);
  const otherChargesPaise = rupeesToPaise(other_charges);

  return transaction(async (conn) => {
    // 1. Generate bill number (row-locked)
    const billNumber = await generateBillNumber(conn);

    // 2. For each item: lock the active flower rate row and compute amount server-side
    const resolvedItems = [];
    for (const item of items) {
      if (!item.flower_id) {
        const e = new Error('flower_id is required for each item'); e.isOperational = true; e.statusCode = 400; e.code = 'VALIDATION_ERROR'; e.field = 'items.flower_id'; throw e;
      }
      const weightKg = parseFloat(item.weight_kg);
      if (isNaN(weightKg) || weightKg <= 0) {
        const e = new Error(`Weight must be greater than 0`); e.isOperational = true; e.statusCode = 400; e.code = 'VALIDATION_ERROR'; e.field = 'weight_kg'; throw e;
      }

      // Lock the active rate row
      const [rateRows] = await conn.execute(
        'SELECT id, rate_per_kg FROM flower_rates WHERE flower_id = ? AND is_active = 1 LIMIT 1 FOR UPDATE',
        [item.flower_id]
      );

      if (rateRows.length === 0) {
        const e = new Error(`No active rate found for flower ID ${item.flower_id}. Please set a rate first.`);
        e.isOperational = true; e.statusCode = 400; e.code = 'NO_ACTIVE_RATE'; e.field = 'flower_id'; throw e;
      }

      const rateRow = rateRows[0];
      // Server computes amount — client value is ignored entirely
      const amountPaise = calculateItemAmount(weightKg, rateRow.rate_per_kg);

      resolvedItems.push({
        flower_id: item.flower_id,
        flower_rate_id: rateRow.id,
        weight_kg: weightKg,
        rate_per_kg: rateRow.rate_per_kg,
        amount: amountPaise,
        notes: item.notes || null,
      });
    }

    // 3. Compute total server-side
    const totalAmountPaise = calculateCollectionTotal(
      resolvedItems.map((i) => i.amount),
      discountPaise,
      otherChargesPaise
    );

    // 4. Insert collection
    const [collRes] = await conn.execute(
      `INSERT INTO collections
       (bill_number, customer_id, village_id, collection_date, total_amount, discount, other_charges, paid_amount, payment_status, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'UNPAID', ?, ?)`,
      [
        billNumber,
        customer_id,
        village_id,
        parseDate(collection_date),
        totalAmountPaise,
        discountPaise,
        otherChargesPaise,
        remarks || null,
        userId || null,
      ]
    );

    const collectionId = collRes.insertId;

    // 5. Insert line items
    for (const item of resolvedItems) {
      await conn.execute(
        `INSERT INTO collection_items
         (collection_id, flower_id, flower_rate_id, weight_kg, rate_per_kg, amount, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [collectionId, item.flower_id, item.flower_rate_id, item.weight_kg, item.rate_per_kg, item.amount, item.notes]
      );
    }

    return collectionId;
  }).then(async (id) => {
    const created = await getCollectionById(id);
    emitEvent('bill:created', created);
    return created;
  });
}

/**
 * Update collection - only remarks is editable if payments exist.
 * Line items are editable only if no payments recorded.
 */
async function updateCollection(id, data, userId) {
  const existing = await getCollectionById(id);

  const hasPayments = existing.payments && existing.payments.length > 0;

  if (hasPayments) {
    // Only remarks can be edited after payment
    if (Object.keys(data).some((k) => k !== 'remarks')) {
      const e = new Error('Only remarks can be edited after a payment has been recorded');
      e.isOperational = true; e.statusCode = 409; e.code = 'LOCKED_AFTER_PAYMENT'; throw e;
    }
    await query('UPDATE collections SET remarks = ? WHERE id = ?', [data.remarks || null, id]);
  } else {
    // Full edit allowed before any payment
    const updates = [], params = [];
    if (data.remarks !== undefined) { updates.push('remarks = ?'); params.push(data.remarks); }
    if (data.customer_id !== undefined) { updates.push('customer_id = ?'); params.push(data.customer_id); }
    if (data.village_id !== undefined) { updates.push('village_id = ?'); params.push(data.village_id); }
    if (data.collection_date !== undefined) { updates.push('collection_date = ?'); params.push(data.collection_date); }

    if (updates.length > 0) {
      params.push(id);
      await query(`UPDATE collections SET ${updates.join(', ')} WHERE id = ?`, params);
    }
  }

  const updated = await getCollectionById(id);
  emitEvent('bill:updated', updated);
  return updated;
}

/**
 * Soft delete collection.
 * Blocked if any payments have been recorded.
 */
async function deleteCollection(id) {
  const collection = await getCollectionById(id);

  if (collection.payments && collection.payments.length > 0) {
    const e = new Error('Cannot delete a collection that has payments recorded');
    e.isOperational = true; e.statusCode = 409; e.code = 'HAS_PAYMENTS'; throw e;
  }

  await query('UPDATE collections SET deleted_at = NOW() WHERE id = ?', [id]);
  emitEvent('bill:deleted', { id });
}

/**
 * Format a collection row for API response (convert paise to rupees).
 */
function formatCollection(row) {
  return {
    ...row,
    total_amount_rupees: paiseToRupees(row.total_amount),
    discount_rupees: paiseToRupees(row.discount),
    other_charges_rupees: paiseToRupees(row.other_charges),
    paid_amount_rupees: paiseToRupees(row.paid_amount),
    pending_amount_rupees: paiseToRupees(row.total_amount - row.paid_amount),
    // Keep paise fields for PDF
    total_amount_paise: row.total_amount,
    discount_paise: row.discount,
    other_charges_paise: row.other_charges,
    paid_amount_paise: row.paid_amount,
  };
}

module.exports = {
  listCollections,
  getCollectionById,
  createCollection,
  updateCollection,
  deleteCollection,
};
