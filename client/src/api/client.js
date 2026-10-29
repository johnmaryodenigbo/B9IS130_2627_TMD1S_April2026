// Small fetch wrapper: sends the auth cookie and turns API errors into exceptions.
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = data.details;
    throw err;
  }
  return data;
}

export const authApi = {
  login: (email, password) => api('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => api('/auth/logout', { method: 'POST' }),
  me: () => api('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    api('/auth/me/password', { method: 'PATCH', body: { currentPassword, newPassword } }),
};

export const usersApi = {
  list: () => api('/users'),
  create: (user) => api('/users', { method: 'POST', body: user }),
  update: (id, changes) => api(`/users/${id}`, { method: 'PATCH', body: changes }),
  remove: (id) => api(`/users/${id}`, { method: 'DELETE' }),
};

export const monitorsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
    return api(`/monitors${qs ? `?${qs}` : ''}`);
  },
  create: (monitor) => api('/monitors', { method: 'POST', body: monitor }),
  update: (id, changes) => api(`/monitors/${id}`, { method: 'PATCH', body: changes }),
  remove: (id) => api(`/monitors/${id}`, { method: 'DELETE' }),
};

export const publicApi = {
  monitors: () => api('/public/monitors'),
};

export const ROLES = { ADMIN: 'admin', SRE: 'sre' };

// Keep in sync with server/src/utils/monitorOptions.js
export const HTTP_METHODS = ['GET', 'HEAD', 'POST'];
export const ENVIRONMENTS = ['production', 'staging', 'qa', 'development'];
export const INTERVALS = [
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
];
