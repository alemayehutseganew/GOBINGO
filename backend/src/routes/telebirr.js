const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const db = require('../db/knex');
const { telegramAuthMiddleware } = require('../middleware/telegramAuth');
const telebirr = require('../services/telebirrService');
const MockTelebirrService = require('../services/mockTelebirrService');
const mockTelebirr = new MockTelebirrService();
const { isMockProviderEnabled, assertMockProviderAllowed, confirmMockDeposit } = require('../services/mockPaymentService');
const { getPaymentProvider } = require('../config/env');

const limiter = rateLimit({ windowMs: 60 * 1000, max: process.env.NODE_ENV === 'test' ? 10000 : 20, standardHeaders: true, legacyHeaders: false });
router.use(limiter);

function mockOnly(req, res, next) {
  try {
    assertMockProviderAllowed();
    return next();
  } catch (e) {
    return res.status(404).json({ error: 'Mock payments are not available' });
  }
}

// Real Telebirr webhook. Mock callbacks are intentionally not accepted here.
router.post('/webhook', async (req, res) => {
  if (isMockProviderEnabled()) {
    return res.status(404).json({ error: 'Real Telebirr webhook is disabled in mock mode' });
  }
  try {
    const payload = req.body || {};
    const sig = req.headers['x-telebirr-signature'] || payload.sign;
    if (!telebirr.verifyWebhookSignature(payload, sig)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
    const orderId = payload.merchantOrderId || payload.outTradeNo || payload.orderId;
    const txnId = payload.transactionId || payload.tradeNo;
    const status = payload.status || payload.tradeStatus;

    const deposit = await db('deposits').where({ merchant_order_id: orderId }).first();
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
    if (deposit.status === 'COMPLETED') return res.json({ ok: true, already: true });

    const success = status === 'SUCCESS' || status === 'TRADE_SUCCESS' || status === 'COMPLETED' || status === 0 || status === '0';

    await db.transaction(async (trx) => {
      if (success) {
        await trx('deposits').where({ id: deposit.id }).update({ status: 'COMPLETED', telebirr_txn_id: txnId, provider: 'telebirr' });
        await trx('users').where({ id: deposit.user_id }).increment('wallet_balance', deposit.amount);
        await trx('financial_ledger').insert({
          user_id: deposit.user_id,
          amount: deposit.amount,
          type: 'DEPOSIT',
          reference_id: `TELEBIRR_${txnId || orderId}`,
          metadata: payload,
        });
      } else {
        await trx('deposits').where({ id: deposit.id }).update({ status: 'FAILED', telebirr_txn_id: txnId, provider: 'telebirr' });
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Webhook error', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Initiate a deposit using the configured provider.
router.post('/deposit', telegramAuthMiddleware, async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const user = await db('users').where({ telegram_id: req.tgUser.id }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const outTradeNo = `TXN_${Date.now()}_${user.id}`;
    const phoneNumber = req.body?.phoneNumber || req.body?.phone_number || null;

    await db('deposits').insert({
      user_id: user.id,
      amount,
      status: 'PENDING',
      merchant_order_id: outTradeNo,
      provider: getPaymentProvider(),
    });

    if (isMockProviderEnabled()) {
      assertMockProviderAllowed();
      const mockResponse = await mockTelebirr.createMockOrder({ userId: user.id, amount, phoneNumber, outTradeNo });
      return res.json(mockResponse);
    }

    let preOrder = null;
    try {
      preOrder = await telebirr.createOrder({ amount, merchantOrderId: outTradeNo, notifyUrl: process.env.TELEBIRR_NOTIFY_URL, returnUrl: req.body?.return_url });
    } catch (e) {
      if (process.env.NODE_ENV === 'production' && process.env.TELEBIRR_ENV === 'production') {
        return res.status(502).json({ error: 'Telebirr production API failed' });
      }
      return res.status(502).json({ error: 'Telebirr API failed' });
    }
    res.json({ outTradeNo, preOrder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Deposit init failed' });
  }
});

// Mock checkout page. Clearly marked as test-only.
router.get('/mock/checkout', mockOnly, async (req, res) => {
  const { outTradeNo, amount, userId: queryUserId, userid } = req.query;
  const internalUserId = queryUserId || userid;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  // Look up the user so the checkout page can authenticate itself without
  // relying on React app localStorage (this page is served directly by the backend).
  let tgUser = null;
  if (internalUserId) {
    const user = await db('users').where({ id: internalUserId }).first();
    if (user) {
      tgUser = {
        id: user.telegram_id,
        first_name: user.first_name || null,
        username: user.telegram_username || null,
      };
    }
  }

  const tgUserJson = JSON.stringify(tgUser || {});
  const outTradeNoStr = JSON.stringify(outTradeNo || '');
  const amountStr = JSON.stringify(amount || '');
  const frontendUrlStr = JSON.stringify(frontendUrl);

  const nonce = require('crypto').randomBytes(16).toString('base64');
  res.set('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self' 'nonce-" + nonce + "'",
    "script-src-attr 'none'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:", "connect-src 'self'", "frame-ancestors 'self'",
    "base-uri 'self'", "form-action 'self'",
  ].join('; '));
  res.send(`<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>GOBINGO - MOCK PAYMENT</title>
      <style>
        body { font-family: sans-serif; background: #0f172a; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .card { background: #1e293b; padding: 30px; border-radius: 12px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.5); width: 360px; }
        .badge { background: #dc2626; color: #fff; padding: 6px 10px; border-radius: 999px; font-weight: bold; display: inline-block; margin-bottom: 12px; }
        button { color: white; border: none; padding: 10px 16px; font-size: 14px; border-radius: 8px; cursor: pointer; width: 100%; margin-top: 10px; font-weight: bold; }
        button:disabled { opacity: 0.6; cursor: not-allowed; }
        .success { background: #10b981; }
        .fail { background: #ef4444; }
        .cancel { background: #64748b; }
        .pending { background: #f59e0b; }
        .duplicate { background: #7c3aed; }
        #status { margin-top: 16px; min-height: 24px; font-size: 14px; font-weight: bold; }
        .status-ok { color: #10b981; }
        .status-error { color: #ef4444; }
        .status-info { color: #60a5fa; }
        .return-btn { display: inline-block; margin-top: 12px; padding: 8px 16px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-size: 14px; }
        .return-btn:hover { background: #2563eb; }
        .small { font-size: 12px; color: #94a3b8; margin-top: 8px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">MOCK PAYMENT — NO REAL MONEY</div>
        <h2>GOBINGO Test Checkout</h2>
        <p>Transaction: <b>${outTradeNo}</b></p>
        <p>Amount: <b>${amount} ETB</b></p>
        <p class="small">This is a simulated payment. No real money is charged.</p>
        <button id="btnSuccess" class="success" data-action="success">Simulate Success</button>
        <button id="btnFail" class="fail" data-action="failed">Simulate Failure</button>
        <button id="btnCancel" class="cancel" data-action="cancelled">Simulate Cancelled</button>
        <button id="btnPending" class="pending" data-action="pending">Simulate Pending</button>
        <button id="btnDuplicate" class="duplicate" data-action="success">Simulate Duplicate Success</button>
        <div id="status"></div>
        <a id="returnLink" class="return-btn" href="${frontendUrl}/wallet" style="display:none;">Return to GOBINGO Wallet</a>
      </div>
<script nonce="${nonce}">
    const tgUser = ${tgUserJson};
    const outTradeNoJs = ${JSON.stringify(outTradeNo || '')};
    const amountJs = ${JSON.stringify(amount || '')};
    const frontendUrlJs = ${JSON.stringify(frontendUrl)};

    const statusEl = document.getElementById('status');
    const returnLink = document.getElementById('returnLink');
    const buttons = ['btnSuccess', 'btnFail', 'btnCancel', 'btnPending', 'btnDuplicate'];

    function setStatus(msg, type = 'info') {
      statusEl.textContent = msg;
      statusEl.className = 'status-' + type;
    }

    function setLoading(loading) {
      buttons.forEach((id) => {
        const b = document.getElementById(id);
        if (b) b.disabled = loading;
      });
      if (loading) setStatus('Processing...', 'info');
    }

    async function confirm(outcome) {
      setLoading(true);
      setStatus('');
      returnLink.style.display = 'none';

      try {
        const devUser = tgUser && tgUser.id
          ? JSON.stringify({ id: tgUser.id, first_name: tgUser.first_name || 'User', username: tgUser.username || 'user' })
          : localStorage.getItem('devUser');

        const headers = { 'Content-Type': 'application/json' };
        if (devUser) headers['x-dev-user'] = devUser;

        const res = await fetch('/api/telebirr/mock/confirm', {
          method: 'POST',
          headers,
          body: JSON.stringify({ outTradeNo: outTradeNoJs, amount: amountJs ? Number(amountJs) : null, outcome }),
        });

        let data;
        try { data = await res.json(); } catch (e) { data = {}; }

        if (res.ok) {
          if (data.already) {
            setStatus('Already processed: ' + (data.status || 'COMPLETED') + '. No duplicate credit.', 'ok');
          } else {
            setStatus('Payment ' + (data.status || 'COMPLETED') + ' — wallet credited.', 'ok');
          }
          returnLink.href = frontendUrlJs + '/wallet';
          returnLink.style.display = 'inline-block';
        } else {
          setStatus(data.error || 'Mock payment failed (HTTP ' + res.status + ')', 'error');
        }
      } catch (err) {
        setStatus('Request failed: ' + (err.message || 'Network error'), 'error');
        console.error('Mock checkout confirm error:', err);
      } finally {
        setLoading(false);
      }
    }

    // Register click listeners using addEventListener (CSP-compatible, no inline handlers)
    document.getElementById('btnSuccess').addEventListener('click', () => confirm('success'));
    document.getElementById('btnFail').addEventListener('click', () => confirm('failed'));
    document.getElementById('btnCancel').addEventListener('click', () => confirm('cancelled'));
    document.getElementById('btnPending').addEventListener('click', () => confirm('pending'));
    document.getElementById('btnDuplicate').addEventListener('click', () => confirm('success'));
  </script>
    </body>
    </html>
  `);
});

// Sandbox alias retained for compatibility.
router.get('/sandbox-checkout', mockOnly, (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  res.redirect(`/api/telebirr/mock/checkout?${qs}`);
});

// Authenticated mock confirmation endpoint.
router.post('/mock/confirm', telegramAuthMiddleware, mockOnly, async (req, res) => {
  try {
    const { outTradeNo, outcome = 'success', amount = null, delayMs = 0 } = req.body || {};
    if (!outTradeNo) return res.status(400).json({ error: 'outTradeNo is required' });
    const result = await confirmMockDeposit(db, {
      outTradeNo,
      requesterTelegramId: req.tgUser.id,
      outcome,
      amount,
      delayMs,
    });
    res.json(result);
  } catch (err) {
    const message = err.message || 'Mock payment failed';
    const status = /not found/i.test(message) ? 404 : /forbidden/i.test(message) ? 403 : /invalid|not allowed|mismatch|transition/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

module.exports = router;
