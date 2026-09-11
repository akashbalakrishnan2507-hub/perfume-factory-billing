'use strict';

const { getCollectionById } = require('../collections/collections.service');
const { generateInvoicePDF } = require('../../utils/pdf');

async function generatePDF(req, res, next) {
  try {
    const collection = await getCollectionById(req.params.id);
    generateInvoicePDF(collection, res);
  } catch (e) {
    next(e);
  }
}

module.exports = { generatePDF };
