'use strict';

require('dotenv').config();

const dbClient = (process.env.DB_CLIENT || 'auto').toLowerCase();

// If explicitly using mysql, ensure required MySQL variables are defined
if (dbClient === 'mysql') {
  const mysqlRequired = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missing = mysqlRequired.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[env] Missing required MySQL environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 4000,
  dbClient,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'perfume_app',
    password: process.env.DB_PASSWORD || 'change_me',
    database: process.env.DB_NAME || 'perfume_factory',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'perfume_factory_super_secret_jwt_key_change_in_production_2024',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10,
};
