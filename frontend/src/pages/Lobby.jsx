import { useState } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api.js';
import SocketService from '../services/socket.js';
import { t } from '../i18n/am.js';

const LEVELS = [
  { level: 1, label: t('level1'), fee: 10 },
  { level: 2, label: t('level2'), fee: 25 },
  { level: 3, label: t('level3'), fee: 50 },
];

export default function Lobby({ user, onJoinRoom }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState(Number(user.wallet_balance));

  const refreshBalance = async () => {
    try { const d = await api.balance(); setBalance(d.balance); } catch (e) {}
  };

  const join = async (level) => {
    setError('');
    setLoading(true);
    try {
      const res = await api.joinRoom(level);
      SocketService.connect();
      onJoinRoom(res.room, res.card);
    } catch (e) {
      setError(e.message === 'Insufficient balance' ? t('insufficientBalance') : e.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-slate-800 rounded p-3 mb-3 flex justify-between items-center">
        <span>{t('balance')}: {balance} ብር</span>
        <button onClick={refreshBalance} className="text-amber-400 text-sm">↻</button>
      </div>
      {error && <div className="bg-red-900/40 text-red-300 p-2 rounded mb-3">{error}</div>}
      <div className="grid gap-3">
        {LEVELS.map((l) => (
          <motion.button
            key={l.level}
            whileTap={{ scale: 0.97 }}
            onClick={() => join(l.level)}
            disabled={loading}
            className="bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold p-4 rounded-xl shadow-lg flex justify-between items-center"
          >
            <span>{l.label}</span>
            <span className="text-sm opacity-90">{t('join')}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

