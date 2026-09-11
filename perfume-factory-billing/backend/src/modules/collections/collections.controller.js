'use strict';
const svc = require('./collections.service');

const list = async (req, res, next) => { try { res.json({ success: true, ...await svc.listCollections(req.query) }); } catch (e) { next(e); } };
const getById = async (req, res, next) => { try { res.json({ success: true, data: await svc.getCollectionById(req.params.id) }); } catch (e) { next(e); } };
const create = async (req, res, next) => { try { res.status(201).json({ success: true, data: await svc.createCollection(req.body, req.user.id) }); } catch (e) { next(e); } };
const update = async (req, res, next) => { try { res.json({ success: true, data: await svc.updateCollection(req.params.id, req.body, req.user.id) }); } catch (e) { next(e); } };
const remove = async (req, res, next) => { try { await svc.deleteCollection(req.params.id); res.json({ success: true, data: { message: 'Collection deleted' } }); } catch (e) { next(e); } };

module.exports = { list, getById, create, update, remove };
