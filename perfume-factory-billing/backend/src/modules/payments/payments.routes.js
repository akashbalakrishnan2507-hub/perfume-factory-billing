'use strict';
const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const ctrl = require('./payments.controller');

// These routes are mounted at /api/v1/collections/:id/payments via collections.routes.js
// This file is standalone for direct mounting if needed
const router = Router({ mergeParams: true });
router.use(authenticate);
router.get('/', ctrl.list);
router.post('/', ctrl.create);

module.exports = router;
