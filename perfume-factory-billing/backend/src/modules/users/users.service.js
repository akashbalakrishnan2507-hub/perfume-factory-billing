'use strict';

const { query } = require('../../config/db');
const bcrypt = require('bcrypt');
const env = require('../../config/env');

function buildPagination(pageStr, pageSizeStr) {
  const page = Math.max(1, parseInt(pageStr, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr, 10) || 20));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

async function listUsers({ page, pageSize, search, role, status }) {
  const { page: p, pageSize: ps, offset } = buildPagination(page, pageSize);

  let whereClause = 'WHERE deleted_at IS NULL';
  const params = [];
  if (search) { whereClause += ' AND (name LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (role) { whereClause += ' AND role = ?'; params.push(role); }
  if (status) { whereClause += ' AND status = ?'; params.push(status); }

  const [countRows] = await query(`SELECT COUNT(*) AS total FROM users ${whereClause}`, params);
  const total = countRows[0].total;

  const [rows] = await query(
    `SELECT id, email, name, role, permissions, status, created_at FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, ps, offset]
  );

  const users = rows.map((u) => ({
    ...u,
    permissions: typeof u.permissions === 'string' ? JSON.parse(u.permissions) : (u.permissions || []),
  }));

  return { users, meta: { page: p, pageSize: ps, total } };
}

async function getUserById(id) {
  const [rows] = await query(
    'SELECT id, email, name, role, permissions, status, created_at FROM users WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  if (rows.length === 0) {
    const err = new Error('User not found'); err.isOperational = true; err.statusCode = 404; err.code = 'NOT_FOUND'; throw err;
  }
  const u = rows[0];
  return { ...u, permissions: typeof u.permissions === 'string' ? JSON.parse(u.permissions) : (u.permissions || []) };
}

async function createUser({ email, name, password, role, permissions = [] }) {
  const [existing] = await query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    const err = new Error('A user with this email already exists'); err.isOperational = true; err.statusCode = 409; err.code = 'DUPLICATE_EMAIL'; err.field = 'email'; throw err;
  }
  const hash = await bcrypt.hash(password, env.bcryptSaltRounds);
  const [result] = await query(
    'INSERT INTO users (email, name, password_hash, role, permissions) VALUES (?, ?, ?, ?, ?)',
    [email, name, hash, role || 'staff', JSON.stringify(permissions)]
  );
  return getUserById(result.insertId);
}

async function updateUser(id, { name, role, permissions, status }) {
  const user = await getUserById(id);
  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (role !== undefined) { updates.push('role = ?'); params.push(role); }
  if (permissions !== undefined) { updates.push('permissions = ?'); params.push(JSON.stringify(permissions)); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }

  if (updates.length === 0) return user;
  params.push(id);
  await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
  return getUserById(id);
}

async function deleteUser(id) {
  await getUserById(id);
  await query('UPDATE users SET deleted_at = NOW() WHERE id = ?', [id]);
}

module.exports = { listUsers, getUserById, createUser, updateUser, deleteUser };
