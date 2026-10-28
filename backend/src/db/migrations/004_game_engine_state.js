exports.up = async function (knex) {
  const addColumnIfMissing = async (table, column, callback) => {
    const exists = await knex.schema.hasColumn(table, column);
    if (!exists) {
      await knex.schema.alterTable(table, callback);
    }
  };

  await addColumnIfMissing('game_rooms', 'draw_pool', (t) => {
    t.jsonb('draw_pool').nullable();
  });
  await addColumnIfMissing('game_rooms', 'draw_index', (t) => {
    t.integer('draw_index').notNullable().defaultTo(0);
  });
  await addColumnIfMissing('game_rooms', 'latest_number', (t) => {
    t.integer('latest_number').nullable();
  });
  await addColumnIfMissing('game_rooms', 'last_drawn_at', (t) => {
    t.timestamp('last_drawn_at').nullable();
  });
  await addColumnIfMissing('game_rooms', 'winning_patterns', (t) => {
    t.jsonb('winning_patterns').nullable();
  });
  await addColumnIfMissing('game_rooms', 'winning_pattern', (t) => {
    t.string('winning_pattern').nullable();
  });
  await addColumnIfMissing('game_rooms', 'claim_user_id', (t) => {
    t.bigInteger('claim_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
  });
  await addColumnIfMissing('game_rooms', 'claim_closing_number', (t) => {
    t.integer('claim_closing_number').nullable();
  });
  await addColumnIfMissing('game_rooms', 'claimed_at', (t) => {
    t.timestamp('claimed_at').nullable();
  });
  await addColumnIfMissing('game_rooms', 'settled_at', (t) => {
    t.timestamp('settled_at').nullable();
  });
  await addColumnIfMissing('game_rooms', 'settlement_reference', (t) => {
    t.string('settlement_reference').nullable();
  });
};

exports.down = async function (knex) {
  const dropColumnIfPresent = async (column) => {
    if (await knex.schema.hasColumn('game_rooms', column)) {
      await knex.schema.alterTable('game_rooms', (t) => {
        t.dropColumn(column);
      });
    }
  };

  await dropColumnIfPresent('settlement_reference');
  await dropColumnIfPresent('settled_at');
  await dropColumnIfPresent('claimed_at');
  await dropColumnIfPresent('claim_closing_number');
  await dropColumnIfPresent('claim_user_id');
  await dropColumnIfPresent('winning_pattern');
  await dropColumnIfPresent('winning_patterns');
  await dropColumnIfPresent('last_drawn_at');
  await dropColumnIfPresent('latest_number');
  await dropColumnIfPresent('draw_index');
  await dropColumnIfPresent('draw_pool');
};
