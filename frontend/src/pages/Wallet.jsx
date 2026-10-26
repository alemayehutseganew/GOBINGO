import { useState, useEffect } from 'react';
import api from '../services/api.js';
import { t } from '../i18n/am.js';

export default function Wallet({ user }) {
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState(Number(user.wallet_balance));
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { refresh(); }, []);

  const refresh = async () => {
    try { const d = await api.balance(); setBalance(d.balance); } catch (e) {}
  };

  const deposit = async () => {
    const a = Number(amount);
    if (!a || a <= 0) { setMsg(t('error')); return; }
    setLoading(true);
    setMsg('');
    try {
      const res = await api.telebirrDeposit(a, null);
      if (res?.data?.toUrl) {
        setMsg(t('depositPending'));
        window.location.href = res.data.toUrl;
      } else {
        setMsg(t('depositSuccess'));
        await refresh();
      }
    } catch (e) {
      setMsg(e.message || t('error'));
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-md mx-auto bg-slate-800 rounded p-4">
      <div className="text-lg mb-3">{t('balance')}: <span className="text-amber-400 font-bold">{balance} ብር</span></div>
      <div className="mb-2">{t('deposit')}</div>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={t('amount')}
        className="w-full p-2 rounded bg-slate-700 mb-3"
      />
      <button onClick={deposit} disabled={loading} className="w-full bg-amber-500 text-slate-900 py-2 rounded font-bold">
        {loading ? '...' : t('confirm')}
      </button>
      {msg && <div className="mt-3 text-center text-amber-300">{msg}</div>}
    </div>
  );
}

