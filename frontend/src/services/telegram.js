import WebApp from '@twa-dev/sdk';
import { API_URL } from './api.js';

const DEV_USER = { id: 999001, first_name: 'Dev', username: 'devuser' };

const TelegramAuth = {
  init() {
    try { WebApp.ready(); WebApp.expand(); } catch (e) { /* browser dev */ }
    const initData = this.initData();
    if (initData) {
      try { localStorage.setItem('initData', initData); } catch (e) {}
    } else {
      try { localStorage.setItem('devUser', JSON.stringify(DEV_USER)); } catch (e) {}
    }
  },
  initData() {
    try {
      return WebApp.initData || window.Telegram?.WebApp?.initData || '';
    } catch (e) {
      return window.Telegram?.WebApp?.initData || '';
    }
  },
  async login() {
    const initData = this.initData();
    if (!initData) {
      console.error('No initData found. Are you running inside Telegram?');
      throw new Error('Not in Telegram');
    }

    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Login failed:', data.error);
      throw new Error(data.error || 'Login failed');
    }

    return data.user;
  },
};

export default TelegramAuth;

