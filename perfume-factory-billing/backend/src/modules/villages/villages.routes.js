'use strict';
const { Router } = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const ctrl = require('./villages.controller');

const router = Router();
router.use(authenticate);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.post('/', requireRole('admin'), [
  body('name').notEmpty().trim(),
  body('district').notEmpty().trim(),
], validate, ctrl.create);
router.put('/:id', requireRole('admin'), ctrl.update);
router.delete('/:id', requireRole('admin'), ctrl.remove);

module.exports = router;
