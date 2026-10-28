'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function assertSafeTestDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error('Unsafe test database: DATABASE_URL is required');
  }

  let url;
  try {
    url = new URL(databaseUrl.trim());
  } catch {
    throw new Error('Unsafe test database: DATABASE_URL is malformed');
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('Unsafe test database: DATABASE_URL must use postgres or postgresql');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
    throw new Error('Unsafe test database: database host must be localhost');
  }

  const databaseName = decodeURIComponent(
    (url.pathname || '').replace(/^\/+/, '').replace(/\/+$/, '')
  );

  if (databaseName !== 'gobingo' && databaseName !== 'gobingo_test') {
    throw new Error('Unsafe test database: database name must be gobingo or gobingo_test');
  }

  if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production') {
    throw new Error('Unsafe test database: NODE_ENV must not be production');
  }
}

if (require.main === module) {
  try {
    assertSafeTestDatabase();
    console.log('[testDbSafety] Test database configuration is safe');
    process.exit(0);
  } catch (error) {
    console.error(`[testDbSafety] ${error.message}`);
    process.exit(1);
  }
}

module.exports = { assertSafeTestDatabase };
