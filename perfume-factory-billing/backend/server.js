'use strict';

const http = require('http');
const env = require('./src/config/env');
const app = require('./src/app');
const { testConnection, initDb } = require('./src/config/db');
const { initSocket } = require('./src/socket');

const PORT = env.port;

async function start() {
  try {
    const dbType = await initDb();
    await testConnection();

    const server = http.createServer(app);
    initSocket(server);

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🌸 Perfume Factory Billing System is RUNNING (No Docker Required)`);
      console.log(`   ► Web Application: http://localhost:${PORT}`);
      console.log(`   ► API Endpoint:    http://localhost:${PORT}/api/v1`);
      console.log(`   ► Healthcheck:     http://localhost:${PORT}/health`);
      console.log(`   ► Real-time:       Socket.IO Active`);
      console.log(`   ► Database:        ${dbType.toUpperCase()}`);
      console.log(`\n🔐 Demo Accounts:`);
      console.log(`   Admin: admin / admin123  (or admin@perfumefactory.com)`);
      console.log(`   Staff: staff / staff123  (or staff@perfumefactory.com)\n`);
    });
  } catch (err) {
    console.error('[server] Failed to start:', err.message);
    process.exit(1);
  }
}

start();
