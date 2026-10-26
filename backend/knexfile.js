require('dotenv').config();
module.exports = {
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gobingo',
  pool: { min: 2, max: 10 },
  migrations: { tableName: 'knex_migrations', directory: './src/db/migrations' },
  seeds: { directory: './src/db/seeds' }
};
