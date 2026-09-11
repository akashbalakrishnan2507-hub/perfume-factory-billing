'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../../config/db');
const env = require('../../config/env');

/**
 * Authenticate user and return JWT token.
 */
async function login(email, password) {
  const trimmedEmail = (email || '').trim().toLowerCase();
  const emailCandidate = trimmedEmail.includes('@')
    ? trimmedEmail
    : `${trimmedEmail}@perfumefactory.com`;

  const [rows] = await query(
    "SELECT id, email, name, role, permissions, password_hash, status FROM users WHERE (email = ? OR email = ?) AND deleted_at IS NULL",
    [trimmedEmail, emailCandidate]
  );

  if (rows.length === 0) {
    const err = new Error('Invalid email or password');
    err.isOperational = true;
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const user = rows[0];

  if (user.status !== 'active') {
    const err = new Error('Your account has been deactivated. Please contact admin.');
    err.isOperational = true;
    err.statusCode = 403;
    err.code = 'ACCOUNT_INACTIVE';
    throw err;
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    const err = new Error('Invalid email or password');
    err.isOperational = true;
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  // Parse permissions JSON (stored as JSON string in DB)
  let permissions = [];
  try {
    permissions = typeof user.permissions === 'string'
      ? JSON.parse(user.permissions)
      : (user.permissions || []);
  } catch {
    permissions = [];
  }

  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    permissions,
  };

  const token = jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions,
    },
  };
}

/**
 * Get current user profile.
 */
async function getProfile(userId) {
  const [rows] = await query(
    "SELECT id, email, name, role, permissions, status, created_at FROM users WHERE id = ? AND deleted_at IS NULL",
    [userId]
  );
  if (rows.length === 0) {
    const err = new Error('User not found');
    err.isOperational = true;
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }
  const u = rows[0];
  let permissions = [];
  try {
    permissions = typeof u.permissions === 'string' ? JSON.parse(u.permissions) : (u.permissions || []);
  } catch { permissions = []; }
  return { ...u, permissions };
}

module.exports = { login, getProfile };
