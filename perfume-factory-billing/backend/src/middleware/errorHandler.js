'use strict';

/**
 * Global error handler. Must be the last middleware registered.
 * Converts all errors into a consistent JSON shape.
 * Never leaks stack traces to the client.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  // Log full error server-side
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);

  // Operational errors
  if (err.isOperational) {
    return res.status(err.statusCode || 400).json({
      success: false,
      error: {
        code: err.code || 'ERROR',
        message: err.message,
        field: err.field || null,
      },
    });
  }

  // MySQL duplicate entry
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_ENTRY',
        message: 'A record with this value already exists',
        field: null,
      },
    });
  }

  // MySQL foreign key constraint
  if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(409).json({
      success: false,
      error: {
        code: 'CONSTRAINT_VIOLATION',
        message: 'Operation violates a database constraint',
        field: null,
      },
    });
  }

  // JWT errors caught before here but just in case
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid token' },
    });
  }

  // Fallback - unknown/unexpected
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again.',
    },
  });
}

/**
 * Factory for operational errors.
 */
function createError(message, statusCode = 400, code = 'ERROR', field = null) {
  const err = new Error(message);
  err.isOperational = true;
  err.statusCode = statusCode;
  err.code = code;
  err.field = field;
  return err;
}

module.exports = { errorHandler, createError };
