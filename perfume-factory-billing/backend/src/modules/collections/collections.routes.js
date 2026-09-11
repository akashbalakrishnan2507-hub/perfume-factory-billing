'use strict';
const { Router } = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const ctrl = require('./collections.controller');
const paymentCtrl = require('../payments/payments.controller');
const invoiceCtrl = require('../invoices/invoices.controller');

const router = Router();
router.use(authenticate);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.get('/:id/invoice.pdf', invoiceCtrl.generatePDF);
router.post('/:id/payments', [
  body('amount').isFloat({ min: 0.01 }).withMessage('Payment amount must be greater than 0'),
  body('payment_mode').optional().isIn(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'OTHER']),
], validate, paymentCtrl.create);
router.post('/', [
  body('customer_id').isInt({ min: 1 }).withMessage('Valid customer_id is required'),
  body('village_id').isInt({ min: 1 }).withMessage('Valid village_id is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.flower_id').isInt({ min: 1 }).withMessage('Valid flower_id required for each item'),
  body('items.*.weight_kg').isFloat({ min: 0.001 }).withMessage('Weight must be greater than 0'),
], validate, ctrl.create);
router.put('/:id', requireRole('admin'), ctrl.update);
router.delete('/:id', requireRole('admin'), ctrl.remove);

module.exports = router;
