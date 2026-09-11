'use strict';
const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const ctrl = require('./dashboard.controller');
const router = Router();
router.use(authenticate);
router.get('/summary', ctrl.summary);
router.get('/charts', ctrl.charts);
module.exports = router;
