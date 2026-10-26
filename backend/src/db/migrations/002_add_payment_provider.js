exports.up = async function (knex) {
  const hasProvider = await knex.schema.hasColumn('deposits', 'provider');
  if (!hasProvider) {
    await knex.schema.alterTable('deposits', (t) => {
      t.string('provider').defaultTo('telebirr');
    });
  }
};

exports.down = async function (knex) {
  if (await knex.schema.hasColumn('deposits', 'provider')) {
    await knex.schema.alterTable('deposits', (t) => {
      t.dropColumn('provider');
    });
  }
};
