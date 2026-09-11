'use strict';

const { validationResult } = require('express-validator');

/**
 * Middleware: collects express-validator errors and returns standard error shape.
 * Place after your validation chain: router.post('/', [...validators], validate, controller)
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const first = errors.array()[0];
  return res.status(400).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: first.msg,
      field: first.path || first.param || null,
      details: errors.array().map((e) => ({ field: e.path || e.param, message: e.msg })),
    },
  });
}

module.exports = { validate };
