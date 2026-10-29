import { useEffect } from 'react';

export default function MobileLayout({ children }) {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      try {
        tg.ready();
        tg.expand();
      } catch (e) {
        // Ignore Telegram SDK errors in non-Telegram environments.
      }
    }
  }, []);

  return (
    <div className="min-h-screen overflow-y-auto pb-24 bg-slate-900 text-slate-100">
      {children}
    </div>
  );
}