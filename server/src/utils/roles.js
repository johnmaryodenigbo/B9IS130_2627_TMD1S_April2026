// Anonymous visitors have no account: they only use public routes (dashboard).
export const ROLES = Object.freeze({
  ADMIN: 'admin', // manages inventory (monitored apps) and users
  SRE: 'sre',     // on-call engineer, receives downtime email alerts
});

export const ROLE_VALUES = Object.values(ROLES);
