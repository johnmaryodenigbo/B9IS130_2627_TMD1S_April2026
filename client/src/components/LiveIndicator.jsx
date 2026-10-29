import { useSocketConnected } from '../hooks/useSocket.js';

// Small "● Live" badge that shows whether real-time updates are flowing.
export default function LiveIndicator() {
  const connected = useSocketConnected();
  return (
    <span className={`live ${connected ? 'live-on' : 'live-off'}`}
      title={connected ? 'Receiving live updates' : 'Reconnecting… showing the last loaded data'}>
      <span className="live-dot" /> {connected ? 'Live' : 'Reconnecting…'}
    </span>
  );
}
