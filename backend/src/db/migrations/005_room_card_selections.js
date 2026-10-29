exports.up = async function (knex) {
  const addColumnIfMissing = async (table, column, callback) => {
    const exists = await knex.schema.hasColumn(table, column);
    if (!exists) {
      await knex.schema.alterTable(table, callback);
    }
  };

  await addColumnIfMissing('game_rooms', 'registration_ends_at', (t) => {
    t.timestamp('registration_ends_at').nullable();
  });
  await addColumnIfMissing('game_rooms', 'winning_card_id', (t) => {
    t.integer('winning_card_id').nullable();
  });

  const hasSelections = await knex.schema.hasTable('room_card_selections');
  if (!hasSelections) {
    await knex.schema.createTable('room_card_selections', (t) => {
      t.bigIncrements('id').primary();
      t.uuid('room_id').notNullable().references('id').inTable('game_rooms').onDelete('CASCADE');
      t.integer('card_id').notNullable();
      t.bigInteger('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.jsonb('card').notNullable();
      t.string('status').notNullable().defaultTo('reserved');
      t.timestamp('reserved_at').defaultTo(knex.fn.now());
      t.timestamp('released_at').nullable();
      t.unique(['room_id', 'card_id']);
      t.index(['room_id', 'user_id']);
    });
  }
};

exports.down = async function (knex) {
  if (await knex.schema.hasTable('room_card_selections')) {
    await knex.schema.dropTable('room_card_selections');
  }
  for (const column of ['winning_card_id', 'registration_ends_at']) {
    if (await knex.schema.hasColumn('game_rooms', column)) {
      await knex.schema.alterTable('game_rooms', (t) => {
        t.dropColumn(column);
      });
    }
  }
};
