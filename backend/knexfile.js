require('dotenv').config();

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}
const useSsl = process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production';

module.exports = {
  client: 'pg',
  connection: useSsl
    ? {
        connectionString: databaseUrl,
        ssl: {
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true',
        },
      }
    : databaseUrl,
  pool: { min: 2, max: 10 },
  migrations: { tableName: 'knex_migrations', directory: './src/db/migrations' },
  seeds: { directory: './src/db/seeds' },
};
