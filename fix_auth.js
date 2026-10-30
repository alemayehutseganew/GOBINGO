const fs = require('fs');
const p = 'backend/src/routes/auth.js';
let t = fs.readFileSync(p, 'utf8');
const old = `const user = JSON.parse(urlParams.get('user'));


    res.json({
      success: true,
      user: user,
      token: 'mock-jwt-token-' + user.id
    });`;
const newText = `const user = JSON.parse(urlParams.get('user'));


    let dbUser = await db('users').where({ telegram_id: user.id }).first();

    if (!dbUser) {
      const [newUser] = await db('users').insert({
        telegram_id: user.id,
        username: user.username || null,
        first_name: user.first_name || 'Player',
        wallet_balance: 0,
        demo_wallet_balance: 100,
      }).returning('*');
      dbUser = newUser;
      console.log('[auth] Auto-registered new user: ' + dbUser.id + ' (Telegram: ' + dbUser.telegram_id + ')');
    } else {
      console.log('[auth] Found existing user: ' + dbUser.id + ' (Telegram: ' + dbUser.telegram_id + ')');
    }

    res.json({
      success: true,
      user: dbUser,
      token: 'mock-jwt-token-' + dbUser.id
    });`;
if (t.includes(old)) {
  t = t.replace(old, newText);
  fs.writeFileSync(p, t);
  console.log('done');
} else {
  console.log('OLD TEXT NOT FOUND');
}