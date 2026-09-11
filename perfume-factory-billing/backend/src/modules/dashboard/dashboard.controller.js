'use strict';
const svc = require('./dashboard.service');
const summary = async (req, res, next) => { try { res.json({ success: true, data: await svc.getSummary() }); } catch (e) { next(e); } };
const charts = async (req, res, next) => { try { res.json({ success: true, data: await svc.getCharts() }); } catch (e) { next(e); } };
module.exports = { summary, charts };
