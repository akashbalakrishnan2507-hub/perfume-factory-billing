'use strict';

const svc = require('./users.service');

const list = async (req, res, next) => {
  try {
    const result = await svc.listUsers(req.query);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const user = await svc.getUserById(req.params.id);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const user = await svc.createUser(req.body);
    res.status(201).json({ success: true, data: user });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const user = await svc.updateUser(req.params.id, req.body);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    await svc.deleteUser(req.params.id);
    res.json({ success: true, data: { message: 'User deleted' } });
  } catch (err) { next(err); }
};

module.exports = { list, getById, create, update, remove };
