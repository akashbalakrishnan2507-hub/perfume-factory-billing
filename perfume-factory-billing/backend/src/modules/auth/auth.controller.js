'use strict';

const authService = require('./auth.service');
const { blacklistToken } = require('../../middleware/auth');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res) {
  // Blacklist the token so it cannot be reused
  if (req.token) blacklistToken(req.token);
  res.json({ success: true, data: { message: 'Logged out successfully' } });
}

async function getProfile(req, res, next) {
  try {
    const profile = await authService.getProfile(req.user.id);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, logout, getProfile };
