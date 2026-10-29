const { assertSafeTestDatabase } = require('./testDbSafety');

assertSafeTestDatabase();

const db = require('../src/db/knex');

async function cleanDb() {
  assertSafeTestDatabase();
  const tables = ['financial_ledger', 'room_participants', 'game_rooms', 'deposits', 'agents', 'users'];
  for (const table of tables) {
    const exists = await db.schema.hasTable(table);
    if (exists) {
      await db(table).del();
    }
  }
}

async function createDevUser(tgId = 999001, balance = 100) {
  const [u] = await db('users').insert({
    telegram_id: tgId,
    first_name: 'Dev',
    telegram_username: 'devuser',
    wallet_balance: balance,
  }).returning('*');
  return u;
}

module.exports = { db, cleanDb, createDevUser };
