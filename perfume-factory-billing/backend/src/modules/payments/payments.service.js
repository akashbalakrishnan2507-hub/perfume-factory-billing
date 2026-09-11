'use strict';

/**
 * Payments Service
 *
 * Critical rules:
 * 1. Row-lock collection before inserting payment (prevents concurrent overpayment race condition)
 * 2. Recompute total paid so far inside the same transaction
 * 3. Reject if new payment would exceed total_amount
 * 4. Update collection paid_amount and payment_status atomically
 */

const { transaction } = require('../../config/db');
const { rupeesToPaise, paiseToRupees } = require('../../utils/money');
const dayjs = require('dayjs');

async function createPayment(collectionId, data, userId) {
  const { amount, payment_mode = 'CASH', reference_number, notes, paid_at } = data;

  const amountPaise = rupeesToPaise(amount);
  if (amountPaise <= 0) {
    const e = new Error('Payment amount must be greater than 0'); e.isOperational = true; e.statusCode = 400; e.code = 'VALIDATION_ERROR'; e.field = 'amount'; throw e;
  }

  return transaction(async (conn) => {
    // 1. Lock the collection row — prevents concurrent payment race conditions
    const [collRows] = await conn.execute(
      'SELECT id, total_amount, paid_amount, payment_status, deleted_at FROM collections WHERE id = ? FOR UPDATE',
      [collectionId]
    );

    if (collRows.length === 0 || collRows[0].deleted_at !== null) {
      const e = new Error('Collection not found'); e.isOperational = true; e.statusCode = 404; e.code = 'NOT_FOUND'; throw e;
    }

    const collection = collRows[0];
    const totalAmount = Number(collection.total_amount);
    const alreadyPaid = Number(collection.paid_amount);
    const pendingAmount = totalAmount - alreadyPaid;

    // 2. Overpayment guard — server rejects, never silently clamps
    if (amountPaise > pendingAmount) {
      const e = new Error(
        `Payment of ₹${paiseToRupees(amountPaise).toFixed(2)} exceeds the pending amount of ₹${paiseToRupees(pendingAmount).toFixed(2)}`
      );
      e.isOperational = true; e.statusCode = 400; e.code = 'OVERPAYMENT'; e.field = 'amount'; throw e;
    }

    // 3. Generate payment number
    const year = dayjs().year();
    const [seqRows] = await conn.execute(
      'SELECT COUNT(*) AS cnt FROM payments WHERE YEAR(paid_at) = ?', [year]
    );
    const pmtSeq = (seqRows[0].cnt || 0) + 1;
    const paymentNumber = `PMT-${year}-${String(pmtSeq).padStart(4, '0')}`;

    // 4. Insert payment
    const [pmtRes] = await conn.execute(
      `INSERT INTO payments (collection_id, payment_number, amount, payment_mode, reference_number, notes, paid_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        collectionId,
        paymentNumber,
        amountPaise,
        payment_mode,
        reference_number || null,
        notes || null,
        paid_at ? dayjs(paid_at).format('YYYY-MM-DD HH:mm:ss') : dayjs().format('YYYY-MM-DD HH:mm:ss'),
        userId || null,
      ]
    );

    // 5. Update collection paid_amount and payment_status atomically
    const newPaidAmount = alreadyPaid + amountPaise;
    let newStatus = 'UNPAID';
    if (newPaidAmount >= totalAmount) newStatus = 'PAID';
    else if (newPaidAmount > 0) newStatus = 'PARTIALLY_PAID';

    await conn.execute(
      'UPDATE collections SET paid_amount = ?, payment_status = ? WHERE id = ?',
      [newPaidAmount, newStatus, collectionId]
    );

    const [pmtRows] = await conn.execute('SELECT * FROM payments WHERE id = ?', [pmtRes.insertId]);
    return {
      ...pmtRows[0],
      amount_rupees: paiseToRupees(pmtRows[0].amount),
      amount_paise: pmtRows[0].amount,
      collection_status: newStatus,
      pending_amount_rupees: paiseToRupees(totalAmount - newPaidAmount),
    };
  });
}

async function getPaymentsByCollection(collectionId) {
  const { query } = require('../../config/db');
  const [rows] = await query(
    `SELECT p.*, u.name AS created_by_name FROM payments p
     LEFT JOIN users u ON u.id = p.created_by
     WHERE p.collection_id = ? ORDER BY p.paid_at ASC`,
    [collectionId]
  );
  return rows.map((r) => ({ ...r, amount_rupees: paiseToRupees(r.amount), amount_paise: r.amount }));
}

module.exports = { createPayment, getPaymentsByCollection };
