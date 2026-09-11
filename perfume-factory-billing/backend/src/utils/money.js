'use strict';

/**
 * Money utilities for the Perfume Factory Billing System.
 *
 * Rule: ALL monetary values are stored as integers (paise = 1/100 of a rupee).
 * The UI sends and receives rupee values as strings/numbers with up to 2 decimal places.
 * This module handles the boundary conversions.
 */

const PAISE_PER_RUPEE = 100;

/**
 * Convert rupees (string or number) to paise (integer).
 * Rounds to nearest paise to avoid floating-point accumulation.
 * @param {string|number} rupees
 * @returns {number} integer paise
 */
function rupeesToPaise(rupees) {
  if (rupees === null || rupees === undefined || rupees === '') return 0;
  const num = parseFloat(String(rupees).replace(/,/g, ''));
  if (isNaN(num)) throw new Error(`Invalid monetary value: ${rupees}`);
  return Math.round(num * PAISE_PER_RUPEE);
}

/**
 * Convert paise (integer) to rupees (number with 2 decimal places).
 * @param {number} paise
 * @returns {number}
 */
function paiseToRupees(paise) {
  if (paise === null || paise === undefined) return 0;
  return Math.round(Number(paise)) / PAISE_PER_RUPEE;
}

/**
 * Format paise value as Indian rupee string.
 * Example: 123456 paise → "₹1,234.56"
 * @param {number} paise
 * @returns {string}
 */
function formatRupees(paise) {
  const rupees = paiseToRupees(paise);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Calculate amount for a collection item.
 * weight_kg is a decimal (e.g. 50.5), rate_per_kg is stored as paise per kg.
 * Returns amount in paise.
 *
 * @param {string|number} weightKg - weight in kilograms (decimal)
 * @param {number} ratePerKgPaise - rate per kg stored in paise
 * @returns {number} amount in paise (integer)
 */
function calculateItemAmount(weightKg, ratePerKgPaise) {
  const weight = parseFloat(String(weightKg));
  if (isNaN(weight) || weight < 0) throw new Error(`Invalid weight: ${weightKg}`);
  // Multiply weight (float) × rate (paise per kg) and round to nearest paise
  return Math.round(weight * ratePerKgPaise);
}

/**
 * Calculate collection total.
 * totalAmount = SUM(item amounts) - discount + otherCharges
 * All in paise.
 *
 * @param {number[]} itemAmountsPaise
 * @param {number} discountPaise
 * @param {number} otherChargesPaise
 * @returns {number} total amount in paise
 */
function calculateCollectionTotal(itemAmountsPaise, discountPaise = 0, otherChargesPaise = 0) {
  const itemsSum = itemAmountsPaise.reduce((acc, a) => acc + Math.round(a), 0);
  return itemsSum - Math.round(discountPaise) + Math.round(otherChargesPaise);
}

module.exports = {
  rupeesToPaise,
  paiseToRupees,
  formatRupees,
  calculateItemAmount,
  calculateCollectionTotal,
  PAISE_PER_RUPEE,
};
