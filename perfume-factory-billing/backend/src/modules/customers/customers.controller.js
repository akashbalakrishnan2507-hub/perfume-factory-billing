'use strict';
const svc = require('./customers.service');
const list = async (req, res, next) => { try { res.json({ success: true, ...await svc.listCustomers(req.query) }); } catch (e) { next(e); } };
const getById = async (req, res, next) => { try { res.json({ success: true, data: await svc.getCustomerById(req.params.id) }); } catch (e) { next(e); } };
const create = async (req, res, next) => { try { res.status(201).json({ success: true, data: await svc.createCustomer(req.body) }); } catch (e) { next(e); } };
const update = async (req, res, next) => { try { res.json({ success: true, data: await svc.updateCustomer(req.params.id, req.body) }); } catch (e) { next(e); } };
const remove = async (req, res, next) => { try { await svc.deleteCustomer(req.params.id); res.json({ success: true, data: { message: 'Customer deleted' } }); } catch (e) { next(e); } };
const history = async (req, res, next) => { try { res.json({ success: true, ...await svc.getCustomerHistory(req.params.id, req.query) }); } catch (e) { next(e); } };
module.exports = { list, getById, create, update, remove, history };
