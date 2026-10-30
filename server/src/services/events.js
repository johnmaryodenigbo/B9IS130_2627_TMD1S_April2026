import { EventEmitter } from 'node:events';

// App-wide event bus. The worker emits 'status-change' when a monitor goes up/down.
export const monitorEvents = new EventEmitter();
