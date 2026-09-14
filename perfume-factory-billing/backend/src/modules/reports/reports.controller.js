'use strict';

const svc = require('./reports.service');
const { AsyncParser } = require('@json2csv/node');

async function streamCSV(res, data, filename) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  const parser = new AsyncParser();
  const csv = await parser.parse(data || []).promise();
  res.send(csv);
}

const daily = async (req, res, next) => {
  try {
    const data = await svc.getDailyReport(req.query.date);
    if (req.path.includes('export')) return streamCSV(res, data.collections, `daily-report-${data.date}`);
    res.json({ success: true, data });
  } catch (e) { next(e); }
};

const weekly = async (req, res, next) => {
  try {
    const data = await svc.getWeeklyReport(req.query.from, req.query.to);
    if (req.path.includes('export')) return streamCSV(res, data.daily, `weekly-report-${data.from}-to-${data.to}`);
    res.json({ success: true, data });
  } catch (e) { next(e); }
};

const monthly = async (req, res, next) => {
  try {
    const data = await svc.getMonthlyReport(req.query.month, req.query.year);
    if (req.path.includes('export')) return streamCSV(res, data.daily, `monthly-report-${data.year}-${data.month}`);
    res.json({ success: true, data });
  } catch (e) { next(e); }
};

const farmer = async (req, res, next) => {
  try {
    const data = await svc.getFarmerReport(req.query);
    if (req.path.includes('export')) return streamCSV(res, data.data, `farmer-report-${data.from}-to-${data.to}`);
    res.json({ success: true, data });
  } catch (e) { next(e); }
};

const village = async (req, res, next) => {
  try {
    const data = await svc.getVillageReport(req.query);
    if (req.path.includes('export')) return streamCSV(res, data.data, `village-report`);
    res.json({ success: true, data });
  } catch (e) { next(e); }
};

const flower = async (req, res, next) => {
  try {
    const data = await svc.getFlowerReport(req.query);
    if (req.path.includes('export')) return streamCSV(res, data.data, `flower-report`);
    res.json({ success: true, data });
  } catch (e) { next(e); }
};

const payments = async (req, res, next) => {
  try {
    const data = await svc.getPaymentsReport(req.query);
    if (req.path.includes('export')) return streamCSV(res, data.data, `payments-report`);
    res.json({ success: true, data });
  } catch (e) { next(e); }
};

module.exports = { daily, weekly, monthly, farmer, village, flower, payments };
