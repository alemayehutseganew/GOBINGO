exports.up = async function (knex) {
  const addColumnIfMissing = async (table, column, callback) => {
    const exists = await knex.schema.hasColumn(table, column);
    if (!exists) {
      await knex.schema.alterTable(table, callback);
    }
  };

  await addColumnIfMissing('users', 'demo_wallet_balance', (t) => {
    t.decimal('demo_wallet_balance', 14, 2).notNullable().defaultTo(0);
  });
  await addColumnIfMissing('users', 'demo_initial_credit_granted', (t) => {
    t.boolean('demo_initial_credit_granted').notNullable().defaultTo(false);
  });

  await addColumnIfMissing('game_rooms', 'is_demo', (t) => {
    t.boolean('is_demo').notNullable().defaultTo(false);
  });

  await addColumnIfMissing('financial_ledger', 'is_demo', (t) => {
    t.boolean('is_demo').notNullable().defaultTo(false);
  });

  await addColumnIfMissing('agents', 'demo_commission_balance', (t) => {
    t.decimal('demo_commission_balance', 14, 2).notNullable().defaultTo(0);
  });
};

exports.down = async function (knex) {
  const dropColumnIfPresent = async (table, column) => {
    const exists = await knex.schema.hasColumn(table, column);
    if (exists) {
      await knex.schema.alterTable(table, (t) => {
        t.dropColumn(column);
      });
    }
  };

  await dropColumnIfPresent('agents', 'demo_commission_balance');
  await dropColumnIfPresent('financial_ledger', 'is_demo');
  await dropColumnIfPresent('game_rooms', 'is_demo');
  await dropColumnIfPresent('users', 'demo_initial_credit_granted');
  await dropColumnIfPresent('users', 'demo_wallet_balance');
};