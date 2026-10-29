import { useEffect } from 'react';

export default function MobileLayout({ children }) {
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlHeight = document.documentElement.style.height;
    const previousBodyHeight = document.body.style.height;

    document.documentElement.style.height = '100%';
    document.body.style.height = '100%';
    document.body.style.overflow = 'hidden';

    const tg = window.Telegram?.WebApp;
    if (tg) {
      try {
        tg.ready();
        tg.expand();
      } catch (e) {
        // Ignore Telegram SDK errors in non-Telegram environments.
      }
    }

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.height = previousHtmlHeight;
      document.body.style.height = previousBodyHeight;
    };
  }, []);

  return (
    <div className="h-screen w-full overflow-hidden bg-slate-900 text-slate-100">
      {children}
    </div>
  );
}