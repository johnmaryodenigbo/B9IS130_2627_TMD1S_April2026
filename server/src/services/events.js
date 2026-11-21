import { EventEmitter } from 'node:events';

// App-wide event bus.
//   checked          { monitor, check }        after every check (worker or "check now")
//   status-change    { monitor, from, to, check } when a monitor goes up/down
//   monitor-saved    { monitor }               an admin created/edited/paused a monitor
//   monitor-deleted  { id, isPublic }          an admin deleted a monitor
//   incident-changed { incident }             an incident was opened/emailed/acknowledged/resolved
//   monitor-updated  { monitor }               other field changes (e.g. user report counts)
//   reports-change   { monitor, from, to, recent, threshold, categories }  user reports spiked / calmed down
//   ssl-warning      { monitor, daysRemaining, threshold }  certificate reached an expiry threshold (0 = expired)
//   status-change:relayed                      same as status-change, re-emitted by realtime/changeRelay.js
//                                              when the worker runs in another process (UI only, never alerts)
// Listeners: realtime/socket.js (live dashboard), and phase 5 email alerts.
export const monitorEvents = new EventEmitter();
