const crypto = require('crypto');

// Telebirr Fabric API helpers (skeleton). Real endpoints require merchant credentials.
const BASE = process.env.TELEBIRR_BASE_URL || 'https://api.telebirr.com';

async function applyFabricToken() {
  // POST /payment/v1/token/grant
  const res = await fetch(`${BASE}/payment/v1/token/grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appSecret: process.env.TELEBIRR_APP_KEY,
    }),
  });
  if (!res.ok) throw new Error('Telebirr token grant failed');
  const data = await res.json();
  return data.token;
}

async function createOrder({ amount, merchantOrderId, notifyUrl, returnUrl }) {
  const token = await applyFabricToken();
  const res = await fetch(`${BASE}/payment/v1/merchant/preOrder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      appId: process.env.TELEBIRR_APP_ID,
      shortCode: process.env.TELEBIRR_SHORT_CODE,
      amount: String(amount),
      merchantOrderId,
      notifyUrl: notifyUrl || process.env.TELEBIRR_NOTIFY_URL,
      returnUrl,
      subject: 'GOBINGO Wallet Deposit',
    }),
  });
  if (!res.ok) throw new Error('Telebirr preOrder failed');
  return res.json();
}

function verifyWebhookSignature(payload, signature) {
  const env = process.env.TELEBIRR_ENV || 'sandbox';
  if (env !== 'production') return true;
  const secret = process.env.TELEBIRR_WEBHOOK_SECRET || process.env.TELEBIRR_APP_KEY;
  if (!secret || !signature) return false;
  // Canonical format is provider-specific and must be confirmed against official docs.
  // Until verified, reject production callbacks rather than accepting unverified input.
  return false;
}

module.exports = { applyFabricToken, createOrder, verifyWebhookSignature };
