'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { errorHandler } = require('./middleware/errorHandler');

// Route modules
const authRoutes        = require('./modules/auth/auth.routes');
const usersRoutes       = require('./modules/users/users.routes');
const villagesRoutes    = require('./modules/villages/villages.routes');
const customersRoutes   = require('./modules/customers/customers.routes');
const flowersRoutes     = require('./modules/flowers/flowers.routes');
const collectionsRoutes = require('./modules/collections/collections.routes');
const reportsRoutes     = require('./modules/reports/reports.routes');
const dashboardRoutes   = require('./modules/dashboard/dashboard.routes');

const app = express();

// ── Security & Logging ─────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin: true, // Allow all origins for seamless development and local access
  credentials: true,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Body Parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Health Check ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'Perfume Factory Billing API' });
});

// ── API Routes ────────────────────────────────────────────────────────────
const API_PREFIX = '/api/v1';

app.use(`${API_PREFIX}/auth`,        authRoutes);
app.use(`${API_PREFIX}/users`,       usersRoutes);
app.use(`${API_PREFIX}/villages`,    villagesRoutes);
app.use(`${API_PREFIX}/customers`,   customersRoutes);
app.use(`${API_PREFIX}/flowers`,     flowersRoutes);
app.use(`${API_PREFIX}/collections`, collectionsRoutes);
app.use(`${API_PREFIX}/reports`,     reportsRoutes);
app.use(`${API_PREFIX}/dashboard`,   dashboardRoutes);

// ── Serve Frontend Static Files ───────────────────────────────────────────
const frontendPublicDir = path.resolve(__dirname, '../../frontend/public');
if (fs.existsSync(frontendPublicDir)) {
  app.use(express.static(frontendPublicDir));
  // Fallback for SPA navigation
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(frontendPublicDir, 'index.html'));
  });
}

// ── 404 Handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.originalUrl}` },
  });
});

// ── Global Error Handler ──────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
