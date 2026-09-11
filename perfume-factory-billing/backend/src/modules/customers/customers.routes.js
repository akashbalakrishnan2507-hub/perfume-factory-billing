'use strict';
const { Router } = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const ctrl = require('./customers.controller');

const router = Router();
router.use(authenticate);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.get('/:id/history', ctrl.history);
router.post('/', [
  body('name').notEmpty().trim(),
  body('mobile').notEmpty().isMobilePhone(),
  body('village_id').isInt({ min: 1 }),
], validate, ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', requireRole('admin'), ctrl.remove);

module.exports = router;
