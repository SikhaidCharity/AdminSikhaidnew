// The one place the browser talks to the admin data store.
// When Firebase is connected, these functions are what changes; the pages stay the same.

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return data;
}

const send = (method, url, body) =>
  request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const adminApi = {
  me: () => request('/api/local/auth'),
  signIn: (email, password) => send('POST', '/api/local/auth', { email, password }),
  signOut: () => request('/api/local/auth', { method: 'DELETE' }),
  updateAccount: (changes) => send('PUT', '/api/local/account', changes),
  users: {
    list: () => request('/api/local/users'),
    create: (user) => send('POST', '/api/local/users', user),
    update: (id, changes) => send('PUT', `/api/local/users/${encodeURIComponent(id)}`, changes),
    remove: (id) => request(`/api/local/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  list: (collection) => request(`/api/local/${collection}`),
  create: (collection, item) => send('POST', `/api/local/${collection}`, item),
  update: (collection, id, item) => send('PUT', `/api/local/${collection}/${encodeURIComponent(id)}`, item),
  remove: (collection, id) => request(`/api/local/${collection}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  saveAll: (collection, data) => send('PUT', `/api/local/${collection}`, data),
  certificates: {
    status: () => request('/api/local/80g'),
    create: (entry) => send('POST', '/api/local/80g', entry),
    send: (id) => request(`/api/local/80g/${encodeURIComponent(id)}/send`, { method: 'POST' }),
    pdfUrl: (id, view = false) => `/api/local/80g/${encodeURIComponent(id)}/pdf${view ? '?view=1' : ''}`,
  },
  receipts: {
    send: (id) => request(`/api/local/receipts/${encodeURIComponent(id)}/send`, { method: 'POST' }),
    pdfUrl: (id, view = false) => `/api/local/receipts/${encodeURIComponent(id)}/pdf${view ? '?view=1' : ''}`,
  },
  donorDetails: (id) => request(`/api/local/donor-details/${encodeURIComponent(id)}`),
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/api/local/upload', { method: 'POST', body: form });
  },
};
