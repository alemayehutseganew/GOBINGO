import { useState } from 'react';
import api from '../services/api.js';

export default function MockTelebirrCheckout() {
  const params = new URLSearchParams(window.location.search);
  const amount = params.get('amount') || '50';
  const orderId = params.get('orderId') || '';
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const simulateSuccess = async () => {
    setLoading(true);
    setMessage('');
    try {
      const receiptNumber = `MOCK-${Date.now()}`;
      const res = await api.verifyReceipt(receiptNumber, Number(amount));
      if (res?.success) {
        setMessage('Payment successful. Redirecting...');
        window.setTimeout(() => {
          window.location.href = '/';
        }, 1000);
      } else {
        setMessage(res?.message || 'Verification failed');
      }
    } catch (e) {
      setMessage(e?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const simulateFailure = () => {
    setMessage('Payment failed. Please try again.');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl bg-slate-800 p-6 text-center">
        <h1 className="mb-4 text-2xl font-bold text-amber-400">Mock Telebirr Checkout</h1>
        <div className="mb-4 text-sm text-slate-300">
          <div>Amount: {amount} ETB</div>
          {orderId && <div>Order: {orderId}</div>}
        </div>
        <div className="space-y-3">
          <button
            onClick={simulateSuccess}
            disabled={loading}
            className="w-full rounded bg-emerald-600 py-2 font-bold text-white disabled:opacity-60"
          >
            {loading ? 'Processing...' : 'Simulate Payment Success'}
          </button>
          <button
            onClick={simulateFailure}
            disabled={loading}
            className="w-full rounded bg-red-600 py-2 font-bold text-white disabled:opacity-60"
          >
            Simulate Payment Failure
          </button>
        </div>
        {message && <div className="mt-4 text-sm text-amber-300">{message}</div>}
      </div>
    </div>
  );
}