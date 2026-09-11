'use strict';
const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const ctrl = require('./reports.controller');

const router = Router();
router.use(authenticate);

router.get('/daily', ctrl.daily);
router.get('/daily/export.csv', ctrl.daily);
router.get('/monthly', ctrl.monthly);
router.get('/monthly/export.csv', ctrl.monthly);
router.get('/village', ctrl.village);
router.get('/village/export.csv', ctrl.village);
router.get('/flower', ctrl.flower);
router.get('/flower/export.csv', ctrl.flower);
router.get('/payments', ctrl.payments);
router.get('/payments/export.csv', ctrl.payments);

module.exports = router;
