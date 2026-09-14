/* =================================================================
   api.js — Typed HTTP client mirroring all /api/v1/* endpoints
   ================================================================= */
const API_BASE = (typeof window !== 'undefined')
  ? (window.location.port === '3000' ? 'http://localhost:4000/api/v1' : `${window.location.origin}/api/v1`)
  : 'http://localhost:4000/api/v1';

function getToken() {
  return localStorage.getItem('pfb_token');
}

async function request(method, path, body = null, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const config = { method, headers };
  if (body) config.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, config);
  const data = await res.json().catch(() => ({ success: false, error: { message: 'Invalid server response' } }));

  if (!res.ok || !data.success) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.code = data?.error?.code;
    err.field = data?.error?.field;
    err.status = res.status;
    throw err;
  }
  return data;
}

const get    = (path)          => request('GET',    path);
const post   = (path, body)    => request('POST',   path, body);
const put    = (path, body)    => request('PUT',    path, body);
const del    = (path)          => request('DELETE', path);

// ── Auth ──────────────────────────────────────────────────────────────────
const auth = {
  login:   (email, password) => post('/auth/login',   { email, password }),
  logout:  ()                => post('/auth/logout'),
  profile: ()                => get('/auth/profile'),
};

// ── Villages ──────────────────────────────────────────────────────────────
const villages = {
  list:    (q = {}) => get(`/villages?${new URLSearchParams(q)}`),
  getById: (id)    => get(`/villages/${id}`),
  create:  (data)   => post('/villages', data),
  update:  (id, d)  => put(`/villages/${id}`, d),
  delete:  (id)     => del(`/villages/${id}`),
};

// ── Customers ─────────────────────────────────────────────────────────────
const customers = {
  list:    (q = {}) => get(`/customers?${new URLSearchParams(q)}`),
  getById: (id)     => get(`/customers/${id}`),
  history: (id, q)  => get(`/customers/${id}/history?${new URLSearchParams(q || {})}`),
  create:  (data)   => post('/customers', data),
  update:  (id, d)  => put(`/customers/${id}`, d),
  delete:  (id)     => del(`/customers/${id}`),
};

// ── Flowers ───────────────────────────────────────────────────────────────
const flowers = {
  list:        (q = {}) => get(`/flowers?${new URLSearchParams(q)}`),
  getById:     (id)     => get(`/flowers/${id}`),
  activeRates: ()       => get('/flowers/active-rates'),
  create:      (data)   => post('/flowers', data),
  update:      (id, d)  => put(`/flowers/${id}`, d),
  rates:       (id)     => get(`/flowers/${id}/rates`),
  setRate:     (id, ratePerKg, effectiveFrom) => post(`/flowers/${id}/rates`, { rate_per_kg: ratePerKg, effective_from: effectiveFrom }),
  updateRate:  (id, rateId, d) => put(`/flowers/${id}/rates/${rateId}`, d),
};

// ── Collections ───────────────────────────────────────────────────────────
const collections = {
  list:       (q = {}) => get(`/collections?${new URLSearchParams(q)}`),
  getById:    (id)     => get(`/collections/${id}`),
  create:     (data)   => post('/collections', data),
  update:     (id, d)  => put(`/collections/${id}`, d),
  delete:     (id)     => del(`/collections/${id}`),
  invoiceUrl: (id)     => `${API_BASE}/collections/${id}/invoice.pdf`,
};

// ── Payments ──────────────────────────────────────────────────────────────
const payments = {
  create: (collectionId, data) => post(`/collections/${collectionId}/payments`, data),
  list:   (collectionId)       => get(`/collections/${collectionId}/payments`),
};

// ── Reports ───────────────────────────────────────────────────────────────
const reports = {
  daily:     (q = {}) => get(`/reports/daily?${new URLSearchParams(q)}`),
  weekly:    (q = {}) => get(`/reports/weekly?${new URLSearchParams(q)}`),
  monthly:   (q = {}) => get(`/reports/monthly?${new URLSearchParams(q)}`),
  farmer:    (q = {}) => get(`/reports/farmer?${new URLSearchParams(q)}`),
  village:   (q = {}) => get(`/reports/village?${new URLSearchParams(q)}`),
  flower:    (q = {}) => get(`/reports/flower?${new URLSearchParams(q)}`),
  payments:  (q = {}) => get(`/reports/payments?${new URLSearchParams(q)}`),
  exportUrl: (type, q = {}) => `${API_BASE}/reports/${type}/export.csv?${new URLSearchParams(q)}`,
};

// ── Dashboard ─────────────────────────────────────────────────────────────
const dashboard = {
  summary: () => get('/dashboard/summary'),
  charts:  () => get('/dashboard/charts'),
};

// ── Users ─────────────────────────────────────────────────────────────────
const users = {
  list:   (q = {}) => get(`/users?${new URLSearchParams(q)}`),
  create: (data)   => post('/users', data),
  update: (id, d)  => put(`/users/${id}`, d),
  delete: (id)     => del(`/users/${id}`),
};

window.API = { auth, villages, customers, flowers, collections, payments, reports, dashboard, users, getToken, API_BASE };
