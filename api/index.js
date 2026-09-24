'use strict';

// Set VERCEL flag
process.env.VERCEL = '1';

const app = require('../perfume-factory-billing/backend/src/app');

module.exports = app;
