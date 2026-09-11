'use strict';

const dayjs = require('dayjs');

/**
 * Generates the next bill number in format PF-YYYY-NNNN.
 *
 * CRITICAL: Must be called inside a DB transaction with row-level locking.
 * Uses SELECT ... FOR UPDATE on the bill_sequences table to prevent
 * two concurrent requests from getting the same sequence number.
 *
 * @param {object} conn - mysql2 connection (inside a transaction)
 * @returns {Promise<string>} bill number like "PF-2024-0001"
 */
async function generateBillNumber(conn) {
  const year = dayjs().year();

  // Lock the row for this year — prevents concurrent inserts from racing
  const [rows] = await conn.execute(
    'SELECT id, current_seq FROM bill_sequences WHERE year = ? FOR UPDATE',
    [year]
  );

  let nextSeq;

  if (rows.length === 0) {
    // First bill of the year: insert the sequence row
    nextSeq = 1;
    await conn.execute(
      'INSERT INTO bill_sequences (year, current_seq) VALUES (?, ?)',
      [year, nextSeq]
    );
  } else {
    // Increment the sequence
    nextSeq = rows[0].current_seq + 1;
    await conn.execute(
      'UPDATE bill_sequences SET current_seq = ?, updated_at = NOW() WHERE year = ?',
      [nextSeq, year]
    );
  }

  // Format as PF-YYYY-NNNN (zero-padded to 4 digits)
  const paddedSeq = String(nextSeq).padStart(4, '0');
  return `PF-${year}-${paddedSeq}`;
}

module.exports = { generateBillNumber };
