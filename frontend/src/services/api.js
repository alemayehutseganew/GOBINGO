// 1. Sanitize the API URL (removes trailing slash and any accidental /api at the end)
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001')
  .replace(/\/api\/?$/, '')
  .replace(/\/$/, '');

// 2. Build headers for authentication
function headers(initData) {
  const h = { 'Content-Type': 'application/json' };
  if (initData) {
    h['x-telegram-init-data'] = initData;
  } else {
    // Fallback for local dev testing outside Telegram
    const dev = localStorage.getItem('devUser');
    if (dev) h['x-dev-user'] = dev;
  }
  return h;
}

// 3. Central request handler with 15s timeout (Render cold starts)
async function request(path, opts = {}) {
  const initData = (window.Telegram?.WebApp?.initData) || localStorage.getItem('initData') || '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  
  let res;
  try {
    // Ensure the path always starts with a leading slash
    const safePath = path.startsWith('/') ? path : `/${path}`;
    res = await fetch(`${API_URL}${safePath}`, {
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

// 4. API Endpoints (Ensuring EVERY path has the /api prefix)
export const api = {
  // Auth
  login: (initData, agentUsername) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ initData, agent_username: agentUsername }) }),
  me: () => request('/api/auth/me'),
  
  // Wallet & Payments
  balance: () => request('/api/wallet/balance'),
  deposit: (amount, returnUrl) => request('/api/wallet/deposit', { method: 'POST', body: JSON.stringify({ amount, return_url: returnUrl }) }),
  ledger: () => request('/api/wallet/ledger'),
  devTopup: () => request('/api/wallet/dev-topup', { method: 'POST' }),
  initiatePayment: (amount) => request('/api/payments/initiate', { method: 'POST', body: JSON.stringify({ amount }) }),
  verifyReceipt: (receiptNumber, amount) => request('/api/payments/verify-receipt', { method: 'POST', body: JSON.stringify({ receiptNumber, amount }) }),
  telebirrDeposit: (amount, phoneNumber) => request('/api/telebirr/deposit', { method: 'POST', body: JSON.stringify({ amount, phoneNumber }) }),
  
  // Rooms & Game
  rooms: () => request('/api/rooms'),
  joinRoom: (level) => request('/api/rooms/join', { method: 'POST', body: JSON.stringify({ level }) }),
  roomCards: (roomId) => request(`/api/rooms/${encodeURIComponent(roomId)}/cards`),
  selectCard: (roomId, cardId) => request(`/api/rooms/${encodeURIComponent(roomId)}/cards/${cardId}`, { method: 'POST' }),
  releaseCard: (roomId, cardId) => request(`/api/rooms/${encodeURIComponent(roomId)}/cards/${cardId}`, { method: 'DELETE' }),
  getMyCards: (roomId, userId) => request(`/api/rooms/${encodeURIComponent(roomId)}/my-cards?userId=${encodeURIComponent(userId)}`),
};

export default api;