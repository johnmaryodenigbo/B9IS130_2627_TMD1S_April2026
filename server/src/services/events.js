import { EventEmitter } from 'node:events';

// App-wide event bus. The worker emits 'status-change' when a monitor goes up/down.
// Phase 4 (live dashboard) and phase 5 (email alerts) will listen to it.
export const monitorEvents = new EventEmitter();
