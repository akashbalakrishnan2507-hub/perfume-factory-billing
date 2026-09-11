'use strict';
const svc = require('./payments.service');

const create = async (req, res, next) => {
  try {
    const payment = await svc.createPayment(req.params.id, req.body, req.user.id);
    res.status(201).json({ success: true, data: payment });
  } catch (e) { next(e); }
};

const list = async (req, res, next) => {
  try {
    const payments = await svc.getPaymentsByCollection(req.params.id);
    res.json({ success: true, data: payments });
  } catch (e) { next(e); }
};

module.exports = { create, list };
