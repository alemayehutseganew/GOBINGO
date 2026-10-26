const db = require('../src/db/knex');

async function cleanDb() {
  await db('financial_ledger').del();
  await db('room_participants').del();
  await db('game_rooms').del();
  await db('deposits').del();
  await db('agents').del();
  await db('users').del();
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