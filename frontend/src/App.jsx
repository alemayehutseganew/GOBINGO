import { useState, useEffect } from 'react';
import TelegramAuth from './services/telegram.js';
import SocketService from './services/socket.js';
import api from './services/api.js';
import Lobby from './pages/Lobby.jsx';
import Game from './pages/Game.jsx';
import Wallet from './pages/Wallet.jsx';
import { t } from './i18n/am.js';
import DemoBadge from './components/DemoBadge.jsx';
import DemoBanner from './components/DemoBanner.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('lobby');
  const [activeRoom, setActiveRoom] = useState(null);
  const [startupError, setStartupError] = useState('');
  const [isDemo, setIsDemo] = useState(null);

  useEffect(() => {
    TelegramAuth.init();
    (async () => {
      try {
        if (!TelegramAuth.initData() && import.meta.env.PROD) {
          setStartupError(t('openInTelegram'));
          return;
        }
        const u = await TelegramAuth.login();
        setUser(u);
        const wallet = await api.balance();
        if (!wallet || typeof wallet.demo !== 'boolean') throw new Error('Invalid wallet mode response');
        setIsDemo(wallet.demo);
      } catch (e) {
        console.error(e && e.message ? e.message : 'Startup failed');
        setStartupError(e?.message || t('error'));
      }
    })();
  }, []);

  if (startupError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <div className="max-w-md">
          <h1 className="mb-3 text-xl font-bold text-amber-400">GOBINGO</h1>
          <p className="text-red-300">{startupError}</p>
        </div>
      </div>
    );
  }

  if (!user || isDemo === null) {
    return <div className="flex min-h-screen items-center justify-center">{t('loading')}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="flex items-center justify-between gap-2 bg-slate-900 p-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-amber-400">GOBINGO</h1>
          {isDemo && <DemoBadge />}
        </div>
        <nav className="flex gap-2">
          <button onClick={() => setPage('lobby')} className="rounded bg-slate-700 px-3 py-1">{t('lobby')}</button>
          <button onClick={() => setPage('wallet')} className="rounded bg-slate-700 px-3 py-1">{t('wallet')}</button>
        </nav>
      </header>
      <main className="mx-auto max-w-md p-3">
        {isDemo && <DemoBanner />}
        {page === 'lobby' && <Lobby user={user} isDemo={isDemo} onJoinRoom={(r, card) => { setActiveRoom({ room: r, card }); setPage('game'); }} />}
        {page === 'game' && activeRoom && <Game user={user} room={activeRoom.room} card={activeRoom.card} isDemo={isDemo} onBack={() => setPage('lobby')} />}
        {page === 'wallet' && <Wallet user={user} isDemo={isDemo} />}
      </main>
    </div>
  );
}

