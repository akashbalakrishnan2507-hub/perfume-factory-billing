'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

// Simple in-memory blacklist for logged-out tokens (production: use Redis)
const tokenBlacklist = new Set();

function blacklistToken(token) {
  tokenBlacklist.add(token);
}

function isBlacklisted(token) {
  return tokenBlacklist.has(token);
}

/**
 * Middleware: verifies JWT, attaches req.user = { id, email, role, permissions }
 */
function authenticate(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'No token provided' },
      });
    }

    const token = authHeader.slice(7);

    if (isBlacklisted(token)) {
      return res.status(401).json({
        success: false,
        error: { code: 'TOKEN_REVOKED', message: 'Token has been revoked' },
      });
    }

    const payload = jwt.verify(token, env.jwt.secret);
    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      permissions: payload.permissions || [],
    };
    req.token = token;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Token has expired' },
      });
    }
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid token' },
    });
  }
}

module.exports = { authenticate, blacklistToken };
