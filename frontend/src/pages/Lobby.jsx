import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api.js';
import SocketService from '../services/socket.js';

function formatBalance(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '0.00';
  return Number(value).toFixed(2);
}

export default function Lobby({ user, isDemo, onJoinRoom }) {
  const [joiningStake, setJoiningStake] = useState(null);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(true);

  const mountedRef = useRef(true);

  const refreshBalance = async () => {
    setLoadingBalance(true);
    try {
      const d = await api.balance();
      if (!mountedRef.current) return;
      setBalance(Number(d.balance));
    } catch (e) {
      if (!mountedRef.current) return;
    } finally {
      if (mountedRef.current) setLoadingBalance(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    refreshBalance();
    return () => { mountedRef.current = false; };
  }, []);

  const levelForStake = (stake) => {
    if (stake <= 10) return 1;
    if (stake <= 25) return 2;
    return 3;
  };

  const handleJoinRoom = async (stake) => {
    if (joiningStake !== null) return;
    setError('');
    setJoiningStake(stake);
    try {
      const level = levelForStake(stake);
      const res = await api.joinRoom(level);
      if (!res || !res.room) throw new Error('Invalid room response');
      SocketService.connect();
      await refreshBalance();
      onJoinRoom(res.room, res.card);
    } catch (e) {
      setError(e?.message || 'Error');
    } finally {
      setJoiningStake(null);
    }
  };

  const handleDevTopup = async () => {
    try {
      const res = await api.devTopup();
      if (res?.newBalance !== undefined) setBalance(Number(res.newBalance));
      else await refreshBalance();
    } catch (e) {
      setError(e?.message || 'Error');
    }
  };

  const walletBalance = loadingBalance ? 0 : (balance || 0);

  const stakes = [10, 20, 30, 50, 80, 100, 150, 200];

  return (
    <div className="min-h-screen bg-[#112A46] text-white font-sans flex flex-col">
      <div className="flex items-center justify-between p-3 bg-[#0B1D33]">
        <button className="bg-yellow-400 text-black w-8 h-8 rounded-full font-bold">?</button>
        <div className="w-12 h-6 bg-gray-600 rounded-full flex items-center px-1">
          <div className="w-4 h-4 bg-white rounded-full"></div>
        </div>
        <div className="bg-white text-black px-4 py-1 rounded-full flex items-center font-bold text-sm">
          <span className="text-green-600 mr-2">₿</span> ETB {formatBalance(walletBalance)}
        </div>
        <button onClick={handleDevTopup} className="ml-2 rounded bg-yellow-400 px-2 py-1 text-xs font-bold text-black">
          Dev Top-Up
        </button>
      </div>

      <div className="flex justify-between items-center p-4">
        <div className="text-3xl text-white">≡</div>
        <div className="text-xl font-bold italic">Ethio Bingo</div>
      </div>

      <div className="flex-1 px-4 pb-10">
        <h2 className="text-center text-2xl font-bold mb-6 mt-4">Please Choose Your Stake</h2>

        <div className="grid grid-cols-4 bg-[#2D2A4A] p-3 rounded-t-lg font-bold text-center text-sm">
          <div className="text-left">Stake</div>
          <div>Active</div>
          <div>Possible Win</div>
          <div>Join</div>
        </div>

        <div className="flex flex-col gap-2 mt-2">
          {stakes.map((stake) => (
            <div key={stake} className="relative grid grid-cols-4 items-center bg-gradient-to-r from-[#4B6B8B] to-[#2A4B6E] p-2 rounded-md">
              {stake <= 20 && (
                <div className="absolute -left-2 top-2 bg-yellow-400 text-black text-[10px] font-bold px-2 py-0.5 rounded transform -rotate-12">
                  Bonus
                </div>
              )}

              <div className="text-green-400 font-bold pl-2 text-lg">{stake} birr</div>
              <div className="text-center text-gray-300 font-semibold">None</div>
              <div className="text-center text-gray-300">⇧ -</div>
              <div className="flex justify-end pr-2">
                <button
                  onClick={() => handleJoinRoom(stake)}
                  disabled={joiningStake !== null}
                  className="bg-white text-black font-bold py-1 px-4 rounded shadow hover:bg-gray-200 disabled:opacity-60"
                >
                  {joiningStake === stake ? '...' : 'Join >>'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && <div className="mt-3 rounded bg-red-900/40 p-2 text-red-300">{error}</div>}
        {isDemo && (
          <p className="mt-3 text-xs text-slate-400">
            Virtual entry fees only. No real money is used.
          </p>
        )}
      </div>
    </div>
  );
}

