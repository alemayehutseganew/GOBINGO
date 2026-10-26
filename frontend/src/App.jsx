import { useState, useEffect } from 'react';
import TelegramAuth from './services/telegram.js';
import SocketService from './services/socket.js';
import Lobby from './pages/Lobby.jsx';
import Game from './pages/Game.jsx';
import Wallet from './pages/Wallet.jsx';
import { t } from './i18n/am.js';

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('lobby');
  const [activeRoom, setActiveRoom] = useState(null);

  useEffect(() => {
    TelegramAuth.init();
    (async () => {
      try {
        const u = await TelegramAuth.login();
        setUser(u);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  if (!user) {
    return <div className="flex items-center justify-center h-screen">{t('loading')}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="p-3 flex justify-between items-center bg-slate-800">
        <h1 className="text-xl font-bold text-amber-400">GOBINGO</h1>
        <nav className="flex gap-2">
          <button onClick={() => setPage('lobby')} className="px-3 py-1 rounded bg-slate-700">{t('lobby')}</button>
          <button onClick={() => setPage('wallet')} className="px-3 py-1 rounded bg-slate-700">{t('wallet')}</button>
        </nav>
      </header>
      <main className="p-3">
        {page === 'lobby' && <Lobby user={user} onJoinRoom={(r, card) => { setActiveRoom({ room: r, card }); setPage('game'); }} />}
        {page === 'game' && activeRoom && <Game user={user} room={activeRoom.room} card={activeRoom.card} onBack={() => setPage('lobby')} />}
        {page === 'wallet' && <Wallet user={user} />}
      </main>
    </div>
  );
}

