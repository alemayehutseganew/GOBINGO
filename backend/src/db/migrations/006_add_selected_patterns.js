exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('room_participants', 'selected_patterns');
  if (!hasColumn) {
    await knex.schema.alterTable('room_participants', (t) => {
      t.jsonb('selected_patterns').notNullable().defaultTo('[]');
    });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('room_participants', 'selected_patterns');
  if (hasColumn) {
    await knex.schema.alterTable('room_participants', (t) => {
      t.dropColumn('selected_patterns');
    });
  }
};