const { ensurePostgres } = require('../../scripts/ensurePostgres');

module.exports = async () => {
  await ensurePostgres();
};