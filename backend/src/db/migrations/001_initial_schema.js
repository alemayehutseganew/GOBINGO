exports.up = async function (knex) {
  await knex.schema.createTable('users', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('telegram_id').unique().notNullable();
    t.string('telegram_username').nullable();
    t.string('first_name').nullable();
    t.string('last_name').nullable();
    t.string('agent_username').nullable(); // referrer agent telegram username
    t.decimal('wallet_balance', 14, 2).defaultTo(0);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('agents', (t) => {
    t.increments('id').primary();
    t.bigInteger('user_id').references('id').inTable('users').onDelete('CASCADE');
    t.string('telegram_username').unique().notNullable();
    t.decimal('commission_balance', 14, 2).defaultTo(0);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('game_rooms', (t) => {
    t.uuid('id').primary();
    t.integer('level').notNullable(); // 1,2,3
    t.decimal('entry_fee', 14, 2).notNullable();
    t.string('status').defaultTo('WAITING'); // WAITING, RUNNING, FINISHED, CANCELLED
    t.bigInteger('winner_id').nullable().references('id').inTable('users');
    t.decimal('total_pool', 14, 2).nullable();
    t.jsonb('drawn_numbers').defaultTo('[]');
    t.timestamp('started_at').nullable();
    t.timestamp('finished_at').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('room_participants', (t) => {
    t.increments('id').primary();
    t.uuid('room_id').references('id').inTable('game_rooms').onDelete('CASCADE');
    t.bigInteger('user_id').references('id').inTable('users').onDelete('CASCADE');
    t.jsonb('card').notNullable(); // 5x5 grid
    t.jsonb('daubed').defaultTo('[]'); // list of daubed numbers
    t.boolean('is_winner').defaultTo(false);
    t.timestamp('joined_at').defaultTo(knex.fn.now());
    t.unique(['room_id', 'user_id']);
  });

  await knex.schema.createTable('financial_ledger', (t) => {
    t.increments('id').primary();
    t.bigInteger('user_id').nullable().references('id').inTable('users');
    t.decimal('amount', 14, 2).notNullable();
    t.string('type').notNullable(); // DEPOSIT, ENTRY_FEE, WINNING_PAYOUT, AGENT_COMMISSION, WITHDRAWAL
    t.string('reference_id').nullable();
    t.jsonb('metadata').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('deposits', (t) => {
    t.increments('id').primary();
    t.bigInteger('user_id').references('id').inTable('users').onDelete('CASCADE');
    t.decimal('amount', 14, 2).notNullable();
    t.string('status').defaultTo('PENDING'); // PENDING, COMPLETED, FAILED
    t.string('telebirr_txn_id').nullable();
    t.string('merchant_order_id').nullable().unique();
    t.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('deposits');
  await knex.schema.dropTableIfExists('financial_ledger');
  await knex.schema.dropTableIfExists('room_participants');
  await knex.schema.dropTableIfExists('game_rooms');
  await knex.schema.dropTableIfExists('agents');
  await knex.schema.dropTableIfExists('users');
};
