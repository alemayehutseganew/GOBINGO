import { useEffect, useState } from 'react';

const generatePreviewMatrix = (cardId) => {
  const ranges = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];
  const cols = ranges.map((range, colIndex) =>
    Array.from({ length: 5 }, (_, rowIndex) => {
      const span = range[1] - range[0] + 1;
      return range[0] + ((cardId + colIndex * 7 + rowIndex * 3) % span);
    })
  );
  const matrix = [];
  for (let r = 0; r < 5; r += 1) {
    const row = [];
    for (let c = 0; c < 5; c += 1) {
      row.push(cols[c][r]);
    }
    matrix.push(row);
  }
  matrix[2][2] = 'F';
  return matrix;
};

export default function CardSelection({ socket, currentUser, onConfirm, walletBalance = 0, roomId: roomIdProp }) {
  const params = new URLSearchParams(window.location.search);
  const stake = Number(params.get('stake')) || 10;
  const roomId = roomIdProp || `room_${stake}`;

  const [takenCards, setTakenCards] = useState([]);
  const [selectedCards, setSelectedCards] = useState([]);
  const [previewCard, setPreviewCard] = useState(null);
  const [countdownTime, setCountdownTime] = useState(null);

  useEffect(() => {
    if (!socket) return;
    socket.emit('join_room', { roomId, userId: currentUser?.id, stake });

    const handleRoomState = (state) => {
      if (state?.roomId === roomId && Array.isArray(state?.takenCards)) {
        setTakenCards(state.takenCards);
      }
      if (Array.isArray(state?.selectedCards)) {
        setSelectedCards(state.selectedCards);
      }
    };
    socket.on('room_state', handleRoomState);
    socket.on('countdown_tick', (payload) => {
      if (payload && typeof payload.timeLeft === 'number') {
        setCountdownTime(payload.timeLeft);
      }
    });
    socket.on('game_started', () => {
      window.location.assign(`/game?roomId=${encodeURIComponent(roomId)}`);
    });
    return () => {
      socket.off('room_state', handleRoomState);
      socket.off('countdown_tick');
      socket.off('game_started');
    };
  }, [socket, roomId, currentUser?.id, stake]);

  const handleSelect = (cardId) => {
    if (takenCards.includes(cardId)) return;
    if (selectedCards.includes(cardId)) {
      setSelectedCards(selectedCards.filter((id) => id !== cardId));
    } else if (selectedCards.length < 2) {
      setSelectedCards([...selectedCards, cardId]);
    }
  };

const handleSelectCard = handleSelect;


  const handleConfirm = () => {
    if (selectedCards.length === 0) return;
    console.log('Navigating with cards:', selectedCards);
    if (socket) {
      socket.emit('select_cards', { roomId, userId: currentUser?.id, cardIds: selectedCards });
    }
    try {
      sessionStorage.setItem('selectedCardIds', JSON.stringify(selectedCards));
      sessionStorage.setItem('stake', String(stake));
      sessionStorage.setItem('roomId', roomId);
    } catch (e) {}
    if (onConfirm) onConfirm(selectedCards);
  };

  const totalPrice = selectedCards.length * stake;

  return (
    <div className="flex flex-col h-full bg-[#1e3a5f] p-4">
      {countdownTime !== null && (
        <div className="text-center mb-4 text-4xl font-mono font-bold text-[#00FF00]">
          0:{String(countdownTime).padStart(2, '0')}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="text-white text-center font-bold flex-1">
          {stake} Birr Per Card
        </div>
        <button
          type="button"
          className="text-white text-xl"
          aria-label="Shuffle"
          onClick={() => setSelectedCards([])}
        >
          🔀
        </button>
      </div>

      <div className="grid grid-cols-8 gap-2 overflow-y-auto">
        {Array.from({ length: 400 }, (_, i) => i + 1).map((id) => {
          const isTaken = takenCards.includes(id);
          const isSelected = selectedCards.includes(id);
          return (
            <button
              key={id}
              onClick={() => {
                if (isTaken) return;
                setPreviewCard(id);
                handleSelect(id);
              }}
              disabled={isTaken || countdownTime !== null}
              className={`p-2 rounded-md font-bold text-sm transition-all
                ${isTaken ? 'bg-gray-500 text-gray-300 opacity-50 cursor-not-allowed' :
                  isSelected ? 'bg-green-500 text-white' :
                  'bg-white text-gray-800 hover:bg-gray-200'}`}
            >
              {id}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between bg-slate-800 rounded-md p-3">
        <div className="text-white font-bold">Total: {totalPrice} Birr</div>
        <button
          onClick={handleConfirm}
          disabled={selectedCards.length === 0}
          className="bg-white text-black font-bold py-2 px-4 rounded-md disabled:opacity-60"
        >
          Confirm Cards
        </button>
      </div>

      {previewCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl bg-slate-800 p-6 text-slate-100">
            <h2 className="mb-4 text-xl font-bold text-amber-400">Card No. {previewCard}</h2>
            <div className="grid grid-cols-5 gap-1 mb-2">
              {['B', 'I', 'N', 'G', 'O'].map((letter, index) => (
                <div
                  key={letter}
                  className={`text-center font-bold ${
                    index === 0 ? 'text-green-400' :
                    index === 1 ? 'text-yellow-400' :
                    index === 2 ? 'text-red-400' :
                    index === 3 ? 'text-green-400' :
                    'text-red-400'
                  }`}
                >
                  {letter}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-1">
              {generatePreviewMatrix(previewCard).flat().map((value, index) => (
                <div
                  key={index}
                  className={`aspect-square flex items-center justify-center rounded text-sm font-bold ${
                    value === 'F' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-100'
                  }`}
                >
                  {value}
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setPreviewCard(null)}
                className="flex-1 rounded bg-slate-600 py-2 font-bold text-white"
              >
                Go Back
              </button>
              <button
                onClick={() => {
                  setPreviewCard(null);
                  handleConfirm();
                }}
                className="flex-1 rounded bg-amber-500 py-2 font-bold text-slate-900"
              >
                Confirm Cards
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}