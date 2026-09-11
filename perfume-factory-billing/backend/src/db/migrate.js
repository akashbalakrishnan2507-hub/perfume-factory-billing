'use strict';

/**
 * Database migration runner.
 * Reads all SQL files from migrations/ in numerical order and executes them.
 * Uses a migrations_log table to track which have been applied.
 */

const path = require('path');
const fs = require('fs');

// Load env first
require('../config/env');

const mysql = require('mysql2/promise');
const env = require('../config/env');

async function runMigrations() {
  console.log('[migrate] Starting database migrations...');

  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  });

  try {
    // Create database if it doesn't exist
    await conn.execute(
      `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conn.execute(`USE \`${env.db.database}\``);
    console.log(`[migrate] Using database: ${env.db.database}`);

    // Create migrations log table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS migrations_log (
        id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        filename     VARCHAR(255) NOT NULL UNIQUE,
        applied_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Get already-applied migrations
    const [applied] = await conn.execute('SELECT filename FROM migrations_log');
    const appliedSet = new Set(applied.map((r) => r.filename));

    // Read migration files in order
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[migrate] ⏭  Skipping (already applied): ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`[migrate] ▶  Applying: ${file}`);

      // Execute the SQL (may contain multiple statements)
      await conn.query(sql);

      // Record as applied
      await conn.execute('INSERT INTO migrations_log (filename) VALUES (?)', [file]);
      console.log(`[migrate] ✅  Applied: ${file}`);
    }

    console.log('[migrate] ✅ All migrations complete!');
  } catch (err) {
    console.error('[migrate] ❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

runMigrations();
