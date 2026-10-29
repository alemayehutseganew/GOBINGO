import { useEffect, useState } from 'react';
import api from '../services/api.js';
import BingoCard from './BingoCard.jsx';

export default function CardSelectionBoard({ roomId, socket, onSelectionChange }) {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyCardId, setBusyCardId] = useState(null);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(Date.now());

  const loadBoard = async () => {
    if (!roomId) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.roomCards(roomId);
      setBoard(data);
      if (onSelectionChange) onSelectionChange(data.selectedCards || []);
    } catch (e) {
      setError(e?.message || 'Failed to load card board');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBoard();
  }, [roomId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => loadBoard();
    socket.on('card_reserved', refresh);
    socket.on('card_released', refresh);
    return () => {
      socket.off('card_reserved', refresh);
      socket.off('card_released', refresh);
    };
  }, [socket, roomId]);

  const selectCard = async (cardId) => {
    setBusyCardId(cardId);
    setMessage('');
    try {
      await api.selectCard(roomId, cardId);
      await loadBoard();
    } catch (e) {
      setMessage(e?.message || 'Unable to select card');
    } finally {
      setBusyCardId(null);
    }
  };

  const releaseCard = async (cardId) => {
    setBusyCardId(cardId);
    setMessage('');
    try {
      await api.releaseCard(roomId, cardId);
      await loadBoard();
    } catch (e) {
      setMessage(e?.message || 'Unable to release card');
    } finally {
      setBusyCardId(null);
    }
  };

  const registrationOpen = board?.registrationOpen !== false;
  const selectedCount = board?.selectedCardIds?.length || 0;
  const atLimit = selectedCount >= (board?.maxCardsPerPlayer || 2);

  if (loading) return <div className="rounded-lg bg-slate-800 p-4 text-sm text-slate-300">Loading card board...</div>;
  if (error) return <div className="rounded-lg bg-red-900/40 p-4 text-sm text-red-200">{error}</div>;

  return (
    <section className="space-y-3" aria-label="Card selection board">
      <div className="rounded-lg bg-slate-800 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-amber-300">Card selection</h2>
          <span className="text-xs text-slate-300">
            {selectedCount}/{board?.maxCardsPerPlayer || 2} selected
          </span>
        </div>
        {board?.registrationEndsAt && (
          <div className="mb-2 text-xs text-slate-300">
            Registration closes in {Math.max(0, Math.ceil((new Date(board.registrationEndsAt).getTime() - now) / 1000))}s
          </div>
        )}
        {!registrationOpen && (
          <div className="mb-2 rounded bg-amber-900/40 p-2 text-xs text-amber-200">
            Registration is closed. Card selection is no longer available.
          </div>
        )}
        {message && <div className="mb-2 rounded bg-red-900/40 p-2 text-xs text-red-200">{message}</div>}
        <div className="grid grid-cols-10 gap-1 sm:grid-cols-12">
          {(board?.cards || []).map((item) => {
            const selected = item.status === 'selected';
            const reserved = item.status === 'reserved';
            const disabled = reserved || (!selected && (atLimit || !registrationOpen));
            return (
              <button
                key={item.cardId}
                type="button"
                disabled={disabled && !selected}
                onClick={() => (selected ? releaseCard(item.cardId) : selectCard(item.cardId))}
                aria-label={`Card ${item.cardId}${selected ? ', selected by you' : reserved ? ', reserved by another player' : ', available'}`}
                className={`aspect-square rounded text-[10px] font-bold transition ${
                  selected
                    ? 'bg-amber-500 text-slate-900'
                    : reserved
                      ? 'cursor-not-allowed bg-slate-600 text-slate-400'
                      : 'bg-slate-700 text-slate-100 hover:bg-slate-600'
                } ${disabled && !selected ? 'opacity-50' : ''}`}
              >
                {item.cardId}
              </button>
            );
          })}
        </div>
      </div>

      {board?.selectedCards?.length > 0 && (
        <div className="space-y-3">
          {board.selectedCards.map((item) => (
            <div key={item.cardId} className="rounded-lg bg-slate-800 p-3">
              <div className="mb-2 text-sm font-bold text-amber-300">Card {item.cardId}</div>
              <BingoCard card={item.card} drawn={[]} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}