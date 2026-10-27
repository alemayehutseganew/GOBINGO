const { assertSafeTestDatabase } = require('./testDbSafety');
const { ensurePostgres } = require('../../scripts/ensurePostgres');

module.exports = async () => {
  assertSafeTestDatabase();
  await ensurePostgres();
};
