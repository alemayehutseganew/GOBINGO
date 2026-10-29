exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('game_rooms', 'card_pool');
  if (!hasColumn) {
    await knex.schema.alterTable('game_rooms', (t) => {
      t.jsonb('card_pool').nullable();
    });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('game_rooms', 'card_pool');
  if (hasColumn) {
    await knex.schema.alterTable('game_rooms', (t) => {
      t.dropColumn('card_pool');
    });
  }
};
