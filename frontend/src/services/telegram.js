import WebApp from '@twa-dev/sdk';
import api from './api.js';

const DEV_USER = { id: 999001, first_name: 'Dev', username: 'devuser' };

const TelegramAuth = {
  init() {
    try { WebApp.ready(); WebApp.expand(); } catch (e) { /* browser dev */ }
    const initData = this.initData();
    if (initData) {
      try { localStorage.setItem('initData', initData); } catch (e) {}
    } else {
      // dev fallback
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
    try {
      const data = await api.login(initData, null);
      return data.user;
    } catch (e) {
      const status = e?.status;
      const message = e?.message || '';
      if (status === undefined || status >= 500 || /timed out/i.test(message)) {
        throw new Error('Server temporarily unavailable, please try again');
      }
      throw new Error('Login failed');
    }
  },
};

export default TelegramAuth;

