const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/$/, '');

function headers(initData) {
  const h = { 'Content-Type': 'application/json' };
  if (initData) h['x-telegram-init-data'] = initData;
  else {
    const dev = localStorage.getItem('devUser');
    if (dev) h['x-dev-user'] = dev;
  }
  return h;
}

async function request(path, opts = {}) {
  const initData = (window.Telegram?.WebApp?.initData) || localStorage.getItem('initData') || '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      signal: controller.signal,
      headers: { ...headers(initData), ...(opts.headers || {}) },
    });
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('Request timed out');
    throw e;
  }
  clearTimeout(timeout);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error = new Error(err.error || res.statusText);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export const api = {
  login: (initData, agentUsername) => request('/auth/login', { method: 'POST', body: JSON.stringify({ initData, agent_username: agentUsername }) }),
  me: () => request('/auth/me'),
  balance: () => request('/wallet/balance'),
  deposit: (amount, returnUrl) => request('/wallet/deposit', { method: 'POST', body: JSON.stringify({ amount, return_url: returnUrl }) }),
  ledger: () => request('/wallet/ledger'),
  devTopup: () => request('/wallet/dev-topup', { method: 'POST' }),
  joinRoom: (level) => request('/rooms/join', { method: 'POST', body: JSON.stringify({ level }) }),
  telebirrDeposit: (amount, phoneNumber) => request('/telebirr/deposit', { method: 'POST', body: JSON.stringify({ amount, phoneNumber }) }),
  rooms: () => request('/rooms'),
  roomCards: (roomId) => request(`/api/rooms/${encodeURIComponent(roomId)}/cards`),
  initiatePayment: (amount) => request('/payments/initiate', { method: 'POST', body: JSON.stringify({ amount }) }),
  verifyReceipt: (receiptNumber, amount) => request('/payments/verify-receipt', { method: 'POST', body: JSON.stringify({ receiptNumber, amount }) }),
  verifyReceipt: (receiptNumber, amount) => request('/payments/verify-receipt', { method: 'POST', body: JSON.stringify({ receiptNumber, amount }) }),
  selectCard: (roomId, cardId) => request(`/api/rooms/${encodeURIComponent(roomId)}/cards/${cardId}`, { method: 'POST' }),
  releaseCard: (roomId, cardId) => request(`/api/rooms/${encodeURIComponent(roomId)}/cards/${cardId}`, { method: 'DELETE' }),
};

export default api;

