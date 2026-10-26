const API_BASE = import.meta.env.VITE_API_URL || '';

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
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { ...headers(initData), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
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
};

export default api;

