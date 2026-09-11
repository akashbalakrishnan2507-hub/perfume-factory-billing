'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const ctrl = require('./auth.controller');

const router = Router();

// POST /api/v1/auth/login
router.post(
  '/login',
  [
    body('email').notEmpty().withMessage('Email or username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  ctrl.login
);

// POST /api/v1/auth/logout
router.post('/logout', authenticate, ctrl.logout);

// GET /api/v1/auth/profile
router.get('/profile', authenticate, ctrl.getProfile);

module.exports = router;
