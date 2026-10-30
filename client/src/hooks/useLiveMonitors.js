import { useCallback, useEffect, useRef } from 'react';
import { useSocketEvent } from './useSocket.js';
import { getSocket } from '../realtime/socket.js';

/**
 * Keeps a list of monitors in sync with live server events.
 * - monitor:update  -> merge into the list (keeps uptime/history), or refetch if it's new
 * - monitor:removed -> drop it
 * - monitor:status  -> refetch soon (uptime % and history change)
 * - reconnect       -> refetch to catch up on anything missed
 */
export function useLiveMonitors({ monitors, setMonitors, refetch, publicOnly = false, onEvent }) {
  const listRef = useRef(monitors);
  listRef.current = monitors;
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const timer = useRef(null);

  // Many events can arrive together; refetch once shortly after the last one.
  const scheduleRefetch = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => refetchRef.current(), 800);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  useSocketEvent('monitor:update', (m) => {
    const list = listRef.current;
    if (!list) return;
    if (publicOnly && m.isPublic === false) {
      setMonitors((l) => l?.filter((x) => x.id !== m.id));
    } else if (list.some((x) => x.id === m.id)) {
      setMonitors((l) => l?.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
    } else {
      scheduleRefetch();
    }
    onEvent?.('update', m);
  });

  useSocketEvent('monitor:removed', ({ id }) => {
    setMonitors((l) => l?.filter((x) => x.id !== id));
    onEvent?.('removed', { id });
  });

  useSocketEvent('monitor:status', (e) => {
    scheduleRefetch();
    onEvent?.('status', e);
  });

  // Skip the first connect (the page just loaded its data), refetch on later reconnects.
  const connectedBefore = useRef(getSocket().connected);
  useSocketEvent('connect', () => {
    if (connectedBefore.current) scheduleRefetch();
    connectedBefore.current = true;
  });
}
