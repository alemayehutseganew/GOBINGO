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
    try { return WebApp.initData || ''; } catch (e) { return ''; }
  },
  async login() {
    const initData = this.initData();
    const data = await api.login(initData, null);
    return data.user;
  },
};

export default TelegramAuth;

