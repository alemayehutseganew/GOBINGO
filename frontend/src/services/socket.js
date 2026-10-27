import { io } from 'socket.io-client';
import TelegramAuth from './telegram.js';

let socket = null;

const SocketService = {
  connect() {
    const initData = TelegramAuth.initData() || localStorage.getItem('initData') || '';
    const devUser = localStorage.getItem('devUser');
    const url = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || window.location.origin;
    const auth = {};
    if (initData) auth.initData = initData;
    if (devUser && !initData) auth.devUser = devUser;
    socket = io(url, { auth, transports: ['websocket', 'polling'] });
    return socket;
  },
  get() { return socket; },
  disconnect() { if (socket) { socket.disconnect(); socket = null; } },
};

export default SocketService;

