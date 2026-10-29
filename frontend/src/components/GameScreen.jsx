import { useEffect, useState } from 'react';
import SocketService from '../services/socket.js';
import GameResultModal from './GameResultModal.jsx';

function useSearchParams() {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  return [params];
}

const speakNumber = (number, letter) => {
  if (!window.speechSynthesis) return;

  window.speechSynthesis.cancel();

  const text = `${letter} ${number}`;
  const utterance = new SpeechSynthesisUtterance(text);

  utterance.lang = 'am-ET';
  utterance.rate = 0.9;

  window.speechSynthesis.speak(utterance);
};

const letterFor = (n) => {
  if (n >= 1 && n <= 15) return 'B';
  if (n <= 30) return 'I';
  if (n <= 45) return 'N';
  if (n <= 60) return 'G';
  return 'O';
};

const PlayerCard = ({ cardData, calledNumbers, markedNumbers, onDaub }) => {
  const numbers = Array.isArray(cardData?.matrix) ? cardData.matrix : (Array.isArray(cardData?.numbers) ? cardData.numbers : (Array.isArray(cardData?.card) ? cardData.card : []));
  const id = cardData?.id || cardData?.cardId || '?';
  const flat = Array.isArray(numbers) ? (Array.isArray(numbers[0]) ? numbers.flat() : numbers) : [];

  return (
    <div className="bg-[#4a5568] p-4 rounded-xl border-2 border-gray-400">
      <div className="text-white text-center mb-2 font-bold">Card No. {id}</div>

      <div className="grid grid-cols-5 gap-1 mb-2">
        {['B', 'I', 'N', 'G', 'O'].map((letter) => (
          <div key={letter} className="text-white font-bold text-center">{letter}</div>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-1">
        {flat.map((num, index) => {
          const isFree = index === 12 || num === 'FREE' || num === 0;
          const isMarked = isFree || (Array.isArray(markedNumbers) && markedNumbers.includes(num));
          const isCalled = Array.isArray(calledNumbers) && calledNumbers.includes(num);

          return (
            <button
              key={index}
              onClick={() => !isFree && onDaub && onDaub(num, isCalled)}
              className={`aspect-square rounded-md flex items-center justify-center font-bold text-lg
                ${isFree ? 'bg-blue-600 text-white' :
                  isMarked ? 'bg-green-600 text-white' : 'bg-white text-black'}`}
            >
              {isFree ? 'F' : num}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const GameScreen = ({
  winAmount = 0,
  calledNumbers: calledNumbersProp = [],
  soundOn = true,
  onSoundToggle,
  latestNumber = null,
  previousBalls = [],
  cards = [],
  markedNumbers: markedNumbersProp = [],
  onDaub,
  onBingo,
  socket: socketProp,
  roomId: propRoomId,
  cardId,
  currentUserId,
  currentUser,
}) => {
  const [searchParams] = useSearchParams();
  const roomId = propRoomId || searchParams.get('roomId') || 'room_10';
  const stakeParam = parseInt(searchParams.get('stake')) || 10;

  const socket = socketProp || SocketService.get() || SocketService.connect();
  const [cardsData, setCardsData] = useState(cards || []);
  
  // Top Bar State
  const [playersCount, setPlayersCount] = useState(0);
  const [stakeAmount, setStakeAmount] = useState(stakeParam);
  const [calledNumbers, setCalledNumbers] = useState(calledNumbersProp);
  const [markedNumbers, setMarkedNumbers] = useState(markedNumbersProp);
  
  // Game State
  const [currentBall, setCurrentBall] = useState(latestNumber);
  const [calledHistory, setCalledHistory] = useState(previousBalls || []);
  const [countdown, setCountdown] = useState(5);
  const [gameStarted, setGameStarted] = useState(false);
  
  // Modals/Validation State
  const [validating, setValidating] = useState(false);
  const [toast, setToast] = useState('');
  const [gameResult, setGameResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  const [sound, setSound] = useState(soundOn);

  // Fetch Cards on Mount
  useEffect(() => {
    const userId = currentUser?.id || currentUserId;
    if (!roomId || !userId) return;
    
    fetch(`${API_URL}/api/rooms/${encodeURIComponent(roomId)}/my-cards?userId=${encodeURIComponent(userId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        console.log('Fetched cards from API:', data);
        if (Array.isArray(data?.cards)) setCardsData(data.cards);
      })
      .catch((err) => console.error('Failed to fetch cards:', err));
  }, [roomId, currentUser, currentUserId]);

  // Socket Listeners & Fake Game Trigger
  useEffect(() => {
    if (!socket) return;

    // Socket Listeners
    const handleNewNumber = (payload) => {
      const num = typeof payload === 'object' && payload !== null ? payload.number : payload;
      const letter = typeof payload === 'object' && payload !== null ? payload.letter : letterFor(num);
      if (num === undefined) return;
      setCurrentBall({ number: num, letter });
      setCalledNumbers((prev) => (prev.includes(num) ? prev : [...prev, num]));
      setCalledHistory((prev) => [...prev.slice(-4), num]);
      speakNumber(num, letter);
    };

    const handleRoomUpdate = (data) => {
      console.log("Room update received:", data);
      if (data.players) setPlayersCount(data.players);
    };

    socket.on('new_number_called', handleNewNumber);
    socket.on('room_update', handleRoomUpdate);

    // Fake Game Loop for Local Testing
    const fakeGameTimer = setTimeout(() => {
      setPlayersCount(2);
      startFakeGame();
    }, 1000);

    return () => {
      socket.off('new_number_called', handleNewNumber);
      socket.off('room_update', handleRoomUpdate);
      clearTimeout(fakeGameTimer);
    };
  }, [socket]);

  const startFakeGame = () => {
    let timeLeft = 5;
    setCountdown(timeLeft);

    const countdownInterval = setInterval(() => {
      timeLeft -= 1;
      setCountdown(timeLeft);

      if (timeLeft <= 0) {
        clearInterval(countdownInterval);
        setGameStarted(true);
        
        const gameInterval = setInterval(() => {
          setCalledNumbers((prev) => {
            if (prev.length >= 75) {
              clearInterval(gameInterval);
              return prev;
            }

            let newNumber;
            do {
              newNumber = Math.floor(Math.random() * 75) + 1;
            } while (prev.includes(newNumber));

            let letter = 'B';
            if (newNumber > 15) letter = 'I';
            if (newNumber > 30) letter = 'N';
            if (newNumber > 45) letter = 'G';
            if (newNumber > 60) letter = 'O';

            setCurrentBall({ number: newNumber, letter });
            setCalledHistory((prev) => [...prev.slice(-4), newNumber]);
            return [...prev, newNumber];
          });
        }, 3000);
      }
    }, 1000);
  };

  const lastFive = calledHistory.slice(-5).reverse();

  const handleDaub = (num) => {
    // If we are testing locally, check the local state. Otherwise, rely on the passed prop.
    const isCalled = calledNumbers.includes(num);
    
    if (!isCalled) {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
      }
      return;
    }
    if (markedNumbers.includes(num)) return;

    setMarkedNumbers((prev) => [...prev, num]);

    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }

    if (onDaub) onDaub(num);
  };

  const handleBingoClick = () => {
    if (validating) return;
    setValidating(true);
    
    if (socket) {
      socket.emit('claim_bingo', { roomId, cardId, markedNumbers });
    } else if (onBingo) {
      onBingo({ roomId, cardId, markedNumbers });
    }
    
    // Simulate backend response for local testing
    setTimeout(() => {
      setValidating(false);
      setGameResult({
        winners: [{ userId: currentUserId || currentUser?.id }],
        payoutPerWinner: 17,
        winningPattern: 'ROW_1'
      });
      setShowResult(true);
    }, 1500);
  };
  
  const columns = [
    { letter: 'B', range: [1, 15] },
    { letter: 'I', range: [16, 30] },
    { letter: 'N', range: [31, 45] },
    { letter: 'G', range: [46, 60] },
    { letter: 'O', range: [61, 75] },
  ];

  return (
    <div className="min-h-screen bg-[#1e3a5f] text-white p-4">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 text-sm font-bold bg-[#112A46] p-2 rounded">
        <div>Win: {winAmount}</div>
        <div>Stake: {stakeAmount}</div>
        <div>Call: {calledNumbers.length}</div>
        <div>Player: {playersCount}</div>
        <button
          onClick={() => {
            setSound((prev) => !prev);
            if (onSoundToggle) onSoundToggle(!sound);
          }}
          className="rounded bg-slate-700 px-3 py-1 hover:bg-slate-600"
        >
          Sound: {sound ? 'On' : 'Off'}
        </button>
      </div>

      {/* Center Ball Area */}
      <div className="flex flex-col items-center gap-4 mb-6">
        <div className={`w-32 h-32 rounded-full flex flex-col items-center justify-center text-4xl font-bold border-4 border-white shadow-lg ${currentBall ? (
          currentBall.letter === 'B' ? 'bg-blue-600' :
          currentBall.letter === 'I' ? 'bg-red-600' :
          currentBall.letter === 'N' ? 'bg-purple-600' :
          currentBall.letter === 'G' ? 'bg-green-600' : 'bg-yellow-600'
        ) : 'bg-gray-500'}`}>
          {currentBall ? (
            <>
              <span className="text-xl">{currentBall.letter}</span>
              <span>{currentBall.number}</span>
            </>
          ) : (
            <span className="text-5xl">{countdown > 0 ? countdown : '-'}</span>
          )}
        </div>
        
        {/* Previous Balls */}
        <div className="flex gap-2 flex-wrap justify-center h-10">
          {lastFive.map((n, index) => (
            <div
              key={`${n}-${index}`}
              className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold shadow"
            >
              {n}
            </div>
          ))}
        </div>
      </div>

      {/* Main Play Area */}
      <div className="flex flex-col lg:flex-row gap-4">
        
        {/* Left Tracker (1-75) */}
        <div className="lg:w-2/5">
          <div className="w-full grid grid-cols-5 gap-1 bg-[#2A4B6E] p-2 rounded-lg">
            {columns.map((col) => (
              <div key={col.letter} className="flex flex-col gap-1">
                <div className="text-center font-bold text-lg mb-1">{col.letter}</div>
                {Array.from({ length: col.range[1] - col.range[0] + 1 }, (_, i) => col.range[0] + i).map((n) => {
                  const called = calledNumbers.includes(n);
                  return (
                    <div
                      key={n}
                      className={`text-center text-sm font-bold rounded py-1 transition-colors ${called ? 'bg-red-500 text-white shadow-inner' : 'bg-[#1e3a5f] text-slate-300'}`}
                    >
                      {n}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Right Player Card */}
        <div className="lg:w-3/5 flex justify-center">
          {cardsData && cardsData.length > 0 && cardsData[0] ? (
            <div className="w-full max-w-sm">
              <PlayerCard 
                cardData={cardsData[0]} 
                calledNumbers={calledNumbers} 
                markedNumbers={markedNumbers} 
                onDaub={handleDaub} 
              />
            </div>
          ) : (
            <div className="bg-[#2A4B6E] p-4 rounded-xl border-2 border-gray-400 w-64">
           <div className="text-white text-center mb-2 font-bold">Card No. ?</div>
           <div className="grid grid-cols-5 gap-1">
             {Array.from({ length: 25 }, (_, i) => i + 1).map((n) => (
               <div key={n} className="aspect-square bg-white text-black rounded flex items-center justify-center font-bold text-xs">
                 {n === 13 ? 'F' : n}
               </div>
             ))}
           </div>
         </div>
          )}
        </div>
      </div>

      {/* Bottom Action Area */}
      <div className="mt-8">
        {toast && (
          <div className="mb-2 rounded bg-red-900/60 p-3 text-center font-bold text-red-100 border border-red-500">{toast}</div>
        )}
        <button
          onClick={handleBingoClick}
          disabled={!gameStarted || validating}
          className="w-full bg-amber-500 text-slate-900 font-bold py-4 rounded-md text-xl shadow-lg disabled:opacity-50 hover:bg-amber-400 transition-colors"
        >
          {validating ? 'Validating...' : 'Bingo'}
        </button>
      </div>

      <GameResultModal
        open={showResult}
        result={gameResult}
        currentUserId={currentUserId || currentUser?.id}
        card={cardsData && cardsData[0]}
        markedNumbers={markedNumbers}
        onPlayAgain={() => {
          setShowResult(false);
          if (onBingo) onBingo();
        }}
      />
    </div>
  );
};

export default GameScreen;