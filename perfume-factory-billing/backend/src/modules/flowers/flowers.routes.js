'use strict';
const { Router } = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { requireRole, requirePermission } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const ctrl = require('./flowers.controller');

const router = Router();
router.use(authenticate);

router.get('/', ctrl.list);
router.get('/active-rates', ctrl.getActiveRates);
router.get('/:id', ctrl.getById);
router.get('/:id/rates', ctrl.getRates);
router.post('/', requireRole('admin'), [body('name').notEmpty().trim()], validate, ctrl.create);
router.put('/:id', requireRole('admin'), ctrl.update);
router.post('/:id/rates', requirePermission('can_edit_rates'), [
  body('rate_per_kg').isFloat({ min: 0.01 }).withMessage('Rate per kg must be greater than 0'),
], validate, ctrl.setRate);
router.put('/:id/rates/:rateId', requirePermission('can_edit_rates'), ctrl.updateRate);

module.exports = router;
