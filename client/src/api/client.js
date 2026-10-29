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

export const ROLES = { ADMIN: 'admin', SRE: 'sre' };
