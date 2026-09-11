'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const ctrl = require('./users.controller');

const router = Router();
router.use(authenticate, requireRole('admin'));

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.post('/', [
  body('email').isEmail().normalizeEmail(),
  body('name').notEmpty().trim(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['admin', 'staff']),
], validate, ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
