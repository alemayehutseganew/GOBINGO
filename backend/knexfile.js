require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gobingo';
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
