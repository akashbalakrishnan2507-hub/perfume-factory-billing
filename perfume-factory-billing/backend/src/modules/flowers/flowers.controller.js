'use strict';
const svc = require('./flowers.service');
const { rupeesToPaise } = require('../../utils/money');

const list = async (req, res, next) => { try { res.json({ success: true, ...await svc.listFlowers(req.query) }); } catch (e) { next(e); } };
const getById = async (req, res, next) => { try { res.json({ success: true, data: await svc.getFlowerById(req.params.id) }); } catch (e) { next(e); } };
const create = async (req, res, next) => { try { res.status(201).json({ success: true, data: await svc.createFlower(req.body) }); } catch (e) { next(e); } };
const update = async (req, res, next) => { try { res.json({ success: true, data: await svc.updateFlower(req.params.id, req.body) }); } catch (e) { next(e); } };
const getRates = async (req, res, next) => { try { res.json({ success: true, data: await svc.getFlowerRates(req.params.id) }); } catch (e) { next(e); } };
const setRate = async (req, res, next) => {
  try {
    const paise = rupeesToPaise(req.body.rate_per_kg);
    if (paise <= 0) { return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Rate must be greater than 0', field: 'rate_per_kg' } }); }
    const rate = await svc.setFlowerRate(req.params.id, paise, req.user.id);
    res.status(201).json({ success: true, data: rate });
  } catch (e) { next(e); }
};
module.exports = { list, getById, create, update, getRates, setRate };
