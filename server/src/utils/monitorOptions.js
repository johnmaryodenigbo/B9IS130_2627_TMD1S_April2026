// Allowed values for monitors, shared by the model and the validators.
export const HTTP_METHODS = ['GET', 'HEAD', 'POST'];
export const ENVIRONMENTS = ['production', 'staging', 'qa', 'development'];

// pending = not checked yet, up/down = set by the monitoring worker (phase 3), paused = disabled by an admin
export const MONITOR_STATUSES = ['pending', 'up', 'down', 'paused'];

export const LIMITS = {
  intervalSeconds: { min: 30, max: 3600, default: 60 },
  timeoutMs: { min: 1000, max: 30000, default: 10000 },
};
