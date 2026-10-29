import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SocketService from '../services/socket.js';
import BingoCard from '../components/BingoCard.jsx';
import NumberChart from '../components/NumberChart.jsx';
import LatestCalledBall from '../components/LatestCalledBall.jsx';
import CardSelectionBoard from '../components/CardSelectionBoard.jsx';
import PatternPicker from '../components/PatternPicker.jsx';
import { t } from '../i18n/am.js';

export default function Game({ user, room, card, isDemo, onBack }) {
  const [drawn, setDrawn] = useState([]);
  const [lastNumber, setLastNumber] = useState(null);
  const [status, setStatus] = useState(room.status || 'WAITING');
  const [participants, setParticipants] = useState(1);
  const [winner, setWinner] = useState(null);
  const [claimMsg, setClaimMsg] = useState('');
  const [payout, setPayout] = useState(null);
  const [connected, setConnected] = useState(false);
  const [starting, setStarting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [cardState, setCardState] = useState(card);
  const [availablePatterns, setAvailablePatterns] = useState([]);
  const [selectedPatterns, setSelectedPatterns] = useState([]);
  const [patternReadyCount, setPatternReadyCount] = useState(0);
  const [patternTotalCount, setPatternTotalCount] = useState(0);
  const [patternError, setPatternError] = useState('');
  const [selectedCards, setSelectedCards] = useState([]);
  const socket = SocketService.get();
  const roomIdRef = useRef(room.id);
  const isMountedRef = useRef(true);
  const startTimeoutRef = useRef(null);
  const claimTimeoutRef = useRef(null);
  const claimMsgTimeoutRef = useRef(null);

  useEffect(() => {
    setCardState(card);
  }, [card]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (startTimeoutRef.current) { clearTimeout(startTimeoutRef.current); startTimeoutRef.current = null; }
      if (claimTimeoutRef.current) { clearTimeout(claimTimeoutRef.current); claimTimeoutRef.current = null; }
      if (claimMsgTimeoutRef.current) { clearTimeout(claimMsgTimeoutRef.current); claimMsgTimeoutRef.current = null; }
    };
  }, []);

  useEffect(() => {
    roomIdRef.current = room.id;
  }, [room.id]);

  useEffect(() => {
    if (!socket) return;

    const currentRoomId = room.id;

    const guarded = (fn) => (...args) => {
      if (!isMountedRef.current || roomIdRef.current !== currentRoomId) return;
      return fn(...args);
    };

    const onConnect = guarded(() => {
      setConnected(true);
      socket.emit('join_room', { roomId: currentRoomId });
    });
    const onDisconnect = guarded(() => setConnected(false));
    const onRoomState = guarded((s) => {
      if (!s) return;
      if (Array.isArray(s.drawn)) {
        setDrawn(s.drawn);
        if (s.drawn.length) setLastNumber(s.drawn[s.drawn.length - 1]);
      }
      if (s.room && s.room.status) setStatus(s.room.status);
      if (Array.isArray(s.participants)) setParticipants(s.participants.length);
      if (s.card) setCardState(s.card);
      if (Array.isArray(s.selectedCards)) setSelectedCards(s.selectedCards);
      if (Array.isArray(s.availablePatterns) && s.availablePatterns.length > 0) setAvailablePatterns(s.availablePatterns);
      else if (Array.isArray(s.winningPatterns)) setAvailablePatterns(s.winningPatterns);
      else if (Array.isArray(s.room?.winning_patterns)) setAvailablePatterns(s.room.winning_patterns);
      else setAvailablePatterns(['ROW_0', 'ROW_1', 'ROW_2', 'ROW_3', 'ROW_4', 'COL_0', 'COL_1', 'COL_2', 'COL_3', 'COL_4', 'DIAG_MAIN', 'DIAG_ANTI', 'FOUR_CORNERS', 'FULL_HOUSE']);
      if (Array.isArray(s.selectedPatterns)) setSelectedPatterns(s.selectedPatterns);
      if (s.participants && Array.isArray(s.participants)) {
        const ready = s.participants.filter((p) => Array.isArray(p.selectedPatterns) && p.selectedPatterns.length > 0).length;
        setPatternReadyCount(ready);
        setPatternTotalCount(s.participants.length);
      }
    });
    const onPlayerJoined = guarded(({ count }) => setParticipants(count));
    const onPlayerPatternsUpdated = guarded(({ userId, patterns }) => {
      // Update participants' selected patterns (handled by room_state refresh)
    });
    const onPatternSelectionStatus = guarded(({ ready, total }) => {
      setPatternReadyCount(ready);
      setPatternTotalCount(total);
    });
    const onPatternSelectionResult = guarded((result) => {
      if (result && result.ok) {
        if (Array.isArray(result.patterns)) setSelectedPatterns(result.patterns);
        setPatternError('');
      } else {
        setPatternError(result?.error || 'Selection failed');
      }
    });
    const onGameStarted = guarded(({ roomId } = {}) => {
      if (roomId && roomId !== currentRoomId) return;
      setStatus('RUNNING');
      setDrawn([]);
      setLastNumber(null);
      setStarting(false);
      if (startTimeoutRef.current) { clearTimeout(startTimeoutRef.current); startTimeoutRef.current = null; }
    });
    const onNumberDrawn = guarded(({ number, drawn: d }) => {
      setDrawn(Array.isArray(d) ? d : []);
      setLastNumber(number);
    });
    const onClaimResult = guarded(({ valid, reason }) => {
      setClaiming(false);
      if (claimTimeoutRef.current) { clearTimeout(claimTimeoutRef.current); claimTimeoutRef.current = null; }
      if (valid) setClaimMsg(t('youWon'));
      else {
        setClaimMsg(reason || t('invalidClaim'));
        if (claimMsgTimeoutRef.current) clearTimeout(claimMsgTimeoutRef.current);
        claimMsgTimeoutRef.current = window.setTimeout(() => {
          if (isMountedRef.current && roomIdRef.current === currentRoomId) setClaimMsg('');
        }, 2500);
      }
    });
    const onWinner = guarded(({ userId, telegramId, patterns, payout: p }) => {
      const isCurrentUser =
        (telegramId !== undefined && telegramId !== null && telegramId === user?.telegram_id) ||
        (userId !== undefined && userId !== null && userId === user?.id);
      setWinner({ userId, telegramId, patterns, isCurrentUser });
      setPayout(p);
      setStatus('FINISHED');
      setClaiming(false);
      if (claimTimeoutRef.current) { clearTimeout(claimTimeoutRef.current); claimTimeoutRef.current = null; }
    });
    const onGameCompleted = guarded(() => {
      setClaimMsg(t('allNumbersCalled'));
    });
    const onGameRefunded = guarded(({ entryFeeRefunded }) => {
      setStatus('CANCELLED');
      setStarting(false);
      setClaiming(false);
      setClaimMsg(`${t('noWinnerRefunded')} ${entryFeeRefunded}`);
    });
    const onError = guarded(({ message }) => {
      setStarting(false);
      setClaiming(false);
      if (startTimeoutRef.current) { clearTimeout(startTimeoutRef.current); startTimeoutRef.current = null; }
      if (claimTimeoutRef.current) { clearTimeout(claimTimeoutRef.current); claimTimeoutRef.current = null; }
      setClaimMsg(message === 'At least 2 players are required' ? t('atLeast2Players') : (message || t('error')));
      if (claimMsgTimeoutRef.current) clearTimeout(claimMsgTimeoutRef.current);
      claimMsgTimeoutRef.current = window.setTimeout(() => {
        if (isMountedRef.current && roomIdRef.current === currentRoomId) setClaimMsg('');
      }, 2500);
    });

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_state', onRoomState);
    socket.on('player_joined', onPlayerJoined);
    socket.on('player_patterns_updated', onPlayerPatternsUpdated);
    socket.on('pattern_selection_status', onPatternSelectionStatus);
    socket.on('pattern_selection_result', onPatternSelectionResult);
    socket.on('game_started', onGameStarted);
    socket.on('number_drawn', onNumberDrawn);
    socket.on('claim_result', onClaimResult);
    socket.on('winner', onWinner);
    socket.on('game_completed', onGameCompleted);
    socket.on('game_refunded', onGameRefunded);
    socket.on('error', onError);

    if (socket.connected) {
      setConnected(true);
      socket.emit('join_room', { roomId: currentRoomId });
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_state', onRoomState);
      socket.off('player_joined', onPlayerJoined);
      socket.off('player_patterns_updated', onPlayerPatternsUpdated);
      socket.off('pattern_selection_status', onPatternSelectionStatus);
      socket.off('pattern_selection_result', onPatternSelectionResult);
      socket.off('game_started', onGameStarted);
      socket.off('number_drawn', onNumberDrawn);
      socket.off('claim_result', onClaimResult);
      socket.off('winner', onWinner);
    socket.off('game_completed', onGameCompleted);
    socket.off('game_refunded', onGameRefunded);
      socket.off('error', onError);
    };
  }, [socket, room.id, user?.id, user?.telegram_id]);

  const savePatterns = (patterns) => {
    if (!socket || !connected) return;
    socket.emit('select_patterns', { roomId: room.id, patterns });
  };
  const handlePatternChange = (patterns) => {
    setSelectedPatterns(patterns);
    savePatterns(patterns);
  };
  const startGame = () => {
    if (starting || status !== 'WAITING' || !connected) return;
    setStarting(true);
    socket.emit('start_game', { roomId: room.id });
    if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
    startTimeoutRef.current = window.setTimeout(() => {
      if (isMountedRef.current && roomIdRef.current === room.id) setStarting(false);
    }, 3000);
  };

  const claim = () => {
    if (claiming || status !== 'RUNNING' || !connected) return;
    setClaiming(true);
    socket.emit('claim_bingo', { roomId: room.id });
    if (claimTimeoutRef.current) clearTimeout(claimTimeoutRef.current);
    claimTimeoutRef.current = window.setTimeout(() => {
      if (isMountedRef.current && roomIdRef.current === room.id) setClaiming(false);
    }, 5000);
  };

  const history = drawn.slice(-12).reverse();

  return (
    <div className="mx-auto max-w-md">
      <section className="mb-3 rounded-lg bg-blue-900/70 p-3 text-slate-100" aria-label="Game statistics">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-200">Prize pool</div>
            <div className="mt-1 text-sm font-bold text-white sm:text-base">
              {participants && room?.entry_fee ? `${(participants * Number(room.entry_fee)).toFixed(2)} ብር` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-200">Balls</div>
            <div className="mt-1 text-sm font-bold text-white sm:text-base">{drawn.length}/75</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-200">Players</div>
            <div className="mt-1 text-sm font-bold text-white sm:text-base">{participants || 0}</div>
          </div>
        </div>
      </section>
      <div className="mb-3 flex items-center justify-between">
        <button onClick={onBack} className="text-amber-400">{t('back')}</button>
        <span className="text-sm text-slate-400">{t('room')}: {room.id.slice(0, 8)}</span>
      </div>

      <div className="mb-3 rounded bg-slate-800 p-3 text-center">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{t('players')}: {participants}</span>
          <span className={connected ? 'text-emerald-400' : 'text-red-400'}>
            {connected ? 'Connected' : 'Reconnecting...'}
          </span>
        </div>
        <div className="mt-1 text-3xl font-bold text-amber-400">{lastNumber || '-'}</div>
        <div className="text-xs text-slate-400">{t('numberDrawn')}</div>
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {history.map((n, i) => (
            <span key={`${n}-${i}`} className="rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-300">
              {n}
            </span>
          ))}
        </div>
      </div>

      {status === 'WAITING' ? (
        <div className="space-y-3">
          <CardSelectionBoard roomId={room.id} socket={socket} onSelectionChange={setSelectedCards} />
          <div className="space-y-3">
            {patternError && <div className="rounded bg-red-900/40 p-2 text-xs text-red-200">{patternError}</div>}
            <PatternPicker
              availablePatterns={availablePatterns}
              selectedPatterns={selectedPatterns}
              onSelectionChange={handlePatternChange}
              disabled={status !== 'WAITING'}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)]">
          <NumberChart drawn={drawn} latest={lastNumber} />
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
              <LatestCalledBall number={lastNumber} />
              <div className="rounded-lg bg-slate-800 p-3">
                <div className="mb-2 text-sm font-semibold text-slate-200">Recent calls</div>
                <div className="flex flex-wrap gap-2">
                  {drawn.slice(0, -1).slice(-4).reverse().map((number, index) => (
                    <span
                      key={`${number}-${index}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-slate-100"
                    >
                      {number >= 1 && number <= 15 ? 'B' : number <= 30 ? 'I' : number <= 45 ? 'N' : number <= 60 ? 'G' : 'O'}{number}
                    </span>
                  ))}
                  {drawn.length <= 1 && <span className="text-xs text-slate-400">No recent calls yet.</span>}
                </div>
                <div className="mt-3 text-xs text-slate-400">
                  {drawn.length}/75 called
                  {participants ? ` · ${participants} players` : ''}
                </div>
              </div>
            </div>
            {Array.isArray(selectedCards[0]?.card || cardState) && (
              <BingoCard card={selectedCards[0]?.card || cardState} drawn={drawn} />
            )}
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {status === 'WAITING' && (
          <div className="space-y-2">
            <div className="text-xs text-slate-300 text-center">
              {patternReadyCount} / {patternTotalCount} players have picked patterns
            </div>
            <button
              onClick={startGame}
              disabled={starting || !connected || patternReadyCount < patternTotalCount || patternTotalCount === 0}
              className="w-full rounded bg-emerald-600 py-2 font-bold disabled:opacity-60"
            >
              {starting ? '...' : t('startGame')}
            </button>
          </div>
        )}
        {status === 'RUNNING' && (
          <button
            onClick={claim}
            disabled={claiming || !connected}
            className="flex-1 rounded bg-amber-500 py-2 font-bold text-slate-900 disabled:opacity-60"
          >
            {claiming ? '...' : t('claimBingo')}
          </button>
        )}
      </div>

      {claimMsg && <div className="mt-2 text-center text-amber-300" aria-live="polite">{claimMsg}</div>}
      {status === 'CANCELLED' && (
        <div className="mt-3 text-center">
          <button onClick={onBack} className="rounded bg-slate-700 px-4 py-2 font-bold text-slate-100">
            {t('back')}
          </button>
        </div>
      )}

      <AnimatePresence>
        {winner && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          >
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="w-full max-w-sm rounded-xl bg-slate-800 p-6 text-center">
              <h2 className="mb-2 text-2xl font-bold text-amber-400">
                {winner?.isCurrentUser ? t('youWon') : 'Game finished'}
              </h2>
              {!winner?.isCurrentUser && winner?.userId !== undefined && winner?.userId !== null && (
                <p className="mb-3 text-sm text-slate-300">Winner: player #{winner.userId}</p>
              )}
              {winner?.isCurrentUser && payout && (
                <div className="mb-4 space-y-1 text-sm text-slate-300">
                  <div>{t('winnerPayout')}: {payout.winnerPayout} {isDemo ? 'virtual ETB' : 'ብር'}</div>
                  <div>{t('platformFee')}: {payout.platformFee} {isDemo ? 'virtual ETB' : 'ብር'}</div>
                  <div>{t('agentCommission')}: {payout.agentCommission} {isDemo ? 'virtual ETB' : 'ብር'}</div>
                  <div className="font-bold">{t('totalPool') || 'Pool'}: {payout.totalPool} {isDemo ? 'virtual ETB' : 'ብር'}</div>
                </div>
              )}
              <button onClick={onBack} className="rounded bg-amber-500 px-4 py-2 font-bold text-slate-900">{t('back')}</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

