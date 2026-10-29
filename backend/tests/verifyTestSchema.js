'use strict';

const fs = require('fs');
const path = require('path');

const { assertSafeTestDatabase } = require('./testDbSafety');
const db = require('../src/db/knex');

async function main() {
  assertSafeTestDatabase();

  try {
    const hasMigrationsTable = await db.schema.hasTable('knex_migrations');
    if (!hasMigrationsTable) {
      throw new Error('knex_migrations table is missing; migrations were not applied');
    }

    const hasFinancialLedger = await db.schema.hasTable('financial_ledger');
    if (!hasFinancialLedger) {
      throw new Error('financial_ledger table is missing after migration');
    }

    const migration = await db('knex_migrations')
      .where({ name: '001_initial_schema.js' })
      .first();

    if (!migration) {
      throw new Error('Migration 001_initial_schema.js is not recorded as applied');
    }

    // Every .js file in the migrations directory is treated as a migration.
    const migrationDirectory = path.join(__dirname, '..', 'src', 'db', 'migrations');
    const migrationFiles = fs
      .readdirSync(migrationDirectory)
      .filter((name) => name.endsWith('.js'))
      .sort();

    const recordedRows = await db('knex_migrations').select('name');
    const recordedNames = new Set(recordedRows.map((row) => row.name));
    const unrecorded = migrationFiles.filter((name) => !recordedNames.has(name));

    if (unrecorded.length > 0) {
      throw new Error(`Migrations not recorded as applied: ${unrecorded.join(', ')}`);
    }

    console.log(
      `[verifyTestSchema] verified gobingo_test: financial_ledger exists and ${migrationFiles.length} migrations are recorded`
    );
  } finally {
    await db.destroy();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`[verifyTestSchema] ${error.message}`);
    process.exit(1);
  });