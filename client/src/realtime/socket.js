import { io } from 'socket.io-client';

// One shared Socket.IO connection for the whole app (same origin, goes through the Vite proxy in dev).
let socket = null;

export function getSocket() {
  if (!socket) socket = io({ path: '/socket.io', withCredentials: true });
  return socket;
}

// After login/logout the server must re-read the auth cookie, so reconnect.
export function reconnectSocket() {
  if (!socket) return;
  socket.disconnect();
  socket.connect();
}
