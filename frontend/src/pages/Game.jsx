import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SocketService from '../services/socket.js';
import BingoCard from '../components/BingoCard.jsx';
import { t } from '../i18n/am.js';

export default function Game({ user, room, card, onBack }) {
  const [drawn, setDrawn] = useState([]);
  const [lastNumber, setLastNumber] = useState(null);
  const [status, setStatus] = useState(room.status || 'WAITING');
  const [participants, setParticipants] = useState(1);
  const [winner, setWinner] = useState(null);
  const [claimMsg, setClaimMsg] = useState('');
  const [payout, setPayout] = useState(null);
  const socket = SocketService.get();

  useEffect(() => {
    if (!socket) return;
    socket.emit('join_room', { roomId: room.id });

    const onRoomState = (s) => {
      setDrawn(s.drawn || []);
      if (s.drawn && s.drawn.length) setLastNumber(s.drawn[s.drawn.length - 1]);
      if (s.room) setStatus(s.room.status);
      if (s.participants) setParticipants(s.participants.length);
      if (s.card) {/* keep */ }
    };
    const onPlayerJoined = ({ count }) => setParticipants(count);
    const onGameStarted = () => { setStatus('RUNNING'); setDrawn([]); setLastNumber(null); };
    const onNumberDrawn = ({ number, drawn: d }) => { setDrawn(d); setLastNumber(number); };
    const onClaimResult = ({ valid, reason, patterns }) => {
      if (valid) { setClaimMsg(t('youWon')); }
      else { setClaimMsg(reason || t('invalidClaim')); setTimeout(() => setClaimMsg(''), 2000); }
    };
    const onWinner = ({ userId, telegramId, patterns, payout: p }) => {
      setWinner({ userId, telegramId, patterns });
      setPayout(p);
      setStatus('FINISHED');
    };
    const onError = ({ message }) => { setClaimMsg(message); setTimeout(() => setClaimMsg(''), 2000); };

    socket.on('room_state', onRoomState);
    socket.on('player_joined', onPlayerJoined);
    socket.on('game_started', onGameStarted);
    socket.on('number_drawn', onNumberDrawn);
    socket.on('claim_result', onClaimResult);
    socket.on('winner', onWinner);
    socket.on('error', onError);

    return () => {
      socket.off('room_state', onRoomState);
      socket.off('player_joined', onPlayerJoined);
      socket.off('game_started', onGameStarted);
      socket.off('number_drawn', onNumberDrawn);
      socket.off('claim_result', onClaimResult);
      socket.off('winner', onWinner);
      socket.off('error', onError);
    };
  }, [socket, room.id]);

  const startGame = () => socket.emit('start_game', { roomId: room.id });
  const claim = () => socket.emit('claim_bingo', { roomId: room.id });

  return (
    <div className="max-w-md mx-auto">
      <div className="flex justify-between items-center mb-3">
        <button onClick={onBack} className="text-amber-400">{t('back')}</button>
        <span className="text-sm">{t('room')}: {room.id.slice(0, 8)}</span>
      </div>

      <div className="bg-slate-800 rounded p-3 mb-3 text-center">
        <div className="text-sm text-slate-400">{t('players')}: {participants}</div>
        <div className="text-3xl font-bold text-amber-400 mt-1">{lastNumber || '-'}</div>
        <div className="text-xs text-slate-400">{t('numberDrawn')}</div>
      </div>

      <BingoCard card={card} drawn={drawn} />

      <div className="mt-3 flex gap-2">
        {status === 'WAITING' && (
          <button onClick={startGame} className="flex-1 bg-emerald-600 py-2 rounded font-bold">{t('startGame')}</button>
        )}
        {status === 'RUNNING' && (
          <button onClick={claim} className="flex-1 bg-amber-500 text-slate-900 py-2 rounded font-bold">{t('claimBingo')}</button>
        )}
      </div>

      {claimMsg && <div className="mt-2 text-center text-amber-300">{claimMsg}</div>}

      <AnimatePresence>
        {winner && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
          >
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="bg-slate-800 rounded-xl p-6 max-w-sm w-full text-center">
              <h2 className="text-2xl font-bold text-amber-400 mb-2">{t('youWon')}</h2>
              {payout && (
                <div className="text-sm text-slate-300 space-y-1 mb-4">
                  <div>{t('winnerPayout')}: {payout.winnerPayout} ብር</div>
                  <div>{t('platformFee')}: {payout.platformFee} ብር</div>
                  <div>{t('agentCommission')}: {payout.agentCommission} ብር</div>
                  <div className="font-bold">{t('totalPool') || 'Pool'}: {payout.totalPool} ብር</div>
                </div>
              )}
              <button onClick={onBack} className="bg-amber-500 text-slate-900 px-4 py-2 rounded font-bold">{t('back')}</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

