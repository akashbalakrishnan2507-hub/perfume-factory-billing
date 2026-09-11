'use strict';
const svc = require('./villages.service');
const list = async (req, res, next) => { try { const r = await svc.listVillages(req.query); res.json({ success: true, ...r }); } catch (e) { next(e); } };
const getById = async (req, res, next) => { try { res.json({ success: true, data: await svc.getVillageById(req.params.id) }); } catch (e) { next(e); } };
const create = async (req, res, next) => { try { res.status(201).json({ success: true, data: await svc.createVillage(req.body) }); } catch (e) { next(e); } };
const update = async (req, res, next) => { try { res.json({ success: true, data: await svc.updateVillage(req.params.id, req.body) }); } catch (e) { next(e); } };
const remove = async (req, res, next) => { try { await svc.deleteVillage(req.params.id); res.json({ success: true, data: { message: 'Village deleted' } }); } catch (e) { next(e); } };
module.exports = { list, getById, create, update, remove };
