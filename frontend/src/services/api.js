const API_BASE = (import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '');

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
  login: (initData, agentUsername) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ initData, agent_username: agentUsername }) }),
  me: () => request('/api/auth/me'),
  balance: () => request('/api/wallet/balance'),
  deposit: (amount, returnUrl) => request('/api/wallet/deposit', { method: 'POST', body: JSON.stringify({ amount, return_url: returnUrl }) }),
  ledger: () => request('/api/wallet/ledger'),
  joinRoom: (level) => request('/api/rooms/join', { method: 'POST', body: JSON.stringify({ level }) }),
  telebirrDeposit: (amount, phoneNumber) => request('/api/telebirr/deposit', { method: 'POST', body: JSON.stringify({ amount, phoneNumber }) }),
  rooms: () => request('/api/rooms'),
  roomCards: (roomId) => request(`/api/rooms/${encodeURIComponent(roomId)}/cards`),
  selectCard: (roomId, cardId) => request(`/api/rooms/${encodeURIComponent(roomId)}/cards/${cardId}`, { method: 'POST' }),
  releaseCard: (roomId, cardId) => request(`/api/rooms/${encodeURIComponent(roomId)}/cards/${cardId}`, { method: 'DELETE' }),
};

export default api;

