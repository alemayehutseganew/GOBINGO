import { useState, useEffect, useRef } from 'react';
import api from '../services/api.js';
import { t } from '../i18n/am.js';

function formatAmount(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return '0.00';
  return n.toFixed(2);
}

function ledgerLabel(row, isDemo) {
  const labels = {
    DEMO_CREDIT_GRANT: 'Demo credit',
    DEMO_ENTRY_FEE: 'Virtual entry fee',
    DEMO_WINNING_PAYOUT: 'Virtual winnings',
    DEMO_AGENT_COMMISSION: 'Virtual agent commission',
    ENTRY_FEE: 'Entry fee',
    WINNING_PAYOUT: 'Winnings',
    AGENT_COMMISSION: 'Agent commission',
    DEPOSIT: 'Deposit',
  };
  return labels[row.type] || row.type;
}

export default function Wallet({ user, isDemo }) {
  const [balance, setBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState('');
  const [ledger, setLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState('');
  const [amount, setAmount] = useState('');
const [receiptNumber, setReceiptNumber] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const mountedRef = useRef(true);

  const refresh = async () => {
    setBalanceLoading(true);
    setBalanceError('');
    setLedgerLoading(true);
    setLedgerError('');
    try {
      const d = await api.balance();
      if (!mountedRef.current) return;
      setBalance(Number(d.balance));
    } catch (e) {
      if (!mountedRef.current) return;
      setBalanceError(e?.message || t('error'));
    } finally {
      if (mountedRef.current) setBalanceLoading(false);
    }
    try {
      const d = await api.ledger();
      if (!mountedRef.current) return;
      setLedger(Array.isArray(d.ledger) ? d.ledger : []);
    } catch (e) {
      if (!mountedRef.current) return;
      setLedgerError(e?.message || t('error'));
    } finally {
      if (mountedRef.current) setLedgerLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => { mountedRef.current = false; };
  }, []);

  const deposit = async () => {
    if (isDemo) return;
    const a = Number(amount);
    if (!a || a <= 0) {
      setMsg(t('error'));
      return;
    }
    setLoading(true);
    setMsg('');
    try {
      const res = await api.telebirrDeposit(a, null);
      const checkoutUrl = res?.data?.toUrl || res?.preOrder?.data?.toUrl || res?.preOrder?.toUrl;
      if (typeof checkoutUrl === 'string' && /^https?:\/\//i.test(checkoutUrl)) {
        setMsg(t('depositPending'));
        window.location.assign(checkoutUrl);
      } else {
        setMsg('Deposit initialized, but no checkout URL was returned.');
      }
    } catch (e) {
      setMsg(e?.message || t('error'));
    } finally {
      setLoading(false);
    }
  };

  const topUp = async () => {
    if (isDemo) return;
    const a = Number(amount);
    if (!a || a <= 0) {
      setMsg(t('error'));
      return;
    }
    setLoading(true);
    setMsg('');
    try {
      const res = await api.initiatePayment(a);
      if (res?.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        setMsg('No checkout URL returned.');
      }
    } catch (e) {
      setMsg(e?.message || t('error'));
    } finally {
      setLoading(false);
    }
  };

  const verifyReceipt = async () => {
    if (isDemo) return;
    if (!receiptNumber.trim()) {
      setMsg(t('error'));
      return;
    }
    setVerifying(true);
    setMsg('');
    try {
      const res = await api.verifyReceipt(receiptNumber.trim(), Number(amount) || undefined);
      if (res?.success) {
        setMsg('Verification successful.');
        await refresh();
      } else {
        setMsg(res?.message || 'Verification failed');
      }
    } catch (e) {
      setMsg(e?.message || t('error'));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="rounded bg-slate-800 p-4">
        <div className="mb-1 text-sm text-slate-400">
          {isDemo ? 'Virtual balance' : t('balance')}
        </div>
        <div className="text-lg font-bold text-amber-400">
          {balanceLoading ? '...' : `${formatAmount(balance)} ${isDemo ? 'virtual ETB' : 'ብር'}`}
        </div>
        {balanceError && (
          <button onClick={refresh} className="mt-2 text-xs text-red-300">
            {balanceError} — retry
          </button>
        )}
        {isDemo && (
          <p className="mt-3 text-xs text-slate-400">
            Virtual balances have no cash value and cannot be withdrawn.
          </p>
        )}
      </div>

      {!isDemo && (
        <div className="rounded bg-slate-800 p-4">
          <div className="mb-2">{t('deposit')}</div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t('amount')}
            className="mb-3 w-full rounded bg-slate-700 p-2"
          />
          <button
            onClick={topUp}
            disabled={loading}
            className="w-full rounded bg-amber-500 py-2 font-bold text-slate-900 disabled:opacity-60"
          >
            {loading ? '...' : 'Top Up'}
          </button>
          <div className="mt-3">
            <input
              type="text"
              value={receiptNumber}
              onChange={(e) => setReceiptNumber(e.target.value)}
              placeholder="Telebirr receipt number"
              className="mb-2 w-full rounded bg-slate-700 p-2"
            />
            <button
              onClick={verifyReceipt}
              disabled={verifying}
              className="w-full rounded bg-slate-600 py-2 font-bold text-white disabled:opacity-60"
            >
              {verifying ? '...' : 'Verify'}
            </button>
          </div>
          {msg && <div className="mt-3 text-center text-amber-300">{msg}</div>}
        </div>
      )}

      <div className="rounded bg-slate-800 p-4">
        <div className="mb-3 font-bold">{isDemo ? 'Virtual transaction history' : 'Transaction history'}</div>
        {ledgerLoading && <div className="text-sm text-slate-400">Loading...</div>}
        {ledgerError && (
          <button onClick={refresh} className="text-xs text-red-300">
            {ledgerError} — retry
          </button>
        )}
        {!ledgerLoading && !ledgerError && ledger.length === 0 && (
          <div className="text-sm text-slate-400">No transactions yet.</div>
        )}
        <div className="space-y-2">
          {ledger.map((row, index) => (
            <div key={row.id || index} className="flex items-center justify-between rounded bg-slate-700/60 px-3 py-2 text-sm">
              <div>
                <div className="font-medium text-slate-100">{ledgerLabel(row, isDemo)}</div>
                <div className="text-xs text-slate-400">{row.created_at ? new Date(row.created_at).toLocaleString() : ''}</div>
              </div>
              <div className={Number(row.amount) >= 0 ? 'text-emerald-400' : 'text-red-300'}>
                {Number(row.amount) >= 0 ? '+' : ''}{formatAmount(row.amount)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

