import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AUTH_COOKIE } from '../middleware/auth.js';
import { monitorEvents } from '../services/events.js';
import { toStaffView, toPublicView } from '../services/monitorViews.js';

// Every socket joins PUBLIC; logged-in admins/SREs also join STAFF and get full details.
export const ROOMS = { PUBLIC: 'public', STAFF: 'staff' };

/**
 * Attaches Socket.IO to the HTTP server and pushes monitor changes to browsers.
 *
 * Events sent to clients:
 *   monitor:update   a monitor changed (after every check, or edited by an admin)
 *   monitor:status   a monitor went up/down  { monitor, from, to, check? }
 *   monitor:removed  a monitor was deleted (or made private, for anonymous viewers)  { id }
 */
export function initRealtime(httpServer, { logger = console } = {}) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: env.clientUrl, credentials: true },
  });

  // Read the same httpOnly auth cookie the REST API uses.
  io.engine.use(cookieParser());

  io.use(async (socket, next) => {
    socket.data.user = null;
    const token = socket.request.cookies?.[AUTH_COOKIE] || socket.handshake.auth?.token;
    if (token) {
      try {
        const payload = jwt.verify(token, env.jwtSecret);
        const user = await User.findById(payload.sub).lean();
        if (user?.isActive) socket.data.user = { id: String(user._id), name: user.name, role: user.role };
      } catch {
        // invalid/expired token: treat as anonymous
      }
    }
    next(); // anonymous visitors are welcome, they just get the public view
  });

  io.on('connection', (socket) => {
    socket.join(ROOMS.PUBLIC);
    if (socket.data.user) socket.join(ROOMS.STAFF);
    socket.emit('hello', { authenticated: Boolean(socket.data.user), role: socket.data.user?.role ?? null });
  });

  // Staff are in both rooms; .except(STAFF) stops them getting the public copy as well.
  const toAnonymous = () => io.to(ROOMS.PUBLIC).except(ROOMS.STAFF);

  function broadcastMonitor(monitor) {
    io.to(ROOMS.STAFF).emit('monitor:update', toStaffView(monitor));
    if (monitor.isPublic) toAnonymous().emit('monitor:update', toPublicView(monitor));
    else toAnonymous().emit('monitor:removed', { id: String(monitor._id ?? monitor.id) });
  }

  const onChecked = ({ monitor }) => broadcastMonitor(monitor);
  const onSaved = ({ monitor }) => broadcastMonitor(monitor);
  const onDeleted = ({ id }) => io.emit('monitor:removed', { id });
  const onStatusChange = ({ monitor, from, to, check }) => {
    io.to(ROOMS.STAFF).emit('monitor:status', { monitor: toStaffView(monitor), from, to, check });
    if (monitor.isPublic) toAnonymous().emit('monitor:status', { monitor: toPublicView(monitor), from, to });
  };

  monitorEvents.on('checked', onChecked);
  monitorEvents.on('monitor-saved', onSaved);
  monitorEvents.on('monitor-deleted', onDeleted);
  monitorEvents.on('status-change', onStatusChange);
  monitorEvents.on('status-change:relayed', onStatusChange); // from changeRelay.js

  logger.log?.('[realtime] Socket.IO ready on /socket.io');

  return {
    io,
    // Stops listening and closes all sockets (and the HTTP server it is attached to).
    async close() {
      monitorEvents.off('checked', onChecked);
      monitorEvents.off('monitor-saved', onSaved);
      monitorEvents.off('monitor-deleted', onDeleted);
      monitorEvents.off('status-change', onStatusChange);
      monitorEvents.off('status-change:relayed', onStatusChange);
      await new Promise((resolve) => io.close(() => resolve()));
    },
  };
}
