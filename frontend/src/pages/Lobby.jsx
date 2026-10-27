import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api.js';
import SocketService from '../services/socket.js';
import { t } from '../i18n/am.js';

const LEVELS = [
  { level: 1, label: t('level1'), fee: 10 },
  { level: 2, label: t('level2'), fee: 25 },
  { level: 3, label: t('level3'), fee: 50 },
];

function formatBalance(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(2);
}

export default function Lobby({ user, isDemo, onJoinRoom }) {
  const [joiningLevel, setJoiningLevel] = useState(null);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState(null);
  const [balanceError, setBalanceError] = useState('');
  const [loadingBalance, setLoadingBalance] = useState(true);

  const mountedRef = useRef(true);

  const refreshBalance = async () => {
    setLoadingBalance(true);
    setBalanceError('');
    try {
      const d = await api.balance();
      if (!mountedRef.current) return;
      setBalance(Number(d.balance));
    } catch (e) {
      if (!mountedRef.current) return;
      setBalanceError(e?.message || t('error'));
    } finally {
      if (mountedRef.current) setLoadingBalance(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    refreshBalance();
    return () => { mountedRef.current = false; };
  }, []);

  const join = async (level) => {
    if (joiningLevel !== null) return;
    setError('');
    setJoiningLevel(level);
    try {
      const res = await api.joinRoom(level);
      SocketService.connect();
      await refreshBalance();
      onJoinRoom(res.room, res.card);
    } catch (e) {
      const message = e?.message || t('error');
      setError(message === 'Insufficient balance' ? t('insufficientBalance') : message);
    } finally {
      setJoiningLevel(null);
    }
  };

  const busy = joiningLevel !== null;

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-3 flex items-center justify-between rounded bg-slate-800 p-3">
        <div>
          <div className="text-sm text-slate-400">
            {isDemo ? 'Virtual balance' : t('balance')}
          </div>
          <div className="font-bold text-amber-400">
            {loadingBalance ? '...' : `${formatBalance(balance)} ${isDemo ? 'virtual ETB' : 'ብር'}`}
          </div>
          {balanceError && (
            <button onClick={refreshBalance} className="mt-1 text-xs text-red-300">
              {balanceError} — retry
            </button>
          )}
        </div>
        <button onClick={refreshBalance} className="text-amber-400 text-sm" aria-label="Refresh balance">
          ↻
        </button>
      </div>
      {error && <div className="mb-3 rounded bg-red-900/40 p-2 text-red-300">{error}</div>}
      <div className="grid gap-3">
        {LEVELS.map((l) => (
          <motion.button
            key={l.level}
            whileTap={{ scale: busy ? 1 : 0.97 }}
            onClick={() => join(l.level)}
            disabled={busy}
            className="flex items-center justify-between rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 p-4 font-bold text-white shadow-lg disabled:opacity-60"
          >
            <span>{l.label}{isDemo ? ' (virtual)' : ''}</span>
            <span className="text-sm opacity-90">{joiningLevel === l.level ? '...' : t('join')}</span>
          </motion.button>
        ))}
      </div>
      {isDemo && (
        <p className="mt-3 text-xs text-slate-400">
          Virtual entry fees only. No real money is used.
        </p>
      )}
    </div>
  );
}

