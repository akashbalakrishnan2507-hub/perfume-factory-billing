/* =================================================================
   app.js — Single-page application router, global utilities,
            Toast, Modal, Sidebar, and all page renderers
   ================================================================= */

// ── Toast System ──────────────────────────────────────────────────────────
const Toast = {
  show(message, type = 'success', duration = 3500) {
    const icons = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type] || '💬'}</span><span class="toast-msg">${message}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      el.style.transition = 'all .3s';
      setTimeout(() => el.remove(), 300);
    }, duration);
  },
  success: (msg) => Toast.show(msg, 'success'),
  error:   (msg) => Toast.show(msg, 'error', 5000),
  warn:    (msg) => Toast.show(msg, 'warn'),
  info:    (msg) => Toast.show(msg, 'info'),
};

// ── Modal System ──────────────────────────────────────────────────────────
const Modal = {
  open(title, bodyHtml, footerHtml = '', size = '') {
    const overlay = document.getElementById('modal-overlay');
    const modal   = document.getElementById('modal');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML  = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml;
    modal.className = `modal ${size}`;
    overlay.classList.add('open');
  },
  close() {
    document.getElementById('modal-overlay').classList.remove('open');
  },
};

// ── Money Formatting ──────────────────────────────────────────────────────
function fmtRupees(val) {
  const num = parseFloat(val || 0);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function paymentBadge(status) {
  if (status === 'PAID')            return '<span class="badge badge-paid">✓ Paid</span>';
  if (status === 'PARTIALLY_PAID')  return '<span class="badge badge-partial">◑ Partial</span>';
  return '<span class="badge badge-unpaid">○ Unpaid</span>';
}

function statusBadge(status) {
  return status === 'active'
    ? '<span class="badge badge-active">Active</span>'
    : '<span class="badge badge-inactive">Inactive</span>';
}

function roleBadge(role) {
  return role === 'admin'
    ? '<span class="badge badge-admin">Admin</span>'
    : '<span class="badge badge-staff">Staff</span>';
}

// ── Pagination Builder ────────────────────────────────────────────────────
function buildPagination(meta, onPage) {
  const { page, pageSize, total } = meta;
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return '';
  const from = (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);

  let btnHtml = `<button class="page-btn" onclick="${onPage}(${page - 1})" ${page <= 1 ? 'disabled' : ''}>‹</button>`;
  const start = Math.max(1, page - 2), end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) {
    btnHtml += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="${onPage}(${i})">${i}</button>`;
  }
  btnHtml += `<button class="page-btn" onclick="${onPage}(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>›</button>`;

  return `<div class="pagination">
    <span class="pagination-info">Showing ${from}–${to} of ${total}</span>
    <div class="pagination-btns">${btnHtml}</div>
  </div>`;
}

// ── SPA Router ────────────────────────────────────────────────────────────
const App = {
  currentPage: null,

  navigate(page) {
    // Auth guards
    if (page === 'login') {
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('app-shell').style.display = 'none';
      return;
    }
    if (!Auth.isLoggedIn()) {
      this.navigate('login');
      return;
    }
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';

    // Switch active page
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));

    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) {
      pageEl.classList.add('active');
      const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
      if (navEl) navEl.classList.add('active');
      this.currentPage = page;

      // Update topbar title
      const titles = {
        dashboard: '🌸 Dashboard',
        collections: '📦 Collections / Procurement',
        bills: '🧾 Bills & Invoices',
        payments: '💳 Payments',
        customers: '👨‍🌾 Customers (Farmers)',
        villages: '🏘️ Villages',
        flowers: '🌺 Flowers',
        rates: '📊 Flower Rates',
        reports: '📈 Reports',
        settings: '⚙️ Settings & Staff',
      };
      document.getElementById('topbar-title').textContent = titles[page] || page;

      // Call page loader
      const loaders = {
        dashboard:   loadDashboard,
        collections: loadCollections,
        bills:       loadBills,
        payments:    loadPaymentsPage,
        customers:   loadCustomers,
        villages:    loadVillages,
        flowers:     loadFlowers,
        rates:       loadRates,
        reports:     loadReports,
        settings:    loadSettings,
      };
      if (loaders[page]) loaders[page]();
    }
  },

  init() {
    // Bind nav items
    document.querySelectorAll('.nav-item[data-page]').forEach((el) => {
      el.addEventListener('click', () => this.navigate(el.dataset.page));
    });

    // Sidebar toggle
    document.getElementById('topbar-toggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('collapsed');
    });

    // Modal close
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) Modal.close();
    });
    document.getElementById('modal-close').addEventListener('click', () => Modal.close());

    // Populate user info in sidebar
    this.refreshUserUI();

    // Route to starting page
    if (Auth.isLoggedIn()) {
      this.navigate('dashboard');
    } else {
      this.navigate('login');
    }
  },

  refreshUserUI() {
    const user = Auth.getUser();
    if (!user) return;
    const initials = user.name?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'U';
    document.getElementById('sidebar-avatar').textContent = initials;
    document.getElementById('sidebar-name').textContent = user.name || user.email;
    document.getElementById('sidebar-role').textContent = user.role;
    // Hide admin-only items for staff
    if (user.role !== 'admin') {
      document.querySelectorAll('[data-admin-only]').forEach((el) => el.classList.add('hidden'));
    }
  },
};

// ══════════════════════════════════════════════════════════════════════════
//  LOGIN PAGE
// ══════════════════════════════════════════════════════════════════════════
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const email = document.getElementById('login-email').value;
  const pass  = document.getElementById('login-password').value;
  btn.textContent = 'Signing in…'; btn.disabled = true;

  try {
    const res = await API.auth.login(email, pass);
    Auth.setSession(res.data.token, res.data.user);
    App.refreshUserUI();
    App.navigate('dashboard');
    Toast.success(`Welcome back, ${res.data.user.name}! 🌸`);
  } catch (err) {
    Toast.error(err.message);
    btn.textContent = 'Sign In'; btn.disabled = false;
  }
}

async function handleLogout() {
  try { await API.auth.logout(); } catch {}
  Auth.clearSession();
  App.navigate('login');
  Toast.info('Logged out successfully');
}

function fillDemo(role) {
  document.getElementById('login-email').value    = role === 'admin' ? 'admin@perfumefactory.com' : 'staff@perfumefactory.com';
  document.getElementById('login-password').value = role === 'admin' ? 'admin123' : 'staff123';
}

// ══════════════════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════════════════
async function loadDashboard() {
  const el = document.getElementById('page-dashboard');
  el.innerHTML = `<div class="text-center" style="padding:60px"><div class="spinner"></div></div>`;
  try {
    const [summRes, chartRes] = await Promise.all([API.dashboard.summary(), API.dashboard.charts()]);
    const s = summRes.data;
    const c = chartRes.data;

    el.innerHTML = `
      <!-- Stats Grid -->
      <div class="stats-grid">
        <div class="stat-card" style="--card-accent: var(--color-accent)">
          <div class="stat-icon" style="background:#fef3c7">🧾</div>
          <div class="stat-body">
            <div class="stat-label">Today's Bills</div>
            <div class="stat-value">${s.today.bills}</div>
            <div class="stat-sub">${fmtRupees(s.today.amount_rupees)} collected</div>
          </div>
        </div>
        <div class="stat-card" style="--card-accent: var(--color-primary)">
          <div class="stat-icon" style="background:#d1fae5">💰</div>
          <div class="stat-body">
            <div class="stat-label">Month Revenue</div>
            <div class="stat-value">${fmtRupees(s.month.amount_rupees)}</div>
            <div class="stat-sub">${s.month.bills} bills this month</div>
          </div>
        </div>
        <div class="stat-card" style="--card-accent: var(--color-success)">
          <div class="stat-icon" style="background:#d1fae5">✅</div>
          <div class="stat-body">
            <div class="stat-label">Month Collected</div>
            <div class="stat-value">${fmtRupees(s.month.paid_rupees)}</div>
            <div class="stat-sub">${fmtRupees(s.month.pending_rupees)} pending</div>
          </div>
        </div>
        <div class="stat-card" style="--card-accent: var(--color-danger)">
          <div class="stat-icon" style="background:#fee2e2">⏳</div>
          <div class="stat-body">
            <div class="stat-label">Pending Bills</div>
            <div class="stat-value">${s.month.unpaid_count + s.month.partial_count}</div>
            <div class="stat-sub">${s.month.unpaid_count} unpaid · ${s.month.partial_count} partial</div>
          </div>
        </div>
        <div class="stat-card" style="--card-accent: var(--color-info)">
          <div class="stat-icon" style="background:#e0f2fe">👨‍🌾</div>
          <div class="stat-body">
            <div class="stat-label">Active Farmers</div>
            <div class="stat-value">${s.totals.active_customers}</div>
            <div class="stat-sub">${s.totals.active_flowers} flower types</div>
          </div>
        </div>
      </div>

      <!-- Charts Row -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
        <!-- Monthly Trend -->
        <div class="card">
          <div class="section-header" style="margin-bottom:16px">
            <div>
              <div class="section-title">Monthly Trend</div>
              <div class="section-subtitle">Last 6 months collection</div>
            </div>
          </div>
          <div class="chart-wrap" id="chart-monthly">${renderMonthlyChart(c.monthly_trend)}</div>
        </div>

        <!-- Flower Breakdown -->
        <div class="card">
          <div class="section-header" style="margin-bottom:16px">
            <div>
              <div class="section-title">This Month by Flower</div>
              <div class="section-subtitle">Procurement value breakdown</div>
            </div>
          </div>
          <div id="chart-flowers">${renderFlowerChart(c.flower_breakdown)}</div>
        </div>
      </div>

      <!-- Village Breakdown -->
      <div class="card">
        <div class="section-header">
          <div>
            <div class="section-title">Village Breakdown</div>
            <div class="section-subtitle">This month's procurement by village</div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="App.navigate('reports')">Full Report →</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Village</th><th>District</th><th>Bills</th><th>Amount</th></tr></thead>
            <tbody>
              ${c.village_breakdown.map((v) => `
                <tr>
                  <td><strong>${v.village_name}</strong></td>
                  <td class="td-muted">${v.district || '-'}</td>
                  <td>${v.bill_count}</td>
                  <td class="text-primary font-bold">${fmtRupees(v.total_amount_rupees)}</td>
                </tr>
              `).join('') || '<tr><td colspan="4" class="text-center td-muted">No data yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="card"><p class="text-danger">Failed to load dashboard: ${err.message}</p></div>`;
  }
}

function renderMonthlyChart(data) {
  if (!data || !data.length) return '<p class="td-muted text-center" style="padding:40px">No data yet</p>';
  const max = Math.max(...data.map((d) => d.total_amount_rupees || 0), 1);
  return data.map((d) => {
    const h = Math.round((d.total_amount_rupees / max) * 200);
    return `<div class="chart-bar">
      <div class="chart-bar-val">${fmtRupees(d.total_amount_rupees).replace('₹','₹')}</div>
      <div class="chart-bar-fill" style="height:${h}px"></div>
      <div class="chart-bar-label">${d.month_label}</div>
    </div>`;
  }).join('');
}

function renderFlowerChart(data) {
  if (!data || !data.length) return '<p class="td-muted text-center" style="padding:40px">No data yet</p>';
  const colors = ['#0f2e24','#1a4a38','#d97706','#059669','#0284c7','#7c3aed'];
  const total  = data.reduce((s, d) => s + (d.total_amount_rupees || 0), 0) || 1;
  return `<div style="display:flex;flex-direction:column;gap:10px">
    ${data.slice(0, 6).map((f, i) => {
      const pct = Math.round((f.total_amount_rupees / total) * 100);
      return `<div>
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
          <span style="font-weight:500">${f.flower_name}</span>
          <span style="color:var(--color-text-muted)">${fmtRupees(f.total_amount_rupees)} (${pct}%)</span>
        </div>
        <div style="height:8px;background:var(--color-border);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${colors[i % colors.length]};border-radius:4px;transition:width .6s"></div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════════
//  COLLECTIONS
// ══════════════════════════════════════════════════════════════════════════
let collectionsState = { page: 1, filters: {} };

async function loadCollections(page = 1) {
  collectionsState.page = page;
  const el = document.getElementById('page-collections');
  const params = { page, pageSize: 15, ...collectionsState.filters };

  el.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">Collections / Procurement</div>
        <div class="section-subtitle">Record flower procurement from farmers</div>
      </div>
      <button class="btn btn-accent" id="btn-new-collection">＋ New Collection</button>
    </div>
    <div class="card mb-4">
      <div class="filters-bar">
        <input class="filter-input" id="col-search" placeholder="Search bill number or farmer…" value="${params.search || ''}" oninput="debounce(() => { collectionsState.filters.search = this.value; loadCollections(1); }, 400)()">
        <select class="filter-select" onchange="collectionsState.filters.payment_status = this.value; loadCollections(1)">
          <option value="">All Status</option>
          <option value="UNPAID" ${params.payment_status === 'UNPAID' ? 'selected' : ''}>Unpaid</option>
          <option value="PARTIALLY_PAID" ${params.payment_status === 'PARTIALLY_PAID' ? 'selected' : ''}>Partially Paid</option>
          <option value="PAID" ${params.payment_status === 'PAID' ? 'selected' : ''}>Paid</option>
        </select>
        <input type="date" class="filter-input" value="${params.date_from || ''}" onchange="collectionsState.filters.date_from = this.value; loadCollections(1)" title="From date">
        <input type="date" class="filter-input" value="${params.date_to || ''}" onchange="collectionsState.filters.date_to = this.value; loadCollections(1)" title="To date">
        <button class="btn btn-ghost btn-sm" onclick="collectionsState.filters = {}; loadCollections(1)">Clear</button>
      </div>
    </div>
    <div class="card" id="collections-table-wrap">
      <div class="text-center" style="padding:40px"><div class="spinner"></div></div>
    </div>`;

  document.getElementById('btn-new-collection').addEventListener('click', showNewCollectionModal);

  try {
    const res = await API.collections.list(params);
    const { data, meta } = res;

    document.getElementById('collections-table-wrap').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Bill #</th><th>Date</th><th>Farmer</th><th>Village</th><th>Amount</th><th>Paid</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${data.length === 0 ? `<tr><td colspan="8" class="text-center td-muted" style="padding:40px">No collections found</td></tr>` :
            data.map((c) => `
              <tr>
                <td><span class="font-mono font-bold">${c.bill_number}</span></td>
                <td class="td-muted">${new Date(c.collection_date).toLocaleDateString('en-IN')}</td>
                <td><strong>${c.customer_name}</strong><br><span class="td-muted" style="font-size:12px">${c.customer_mobile || ''}</span></td>
                <td class="td-muted">${c.village_name || '-'}</td>
                <td class="font-bold text-primary">${fmtRupees(c.total_amount_rupees)}</td>
                <td class="text-success">${fmtRupees(c.paid_amount_rupees)}</td>
                <td>${paymentBadge(c.payment_status)}</td>
                <td>
                  <div class="td-actions">
                    <button class="btn btn-ghost btn-sm btn-icon" title="View" onclick="viewCollection(${c.id})">👁</button>
                    <a href="${API.collections.invoiceUrl(c.id)}" target="_blank" class="btn btn-outline btn-sm btn-icon" title="PDF Invoice">🖨</a>
                    ${c.payment_status !== 'PAID' ? `<button class="btn btn-accent btn-sm" onclick="showPaymentModal(${c.id}, '${c.bill_number}', ${c.total_amount_rupees}, ${c.paid_amount_rupees})">Pay</button>` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${buildPagination(meta, 'loadCollections')}
    `;
  } catch (err) {
    document.getElementById('collections-table-wrap').innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

// New Collection Modal
async function showNewCollectionModal() {
  // Load customers and flowers
  let customersData = [], flowersData = [], villagesData = [];
  try {
    const [cr, fr, vr] = await Promise.all([
      API.customers.list({ pageSize: 200, status: 'active' }),
      API.flowers.list({ pageSize: 200, status: 'active' }),
      API.villages.list({ pageSize: 200, status: 'active' }),
    ]);
    customersData = cr.data || [];
    flowersData   = fr.data || [];
    villagesData  = vr.data || [];
  } catch (err) {
    Toast.error('Failed to load form data: ' + err.message); return;
  }

  const today = new Date().toISOString().split('T')[0];
  const customerOpts = customersData.map((c) => `<option value="${c.id}" data-village="${c.village_id}">${c.name} — ${c.mobile}</option>`).join('');
  const flowerOpts   = flowersData.map((f) => `<option value="${f.id}" data-rate="${f.current_rate_rupees || 0}" data-rate-id="${f.rate_id || ''}">${f.name}${f.current_rate_rupees ? ` (₹${f.current_rate_rupees}/kg)` : ' (no rate set)'}</option>`).join('');
  const villageOpts  = villagesData.map((v) => `<option value="${v.id}">${v.name} — ${v.district}</option>`).join('');

  Modal.open('New Flower Collection', `
    <form id="collection-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Farmer / Customer <span class="required">*</span></label>
          <select class="form-control" id="col-customer" required onchange="autoFillVillage(this)">
            <option value="">— Select farmer —</option>${customerOpts}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Village <span class="required">*</span></label>
          <select class="form-control" id="col-village" required>
            <option value="">— Select village —</option>${villageOpts}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Collection Date <span class="required">*</span></label>
          <input type="date" class="form-control" id="col-date" value="${today}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Remarks</label>
          <input type="text" class="form-control" id="col-remarks" placeholder="Optional notes…">
        </div>
      </div>

      <hr class="divider">
      <div class="section-header" style="margin-bottom:10px">
        <strong style="color:var(--color-primary)">🌸 Flower Items</strong>
        <button type="button" class="btn btn-outline btn-sm" onclick="addItemRow()">＋ Add Flower</button>
      </div>
      <div id="item-rows"></div>
      <div style="text-align:right;margin-top:8px">
        <strong style="font-size:16px;color:var(--color-primary)">Total: <span id="col-total">₹0.00</span></strong>
      </div>

      <hr class="divider">
      <div class="form-row">
        <div class="form-group mb-0">
          <label class="form-label">Discount (₹)</label>
          <input type="number" class="form-control" id="col-discount" value="0" min="0" step="0.01" oninput="recalcTotal()">
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Other Charges (₹)</label>
          <input type="number" class="form-control" id="col-other" value="0" min="0" step="0.01" oninput="recalcTotal()">
        </div>
      </div>
    </form>
  `, `
    <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
    <button class="btn btn-accent" id="btn-submit-collection" onclick="submitCollection()">🧾 Create Bill</button>
  `, 'modal-lg');

  // Store flower data for rate lookup
  window._flowersForModal = flowersData;
  window._villagesForModal = villagesData;
  window._customersForModal = customersData;

  addItemRow();
}

function autoFillVillage(selectEl) {
  const opt = selectEl.options[selectEl.selectedIndex];
  const villageId = opt?.dataset?.village;
  if (villageId) {
    const villageSelect = document.getElementById('col-village');
    villageSelect.value = villageId;
  }
}

let itemRowCount = 0;
function addItemRow() {
  itemRowCount++;
  const flowers = window._flowersForModal || [];
  const flowerOpts = flowers.map((f) =>
    `<option value="${f.id}" data-rate="${f.current_rate_rupees || 0}">${f.name}${f.current_rate_rupees ? ` (₹${f.current_rate_rupees}/kg)` : ''}</option>`
  ).join('');

  const row = document.createElement('div');
  row.className = 'item-row';
  row.id = `item-row-${itemRowCount}`;
  row.innerHTML = `
    <select class="form-control" id="item-flower-${itemRowCount}" onchange="updateItemRate(${itemRowCount})">
      <option value="">— Select flower —</option>${flowerOpts}
    </select>
    <input type="number" class="form-control" id="item-weight-${itemRowCount}" placeholder="Weight kg" min="0.001" step="0.001" oninput="calcItemAmount(${itemRowCount})">
    <input type="number" class="form-control" id="item-rate-${itemRowCount}" placeholder="₹/kg" step="0.01" readonly style="background:var(--color-surface-2)">
    <div class="item-amount" id="item-amt-${itemRowCount}">₹0.00</div>
    <button type="button" class="item-remove" onclick="removeItemRow(${itemRowCount})" title="Remove">✕</button>
  `;
  document.getElementById('item-rows').appendChild(row);
}

function removeItemRow(id) {
  const row = document.getElementById(`item-row-${id}`);
  if (row) row.remove();
  recalcTotal();
}

function updateItemRate(id) {
  const sel = document.getElementById(`item-flower-${id}`);
  const opt = sel.options[sel.selectedIndex];
  const rate = opt?.dataset?.rate || 0;
  document.getElementById(`item-rate-${id}`).value = rate;
  calcItemAmount(id);
}

function calcItemAmount(id) {
  const weight = parseFloat(document.getElementById(`item-weight-${id}`)?.value || 0);
  const rate   = parseFloat(document.getElementById(`item-rate-${id}`)?.value || 0);
  const amount = weight * rate;
  document.getElementById(`item-amt-${id}`).textContent = fmtRupees(amount);
  recalcTotal();
}

function recalcTotal() {
  const rows = document.querySelectorAll('[id^="item-row-"]');
  let subtotal = 0;
  rows.forEach((row) => {
    const id = row.id.replace('item-row-', '');
    const weight = parseFloat(document.getElementById(`item-weight-${id}`)?.value || 0);
    const rate   = parseFloat(document.getElementById(`item-rate-${id}`)?.value || 0);
    subtotal += weight * rate;
  });
  const discount     = parseFloat(document.getElementById('col-discount')?.value || 0);
  const otherCharges = parseFloat(document.getElementById('col-other')?.value || 0);
  const total = subtotal - discount + otherCharges;
  const el = document.getElementById('col-total');
  if (el) el.textContent = fmtRupees(Math.max(0, total));
}

async function submitCollection() {
  const btn = document.getElementById('btn-submit-collection');
  btn.disabled = true; btn.textContent = 'Creating…';

  const customer_id    = document.getElementById('col-customer').value;
  const village_id     = document.getElementById('col-village').value;
  const collection_date = document.getElementById('col-date').value;
  const remarks        = document.getElementById('col-remarks').value;
  const discount       = parseFloat(document.getElementById('col-discount').value || 0);
  const other_charges  = parseFloat(document.getElementById('col-other').value || 0);

  if (!customer_id || !village_id) {
    Toast.error('Please select a farmer and village'); btn.disabled = false; btn.textContent = '🧾 Create Bill'; return;
  }

  const rows = document.querySelectorAll('[id^="item-row-"]');
  const items = [];
  for (const row of rows) {
    const id = row.id.replace('item-row-', '');
    const flower_id  = document.getElementById(`item-flower-${id}`)?.value;
    const weight_kg  = parseFloat(document.getElementById(`item-weight-${id}`)?.value || 0);
    if (!flower_id || !weight_kg) continue;
    items.push({ flower_id: parseInt(flower_id), weight_kg });
  }

  if (items.length === 0) {
    Toast.error('Please add at least one flower item'); btn.disabled = false; btn.textContent = '🧾 Create Bill'; return;
  }

  try {
    const res = await API.collections.create({ customer_id: parseInt(customer_id), village_id: parseInt(village_id), collection_date, items, discount, other_charges, remarks });
    Modal.close();
    Toast.success(`Bill ${res.data.bill_number} created! Total: ${fmtRupees(res.data.total_amount_rupees)}`);
    loadCollections(1);
  } catch (err) {
    Toast.error(err.message);
    btn.disabled = false; btn.textContent = '🧾 Create Bill';
  }
}

async function viewCollection(id) {
  try {
    const res = await API.collections.getById(id);
    const c = res.data;
    Modal.open(`Bill: ${c.bill_number}`, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div><strong>Farmer:</strong> ${c.customer_name}<br><span class="td-muted">${c.customer_mobile || ''}</span></div>
        <div><strong>Village:</strong> ${c.village_name || '-'}</div>
        <div><strong>Date:</strong> ${new Date(c.collection_date).toLocaleDateString('en-IN')}</div>
        <div><strong>Status:</strong> ${paymentBadge(c.payment_status)}</div>
      </div>
      <div class="table-wrap" style="margin-bottom:16px">
        <table>
          <thead><tr><th>Flower</th><th>Weight (kg)</th><th>Rate (₹/kg)</th><th>Amount</th></tr></thead>
          <tbody>
            ${c.items.map((i) => `<tr><td><strong>${i.flower_name}</strong>${i.local_name ? `<br><span class="td-muted">${i.local_name}</span>` : ''}</td><td>${i.weight_kg.toFixed(3)}</td><td>${fmtRupees(i.rate_per_kg_rupees)}</td><td class="font-bold text-primary">${fmtRupees(i.amount_rupees)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="text-align:right;padding:12px;background:var(--color-surface-2);border-radius:var(--radius-md)">
        <div class="td-muted" style="margin-bottom:4px">Discount: ${fmtRupees(c.discount_rupees)} | Other: ${fmtRupees(c.other_charges_rupees)}</div>
        <div style="font-size:18px;font-weight:800;color:var(--color-primary)">Total: ${fmtRupees(c.total_amount_rupees)}</div>
        <div class="text-success" style="font-weight:600">Paid: ${fmtRupees(c.paid_amount_rupees)}</div>
        <div class="text-danger" style="font-weight:600">Pending: ${fmtRupees(c.pending_amount_rupees)}</div>
      </div>
      ${c.payments.length > 0 ? `
        <div style="margin-top:16px">
          <strong style="color:var(--color-primary);font-size:14px">Payment History</strong>
          <div class="table-wrap" style="margin-top:8px">
            <table>
              <thead><tr><th>#</th><th>Date</th><th>Mode</th><th>Reference</th><th>Amount</th></tr></thead>
              <tbody>${c.payments.map((p, i) => `<tr><td>${i+1}</td><td>${new Date(p.paid_at).toLocaleDateString('en-IN')}</td><td>${p.payment_mode}</td><td class="td-muted">${p.reference_number || '-'}</td><td class="font-bold text-success">${fmtRupees(p.amount_rupees)}</td></tr>`).join('')}</tbody>
            </table>
          </div>
        </div>
      ` : ''}
      ${c.remarks ? `<div style="margin-top:12px;padding:10px;background:var(--color-surface-2);border-radius:var(--radius-md);font-size:13px"><strong>Remarks:</strong> ${c.remarks}</div>` : ''}
    `, `
      <a href="${API.collections.invoiceUrl(id)}" target="_blank" class="btn btn-outline">🖨 Print Invoice</a>
      ${c.payment_status !== 'PAID' ? `<button class="btn btn-accent" onclick="Modal.close(); showPaymentModal(${c.id}, '${c.bill_number}', ${c.total_amount_rupees}, ${c.paid_amount_rupees})">💳 Record Payment</button>` : ''}
      <button class="btn btn-ghost" onclick="Modal.close()">Close</button>
    `, 'modal-lg');
  } catch (err) {
    Toast.error(err.message);
  }
}

// ── Payment Modal ──────────────────────────────────────────────────────────
function showPaymentModal(collectionId, billNumber, totalRupees, paidRupees) {
  const pending = totalRupees - paidRupees;
  Modal.open(`Record Payment — ${billNumber}`, `
    <div style="background:var(--color-surface-2);border-radius:var(--radius-md);padding:14px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span class="td-muted">Total Amount:</span> <strong>${fmtRupees(totalRupees)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span class="td-muted">Already Paid:</span> <strong class="text-success">${fmtRupees(paidRupees)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span class="td-muted">Pending:</span> <strong class="text-danger">${fmtRupees(pending)}</strong>
      </div>
    </div>
    <form id="payment-form">
      <div class="form-group">
        <label class="form-label">Amount (₹) <span class="required">*</span></label>
        <input type="number" class="form-control" id="pmt-amount" placeholder="Enter amount" min="0.01" max="${pending}" step="0.01" value="${pending.toFixed(2)}" required>
        <div class="form-hint">Maximum: ${fmtRupees(pending)}</div>
      </div>
      <div class="form-row">
        <div class="form-group mb-0">
          <label class="form-label">Payment Mode</label>
          <select class="form-control" id="pmt-mode">
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="CHEQUE">Cheque</option>
            <option value="UPI">UPI</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Reference Number</label>
          <input type="text" class="form-control" id="pmt-ref" placeholder="Cheque no / UTR / UPI ref…">
        </div>
      </div>
    </form>
  `, `
    <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
    <button class="btn btn-accent" id="btn-submit-pmt" onclick="submitPayment(${collectionId})">💳 Record Payment</button>
  `);
}

async function submitPayment(collectionId) {
  const btn = document.getElementById('btn-submit-pmt');
  btn.disabled = true; btn.textContent = 'Processing…';
  const amount = parseFloat(document.getElementById('pmt-amount').value);
  const payment_mode = document.getElementById('pmt-mode').value;
  const reference_number = document.getElementById('pmt-ref').value;

  try {
    const res = await API.payments.create(collectionId, { amount, payment_mode, reference_number });
    Modal.close();
    Toast.success(`Payment of ${fmtRupees(amount)} recorded! Status: ${res.data.collection_status.replace('_', ' ')}`);
    if (App.currentPage === 'collections') loadCollections(collectionsState.page);
    if (App.currentPage === 'bills')       loadBills(billsState.page);
  } catch (err) {
    Toast.error(err.message);
    btn.disabled = false; btn.textContent = '💳 Record Payment';
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  BILLS (alias of collections with invoice focus)
// ══════════════════════════════════════════════════════════════════════════
let billsState = { page: 1, filters: {} };
async function loadBills(page = 1) { billsState.page = page; await loadCollections(page); }

// ══════════════════════════════════════════════════════════════════════════
//  PAYMENTS PAGE
// ══════════════════════════════════════════════════════════════════════════
async function loadPaymentsPage(page = 1) {
  const el = document.getElementById('page-payments');
  el.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">Payment Records</div>
        <div class="section-subtitle">All payment transactions across all bills</div>
      </div>
    </div>
    <div class="card" id="payments-table-wrap"><div class="text-center" style="padding:40px"><div class="spinner"></div></div></div>`;

  try {
    const res = await API.reports.payments({ page, pageSize: 20 });
    const { data } = res.data;

    document.getElementById('payments-table-wrap').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Bill #</th><th>Date</th><th>Farmer</th><th>Village</th><th>Total</th><th>Paid</th><th>Pending</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${data.map((r) => `
              <tr>
                <td><span class="font-mono font-bold">${r.bill_number}</span></td>
                <td class="td-muted">${new Date(r.collection_date).toLocaleDateString('en-IN')}</td>
                <td>${r.customer_name}</td>
                <td class="td-muted">${r.village_name || '-'}</td>
                <td class="font-bold">${fmtRupees(r.total_amount_rupees)}</td>
                <td class="text-success">${fmtRupees(r.paid_amount_rupees)}</td>
                <td class="${r.pending_amount_rupees > 0 ? 'text-danger' : 'text-success'}">${fmtRupees(r.pending_amount_rupees)}</td>
                <td>${paymentBadge(r.payment_status)}</td>
                <td>${r.payment_status !== 'PAID' ? `<button class="btn btn-accent btn-sm" onclick="App.navigate('collections')">Pay</button>` : '—'}</td>
              </tr>
            `).join('') || '<tr><td colspan="9" class="text-center td-muted" style="padding:40px">No payment records yet</td></tr>'}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    document.getElementById('payments-table-wrap').innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  CUSTOMERS
// ══════════════════════════════════════════════════════════════════════════
let customersState = { page: 1 };
async function loadCustomers(page = 1) {
  customersState.page = page;
  const el = document.getElementById('page-customers');
  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">Customers (Farmers)</div><div class="section-subtitle">Manage farmer and supplier records</div></div>
      <button class="btn btn-accent" onclick="showCustomerModal()">＋ Add Farmer</button>
    </div>
    <div class="card" id="customers-table-wrap"><div class="text-center" style="padding:40px"><div class="spinner"></div></div></div>`;

  try {
    const res = await API.customers.list({ page, pageSize: 20 });
    const { data, meta } = res;
    document.getElementById('customers-table-wrap').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Mobile</th><th>Village</th><th>Bank</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${data.map((c) => `
              <tr>
                <td><strong>${c.name}</strong></td>
                <td class="font-mono">${c.mobile}</td>
                <td class="td-muted">${c.village_name || '-'}<br><span style="font-size:11px">${c.district || ''}</span></td>
                <td class="td-muted" style="font-size:12px">${c.bank_name || '-'}<br>${c.account_number ? '•••' + c.account_number.slice(-4) : ''}</td>
                <td>${statusBadge(c.status)}</td>
                <td><div class="td-actions">
                  <button class="btn btn-ghost btn-sm" onclick="viewCustomerHistory(${c.id}, '${c.name}')">📋 History</button>
                  <button class="btn btn-outline btn-sm" onclick="showCustomerModal(${JSON.stringify(c).replace(/"/g,'&quot;')})">Edit</button>
                </div></td>
              </tr>
            `).join('') || '<tr><td colspan="6" class="text-center td-muted" style="padding:40px">No customers yet</td></tr>'}
          </tbody>
        </table>
      </div>
      ${buildPagination(meta, 'loadCustomers')}`;
  } catch (err) {
    document.getElementById('customers-table-wrap').innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

async function showCustomerModal(existing = null) {
  const villagesRes = await API.villages.list({ pageSize: 200, status: 'active' });
  const villageOpts = (villagesRes.data || []).map((v) => `<option value="${v.id}" ${existing?.village_id === v.id ? 'selected' : ''}>${v.name} — ${v.district}</option>`).join('');

  Modal.open(existing ? 'Edit Farmer' : 'Add New Farmer', `
    <form id="customer-form">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Full Name <span class="required">*</span></label>
          <input type="text" class="form-control" id="c-name" value="${existing?.name || ''}" required></div>
        <div class="form-group"><label class="form-label">Mobile <span class="required">*</span></label>
          <input type="tel" class="form-control" id="c-mobile" value="${existing?.mobile || ''}" required></div>
      </div>
      <div class="form-group"><label class="form-label">Village <span class="required">*</span></label>
        <select class="form-control" id="c-village" required><option value="">— Select village —</option>${villageOpts}</select></div>
      <div class="form-group"><label class="form-label">Address</label>
        <textarea class="form-control" id="c-address" rows="2">${existing?.address || ''}</textarea></div>
      <div class="form-row-3">
        <div class="form-group"><label class="form-label">Bank Name</label><input type="text" class="form-control" id="c-bank" value="${existing?.bank_name || ''}"></div>
        <div class="form-group"><label class="form-label">Account Number</label><input type="text" class="form-control" id="c-acc" value="${existing?.account_number || ''}"></div>
        <div class="form-group"><label class="form-label">IFSC Code</label><input type="text" class="form-control" id="c-ifsc" value="${existing?.ifsc_code || ''}"></div>
      </div>
    </form>
  `, `
    <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
    <button class="btn btn-accent" onclick="saveCustomer(${existing?.id || 'null'})">Save</button>
  `);
}

async function saveCustomer(id) {
  const data = {
    name: document.getElementById('c-name').value,
    mobile: document.getElementById('c-mobile').value,
    village_id: parseInt(document.getElementById('c-village').value),
    address: document.getElementById('c-address').value,
    bank_name: document.getElementById('c-bank').value,
    account_number: document.getElementById('c-acc').value,
    ifsc_code: document.getElementById('c-ifsc').value,
  };
  try {
    if (id) await API.customers.update(id, data);
    else     await API.customers.create(data);
    Modal.close();
    Toast.success(id ? 'Customer updated' : 'Customer created');
    loadCustomers(customersState.page);
  } catch (err) { Toast.error(err.message); }
}

async function viewCustomerHistory(id, name) {
  try {
    const res = await API.customers.history(id);
    const { data, summary } = res;
    Modal.open(`${name} — Procurement History`, `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
        <div style="background:var(--color-surface-2);border-radius:var(--radius-md);padding:14px;text-align:center">
          <div class="td-muted" style="font-size:12px">Total Billed</div>
          <div style="font-weight:800;color:var(--color-primary)">${fmtRupees(summary.total_billed_rupees)}</div>
        </div>
        <div style="background:var(--color-success-bg);border-radius:var(--radius-md);padding:14px;text-align:center">
          <div class="td-muted" style="font-size:12px">Total Paid</div>
          <div style="font-weight:800;color:var(--color-success)">${fmtRupees(summary.total_paid_rupees)}</div>
        </div>
        <div style="background:var(--color-danger-bg);border-radius:var(--radius-md);padding:14px;text-align:center">
          <div class="td-muted" style="font-size:12px">Pending</div>
          <div style="font-weight:800;color:var(--color-danger)">${fmtRupees(summary.total_pending_rupees)}</div>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Bill #</th><th>Date</th><th>Amount</th><th>Paid</th><th>Status</th></tr></thead>
          <tbody>${data.map((c) => `
            <tr>
              <td class="font-mono font-bold">${c.bill_number}</td>
              <td class="td-muted">${new Date(c.collection_date).toLocaleDateString('en-IN')}</td>
              <td class="font-bold">${fmtRupees(c.total_amount_rupees)}</td>
              <td class="text-success">${fmtRupees(c.paid_amount_rupees)}</td>
              <td>${paymentBadge(c.payment_status)}</td>
            </tr>`).join('') || '<tr><td colspan="5" class="text-center td-muted">No collections yet</td></tr>'}
          </tbody>
        </table>
      </div>
    `, `<button class="btn btn-outline" onclick="Modal.close()">Close</button>`, 'modal-lg');
  } catch (err) { Toast.error(err.message); }
}

// ══════════════════════════════════════════════════════════════════════════
//  VILLAGES
// ══════════════════════════════════════════════════════════════════════════
let villagesState = { page: 1 };
async function loadVillages(page = 1) {
  villagesState.page = page;
  const el = document.getElementById('page-villages');
  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">Villages</div><div class="section-subtitle">Manage village and district records</div></div>
      <button class="btn btn-accent" onclick="showVillageModal()">＋ Add Village</button>
    </div>
    <div class="card" id="villages-table-wrap"><div class="text-center" style="padding:40px"><div class="spinner"></div></div></div>`;

  try {
    const res = await API.villages.list({ page, pageSize: 20 });
    const { data, meta } = res;
    document.getElementById('villages-table-wrap').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Village Name</th><th>District</th><th>State</th><th>Pincode</th><th>Farmers</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${data.map((v) => `
              <tr>
                <td><strong>${v.name}</strong></td>
                <td>${v.district}</td>
                <td class="td-muted">${v.state || 'Tamil Nadu'}</td>
                <td class="font-mono">${v.pincode || '-'}</td>
                <td>${v.customer_count}</td>
                <td>${statusBadge(v.status)}</td>
                <td><div class="td-actions">
                  <button class="btn btn-outline btn-sm" onclick="showVillageModal(${JSON.stringify(v).replace(/"/g,'&quot;')})">Edit</button>
                </div></td>
              </tr>
            `).join('') || '<tr><td colspan="7" class="text-center td-muted" style="padding:40px">No villages yet</td></tr>'}
          </tbody>
        </table>
      </div>
      ${buildPagination(meta, 'loadVillages')}`;
  } catch (err) {
    document.getElementById('villages-table-wrap').innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

function showVillageModal(existing = null) {
  Modal.open(existing ? 'Edit Village' : 'Add Village', `
    <form id="village-form">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Village Name <span class="required">*</span></label>
          <input type="text" class="form-control" id="v-name" value="${existing?.name || ''}" required></div>
        <div class="form-group"><label class="form-label">District <span class="required">*</span></label>
          <input type="text" class="form-control" id="v-district" value="${existing?.district || ''}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">State</label>
          <input type="text" class="form-control" id="v-state" value="${existing?.state || 'Tamil Nadu'}"></div>
        <div class="form-group"><label class="form-label">Pincode</label>
          <input type="text" class="form-control" id="v-pincode" value="${existing?.pincode || ''}"></div>
      </div>
    </form>
  `, `
    <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
    <button class="btn btn-accent" onclick="saveVillage(${existing?.id || 'null'})">Save</button>
  `);
}

async function saveVillage(id) {
  const data = { name: document.getElementById('v-name').value, district: document.getElementById('v-district').value, state: document.getElementById('v-state').value, pincode: document.getElementById('v-pincode').value };
  try {
    if (id) await API.villages.update(id, data);
    else     await API.villages.create(data);
    Modal.close();
    Toast.success(id ? 'Village updated' : 'Village created');
    loadVillages(villagesState.page);
  } catch (err) { Toast.error(err.message); }
}

// ══════════════════════════════════════════════════════════════════════════
//  FLOWERS
// ══════════════════════════════════════════════════════════════════════════
async function loadFlowers() {
  const el = document.getElementById('page-flowers');
  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">Flowers</div><div class="section-subtitle">Manage flower catalogue and varieties</div></div>
      <button class="btn btn-accent" onclick="showFlowerModal()">＋ Add Flower</button>
    </div>
    <div class="card" id="flowers-table-wrap"><div class="text-center" style="padding:40px"><div class="spinner"></div></div></div>`;

  try {
    const res = await API.flowers.list({ pageSize: 100 });
    document.getElementById('flowers-table-wrap').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Local Name</th><th>Botanical</th><th>Unit</th><th>Current Rate</th><th>Rate Since</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${res.data.map((f) => `
              <tr>
                <td><strong>${f.name}</strong></td>
                <td class="td-muted">${f.local_name || '-'}</td>
                <td class="td-muted" style="font-style:italic;font-size:12px">${f.botanical_name || '-'}</td>
                <td>${f.unit}</td>
                <td class="font-bold text-primary">${f.current_rate_rupees ? fmtRupees(f.current_rate_rupees) + '/kg' : '<span class="badge badge-inactive">No rate</span>'}</td>
                <td class="td-muted">${f.rate_effective_from ? new Date(f.rate_effective_from).toLocaleDateString('en-IN') : '-'}</td>
                <td>${statusBadge(f.status)}</td>
                <td><div class="td-actions">
                  <button class="btn btn-outline btn-sm" onclick="showFlowerModal(${JSON.stringify(f).replace(/"/g,'&quot;')})">Edit</button>
                  <button class="btn btn-accent btn-sm" onclick="showSetRateModal(${f.id}, '${f.name}', ${f.current_rate_rupees || 0})">Set Rate</button>
                </div></td>
              </tr>
            `).join('') || '<tr><td colspan="8" class="text-center td-muted" style="padding:40px">No flowers yet</td></tr>'}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    document.getElementById('flowers-table-wrap').innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

function showFlowerModal(existing = null) {
  Modal.open(existing ? 'Edit Flower' : 'Add Flower', `
    <form>
      <div class="form-group"><label class="form-label">Flower Name <span class="required">*</span></label>
        <input type="text" class="form-control" id="fl-name" value="${existing?.name || ''}" placeholder="e.g. Jasmine (Madurai Malli)" required></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Local / Tamil Name</label>
          <input type="text" class="form-control" id="fl-local" value="${existing?.local_name || ''}"></div>
        <div class="form-group"><label class="form-label">Botanical Name</label>
          <input type="text" class="form-control" id="fl-botanical" value="${existing?.botanical_name || ''}" style="font-style:italic"></div>
      </div>
      <div class="form-group"><label class="form-label">Unit</label>
        <select class="form-control" id="fl-unit">
          <option value="kg" ${existing?.unit === 'kg' ? 'selected' : ''}>kg (kilograms)</option>
          <option value="ton" ${existing?.unit === 'ton' ? 'selected' : ''}>ton (metric tons)</option>
        </select></div>
    </form>
  `, `
    <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
    <button class="btn btn-accent" onclick="saveFlower(${existing?.id || 'null'})">Save</button>
  `);
}

async function saveFlower(id) {
  const data = { name: document.getElementById('fl-name').value, local_name: document.getElementById('fl-local').value, botanical_name: document.getElementById('fl-botanical').value, unit: document.getElementById('fl-unit').value };
  try {
    if (id) await API.flowers.update(id, data);
    else     await API.flowers.create(data);
    Modal.close();
    Toast.success(id ? 'Flower updated' : 'Flower created');
    loadFlowers();
  } catch (err) { Toast.error(err.message); }
}

function showSetRateModal(flowerId, flowerName, currentRate) {
  Modal.open(`Set Rate — ${flowerName}`, `
    <div style="background:var(--color-warning-bg);border-left:3px solid var(--color-warning);padding:12px 16px;border-radius:var(--radius-md);margin-bottom:16px;font-size:13px">
      ⚠️ Setting a new rate will close the current rate and open a new one. All existing bills are unaffected — their rates are permanently locked.
    </div>
    <div class="form-group">
      <label class="form-label">Current Rate</label>
      <input type="text" class="form-control" value="${currentRate ? fmtRupees(currentRate) + '/kg' : 'Not set'}" readonly style="background:var(--color-surface-2)">
    </div>
    <div class="form-group">
      <label class="form-label">New Rate (₹ per kg) <span class="required">*</span></label>
      <input type="number" class="form-control" id="new-rate" min="0.01" step="0.01" placeholder="Enter new rate per kg" autofocus>
    </div>
  `, `
    <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
    <button class="btn btn-accent" onclick="submitNewRate(${flowerId})">✓ Update Rate</button>
  `);
}

async function submitNewRate(flowerId) {
  const rate = parseFloat(document.getElementById('new-rate').value);
  if (!rate || rate <= 0) { Toast.error('Please enter a valid rate'); return; }
  try {
    await API.flowers.setRate(flowerId, rate);
    Modal.close();
    Toast.success(`Rate updated to ${fmtRupees(rate)}/kg`);
    loadFlowers();
  } catch (err) { Toast.error(err.message); }
}

// ══════════════════════════════════════════════════════════════════════════
//  RATES (Rate history page)
// ══════════════════════════════════════════════════════════════════════════
async function loadRates() {
  const el = document.getElementById('page-rates');
  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">Flower Rate History</div><div class="section-subtitle">Historical rate timeline for all flowers</div></div>
    </div>
    <div class="card"><div class="text-center" style="padding:40px"><div class="spinner"></div></div></div>`;

  try {
    const flowersRes = await API.flowers.list({ pageSize: 100 });
    const flowers = flowersRes.data || [];

    let html = '';
    for (const f of flowers) {
      const ratesRes = await API.flowers.rates(f.id);
      const rates = ratesRes.data || [];
      html += `
        <div class="card mb-4">
          <div class="section-header">
            <div>
              <div class="section-title">${f.name}</div>
              <div class="section-subtitle">${f.local_name || ''} ${f.botanical_name ? '· ' + f.botanical_name : ''}</div>
            </div>
            <button class="btn btn-accent btn-sm" onclick="showSetRateModal(${f.id}, '${f.name}', ${f.current_rate_rupees || 0})">Update Rate</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Rate (₹/kg)</th><th>From</th><th>To</th><th>Set By</th><th>Status</th></tr></thead>
              <tbody>
                ${rates.map((r) => `
                  <tr>
                    <td class="font-bold" style="font-size:16px">${fmtRupees(r.rate_per_kg_rupees)}<span style="font-size:12px;font-weight:400;color:var(--color-text-muted)">/kg</span></td>
                    <td>${new Date(r.effective_from).toLocaleDateString('en-IN')}</td>
                    <td>${r.effective_to ? new Date(r.effective_to).toLocaleDateString('en-IN') : '<span class="badge badge-active">Current</span>'}</td>
                    <td class="td-muted">${r.created_by_name || '-'}</td>
                    <td>${r.is_active ? '<span class="badge badge-paid">Active</span>' : '<span class="badge badge-inactive">Closed</span>'}</td>
                  </tr>
                `).join('') || '<tr><td colspan="5" class="text-center td-muted">No rates set yet</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>`;
    }

    el.innerHTML = html || '<div class="card"><p class="td-muted text-center" style="padding:40px">No flowers found. Add flowers first.</p></div>';
  } catch (err) {
    el.innerHTML = `<div class="card"><p class="text-danger" style="padding:20px">Error: ${err.message}</p></div>`;
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  REPORTS
// ══════════════════════════════════════════════════════════════════════════
async function loadReports() {
  const el = document.getElementById('page-reports');
  const today = new Date().toISOString().split('T')[0];
  const month = new Date().getMonth() + 1;
  const year  = new Date().getFullYear();

  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">Reports</div><div class="section-subtitle">Procurement and payment analytics</div></div>
    </div>
    
    <!-- Report Type Tabs -->
    <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">
      ${['Daily','Monthly','Village-wise','Flower-wise','Payments'].map((t, i) =>
        `<button class="btn ${i===0?'btn-primary':'btn-outline'} report-tab" data-report="${t.toLowerCase().replace('-','_').replace('wise','wise').replace('payments','payments')}" onclick="switchReport('${t}')">${t}</button>`
      ).join('')}
    </div>

    <!-- Daily Report -->
    <div id="report-Daily" class="report-panel">
      <div class="card mb-4">
        <div class="filters-bar">
          <label class="form-label mb-0">Date:</label>
          <input type="date" class="filter-input" id="rep-daily-date" value="${today}">
          <button class="btn btn-primary btn-sm" onclick="fetchDailyReport()">Generate</button>
          <a id="rep-daily-export" href="${API.reports.exportUrl('daily',{date:today})}" download class="btn btn-outline btn-sm">⬇ Export CSV</a>
        </div>
      </div>
      <div id="rep-daily-results"></div>
    </div>

    <!-- Monthly Report -->
    <div id="report-Monthly" class="report-panel hidden">
      <div class="card mb-4">
        <div class="filters-bar">
          <label class="form-label mb-0">Month:</label>
          <select class="filter-select" id="rep-month">
            ${[1,2,3,4,5,6,7,8,9,10,11,12].map((m)=>`<option value="${m}" ${m===month?'selected':''}>${new Date(2000,m-1).toLocaleString('default',{month:'long'})}</option>`).join('')}
          </select>
          <select class="filter-select" id="rep-year">
            ${[year-1,year,year+1].map((y)=>`<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" onclick="fetchMonthlyReport()">Generate</button>
          <a id="rep-monthly-export" href="${API.reports.exportUrl('monthly',{month,year})}" download class="btn btn-outline btn-sm">⬇ Export CSV</a>
        </div>
      </div>
      <div id="rep-monthly-results"></div>
    </div>

    <!-- Village Report -->
    <div id="report-Village-wise" class="report-panel hidden">
      <div class="card mb-4">
        <div class="filters-bar">
          <input type="date" class="filter-input" id="rep-v-from" title="From">
          <input type="date" class="filter-input" id="rep-v-to" value="${today}" title="To">
          <button class="btn btn-primary btn-sm" onclick="fetchVillageReport()">Generate</button>
          <a id="rep-v-export" href="${API.reports.exportUrl('village')}" download class="btn btn-outline btn-sm">⬇ Export CSV</a>
        </div>
      </div>
      <div id="rep-village-results"></div>
    </div>

    <!-- Flower Report -->
    <div id="report-Flower-wise" class="report-panel hidden">
      <div class="card mb-4">
        <div class="filters-bar">
          <input type="date" class="filter-input" id="rep-f-from" title="From">
          <input type="date" class="filter-input" id="rep-f-to" value="${today}" title="To">
          <button class="btn btn-primary btn-sm" onclick="fetchFlowerReport()">Generate</button>
          <a id="rep-f-export" href="${API.reports.exportUrl('flower')}" download class="btn btn-outline btn-sm">⬇ Export CSV</a>
        </div>
      </div>
      <div id="rep-flower-results"></div>
    </div>

    <!-- Payments Report -->
    <div id="report-Payments" class="report-panel hidden">
      <div class="card mb-4">
        <div class="filters-bar">
          <select class="filter-select" id="rep-pmt-status">
            <option value="">All Status</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIALLY_PAID">Partially Paid</option>
            <option value="PAID">Paid</option>
          </select>
          <input type="date" class="filter-input" id="rep-pmt-from" title="From">
          <input type="date" class="filter-input" id="rep-pmt-to" value="${today}" title="To">
          <button class="btn btn-primary btn-sm" onclick="fetchPaymentsReport()">Generate</button>
          <a id="rep-pmt-export" href="${API.reports.exportUrl('payments')}" download class="btn btn-outline btn-sm">⬇ Export CSV</a>
        </div>
      </div>
      <div id="rep-payments-results"></div>
    </div>`;

  // Auto-load daily report
  fetchDailyReport();
}

function switchReport(name) {
  document.querySelectorAll('.report-panel').forEach((p) => p.classList.add('hidden'));
  document.querySelectorAll('.report-tab').forEach((t) => { t.className = t.className.replace('btn-primary','btn-outline'); });
  document.getElementById(`report-${name}`).classList.remove('hidden');
  event.target.className = event.target.className.replace('btn-outline','btn-primary');
}

async function fetchDailyReport() {
  const date = document.getElementById('rep-daily-date').value;
  document.getElementById('rep-daily-results').innerHTML = '<div class="spinner" style="margin:20px auto"></div>';
  try {
    const res = await API.reports.daily({ date });
    const { summary: s, collections } = res.data;
    document.getElementById('rep-daily-results').innerHTML = `
      <div class="stats-grid" style="margin-bottom:16px">
        <div class="stat-card"><div class="stat-icon" style="background:#fef3c7">🧾</div><div class="stat-body"><div class="stat-label">Bills</div><div class="stat-value">${s.total_bills}</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:#d1fae5">💰</div><div class="stat-body"><div class="stat-label">Total Amount</div><div class="stat-value" style="font-size:18px">${fmtRupees(s.total_amount_rupees)}</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:#d1fae5">✅</div><div class="stat-body"><div class="stat-label">Collected</div><div class="stat-value" style="font-size:18px">${fmtRupees(s.total_paid_rupees)}</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:#fee2e2">⏳</div><div class="stat-body"><div class="stat-label">Pending</div><div class="stat-value" style="font-size:18px;color:var(--color-danger)">${fmtRupees(s.total_pending_rupees)}</div></div></div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Bill #</th><th>Farmer</th><th>Village</th><th>Amount</th><th>Paid</th><th>Status</th></tr></thead>
            <tbody>${collections.map((c) => `<tr><td class="font-mono font-bold">${c.bill_number}</td><td>${c.customer_name}</td><td class="td-muted">${c.village_name || '-'}</td><td class="font-bold">${fmtRupees(c.total_amount_rupees)}</td><td class="text-success">${fmtRupees(c.paid_amount_rupees)}</td><td>${paymentBadge(c.payment_status)}</td></tr>`).join('') || '<tr><td colspan="6" class="text-center td-muted" style="padding:30px">No collections for this date</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
    document.getElementById('rep-daily-export').href = API.reports.exportUrl('daily', { date });
  } catch (err) {
    document.getElementById('rep-daily-results').innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

async function fetchMonthlyReport() {
  const month = document.getElementById('rep-month').value;
  const year  = document.getElementById('rep-year').value;
  document.getElementById('rep-monthly-results').innerHTML = '<div class="spinner" style="margin:20px auto"></div>';
  try {
    const res = await API.reports.monthly({ month, year });
    const { summary: s, daily } = res.data;
    document.getElementById('rep-monthly-results').innerHTML = `
      <div class="stats-grid" style="margin-bottom:16px">
        <div class="stat-card"><div class="stat-icon" style="background:#fef3c7">🧾</div><div class="stat-body"><div class="stat-label">Total Bills</div><div class="stat-value">${s.total_bills}</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:#d1fae5">💰</div><div class="stat-body"><div class="stat-label">Total Amount</div><div class="stat-value" style="font-size:18px">${fmtRupees(s.total_amount_rupees)}</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:#d1fae5">✅</div><div class="stat-body"><div class="stat-label">Collected</div><div class="stat-value" style="font-size:18px">${fmtRupees(s.total_paid_rupees)}</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:#fee2e2">⏳</div><div class="stat-body"><div class="stat-label">Pending</div><div class="stat-value" style="font-size:18px;color:var(--color-danger)">${fmtRupees(s.total_pending_rupees)}</div></div></div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table><thead><tr><th>Date</th><th>Bills</th><th>Amount</th><th>Collected</th></tr></thead>
          <tbody>${daily.map((d) => `<tr><td>${new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</td><td>${d.bill_count}</td><td class="font-bold">${fmtRupees(d.total_amount_rupees)}</td><td class="text-success">${fmtRupees(d.paid_amount_rupees)}</td></tr>`).join('') || '<tr><td colspan="4" class="text-center td-muted" style="padding:30px">No data</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  } catch (err) {
    document.getElementById('rep-monthly-results').innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

async function fetchVillageReport() {
  const from = document.getElementById('rep-v-from').value;
  const to   = document.getElementById('rep-v-to').value;
  document.getElementById('rep-village-results').innerHTML = '<div class="spinner" style="margin:20px auto"></div>';
  try {
    const res = await API.reports.village({ from, to });
    document.getElementById('rep-village-results').innerHTML = `
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Village</th><th>District</th><th>Bills</th><th>Amount</th><th>Paid</th><th>Pending</th></tr></thead>
        <tbody>${res.data.data.map((v) => `<tr><td><strong>${v.village_name}</strong></td><td class="td-muted">${v.district}</td><td>${v.bill_count}</td><td class="font-bold">${fmtRupees(v.total_amount_rupees)}</td><td class="text-success">${fmtRupees(v.paid_amount_rupees)}</td><td class="text-danger">${fmtRupees(v.pending_amount_rupees)}</td></tr>`).join('') || '<tr><td colspan="6" class="text-center td-muted" style="padding:30px">No data</td></tr>'}</tbody>
      </table></div></div>`;
  } catch (err) {
    document.getElementById('rep-village-results').innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

async function fetchFlowerReport() {
  const from = document.getElementById('rep-f-from').value;
  const to   = document.getElementById('rep-f-to').value;
  document.getElementById('rep-flower-results').innerHTML = '<div class="spinner" style="margin:20px auto"></div>';
  try {
    const res = await API.reports.flower({ from, to });
    document.getElementById('rep-flower-results').innerHTML = `
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Flower</th><th>Bills</th><th>Weight (kg)</th><th>Amount</th></tr></thead>
        <tbody>${res.data.data.map((f) => `<tr><td><strong>${f.flower_name}</strong>${f.local_name?`<br><span class="td-muted">${f.local_name}</span>`:''}</td><td>${f.bill_count}</td><td>${f.total_weight_kg}</td><td class="font-bold text-primary">${fmtRupees(f.total_amount_rupees)}</td></tr>`).join('') || '<tr><td colspan="4" class="text-center td-muted" style="padding:30px">No data</td></tr>'}</tbody>
      </table></div></div>`;
  } catch (err) {
    document.getElementById('rep-flower-results').innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

async function fetchPaymentsReport() {
  const status = document.getElementById('rep-pmt-status').value;
  const from   = document.getElementById('rep-pmt-from').value;
  const to     = document.getElementById('rep-pmt-to').value;
  document.getElementById('rep-payments-results').innerHTML = '<div class="spinner" style="margin:20px auto"></div>';
  try {
    const res = await API.reports.payments({ status, from, to });
    const { summary: s, data } = res.data;
    document.getElementById('rep-payments-results').innerHTML = `
      <div class="stats-grid" style="margin-bottom:16px">
        <div class="stat-card"><div class="stat-icon" style="background:#d1fae5">💰</div><div class="stat-body"><div class="stat-label">Total Billed</div><div class="stat-value" style="font-size:18px">${fmtRupees(s.total_amount_rupees)}</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:#d1fae5">✅</div><div class="stat-body"><div class="stat-label">Collected</div><div class="stat-value" style="font-size:18px">${fmtRupees(s.paid_amount_rupees)}</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:#fee2e2">⏳</div><div class="stat-body"><div class="stat-label">Outstanding</div><div class="stat-value" style="font-size:18px;color:var(--color-danger)">${fmtRupees(s.pending_amount_rupees)}</div></div></div>
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Bill #</th><th>Date</th><th>Farmer</th><th>Village</th><th>Total</th><th>Paid</th><th>Pending</th><th>Status</th></tr></thead>
        <tbody>${data.map((r) => `<tr><td class="font-mono font-bold">${r.bill_number}</td><td class="td-muted">${new Date(r.collection_date).toLocaleDateString('en-IN')}</td><td>${r.customer_name}</td><td class="td-muted">${r.village_name||'-'}</td><td class="font-bold">${fmtRupees(r.total_amount_rupees)}</td><td class="text-success">${fmtRupees(r.paid_amount_rupees)}</td><td class="${r.pending_amount_rupees>0?'text-danger':''}">${fmtRupees(r.pending_amount_rupees)}</td><td>${paymentBadge(r.payment_status)}</td></tr>`).join('') || '<tr><td colspan="8" class="text-center td-muted" style="padding:30px">No data</td></tr>'}</tbody>
      </table></div></div>`;
  } catch (err) {
    document.getElementById('rep-payments-results').innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════════════════════════════
async function loadSettings() {
  const el = document.getElementById('page-settings');
  if (!Auth.isAdmin()) {
    el.innerHTML = `<div class="card text-center" style="padding:60px"><div class="empty-icon">🔒</div><p class="text-muted">This page is for administrators only.</p></div>`;
    return;
  }

  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">Settings & Staff Management</div><div class="section-subtitle">Manage user accounts, roles and permissions</div></div>
      <button class="btn btn-accent" onclick="showUserModal()">＋ Add Staff</button>
    </div>
    <div class="card" id="users-table-wrap"><div class="text-center" style="padding:40px"><div class="spinner"></div></div></div>`;

  try {
    const res = await API.users.list({ pageSize: 50 });
    document.getElementById('users-table-wrap').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Permissions</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${res.users.map((u) => `
              <tr>
                <td><strong>${u.name}</strong></td>
                <td class="td-muted">${u.email}</td>
                <td>${roleBadge(u.role)}</td>
                <td style="font-size:12px">${u.permissions.length ? u.permissions.join(', ') : '<span class="td-muted">—</span>'}</td>
                <td>${statusBadge(u.status)}</td>
                <td><div class="td-actions">
                  <button class="btn btn-outline btn-sm" onclick='showUserModal(${JSON.stringify(u)})'>Edit</button>
                  ${u.id !== Auth.getUser()?.id ? `<button class="btn btn-danger btn-sm" onclick="toggleUserStatus(${u.id}, '${u.status}')">${u.status === 'active' ? 'Deactivate' : 'Activate'}</button>` : ''}
                </div></td>
              </tr>
            `).join('') || '<tr><td colspan="6" class="text-center td-muted" style="padding:40px">No users</td></tr>'}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    document.getElementById('users-table-wrap').innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

function showUserModal(existing = null) {
  const permissions = ['can_edit_rates'];
  Modal.open(existing ? 'Edit Staff' : 'Add Staff Account', `
    <form>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Full Name <span class="required">*</span></label>
          <input type="text" class="form-control" id="u-name" value="${existing?.name || ''}" required></div>
        <div class="form-group"><label class="form-label">Email <span class="required">*</span></label>
          <input type="email" class="form-control" id="u-email" value="${existing?.email || ''}" ${existing ? 'readonly' : ''} required></div>
      </div>
      ${!existing ? `<div class="form-group"><label class="form-label">Password <span class="required">*</span></label>
        <input type="password" class="form-control" id="u-pass" required minlength="6"></div>` : ''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Role</label>
          <select class="form-control" id="u-role">
            <option value="staff" ${existing?.role === 'staff' ? 'selected' : ''}>Staff</option>
            <option value="admin" ${existing?.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select></div>
        <div class="form-group"><label class="form-label">Status</label>
          <select class="form-control" id="u-status">
            <option value="active" ${(!existing || existing?.status === 'active') ? 'selected' : ''}>Active</option>
            <option value="inactive" ${existing?.status === 'inactive' ? 'selected' : ''}>Inactive</option>
          </select></div>
      </div>
      <div class="form-group">
        <label class="form-label">Permissions</label>
        ${permissions.map((p) => `<label style="display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:6px;cursor:pointer">
          <input type="checkbox" id="perm-${p}" ${existing?.permissions?.includes(p) ? 'checked' : ''}>
          ${p.replace(/_/g, ' ')}
        </label>`).join('')}
      </div>
    </form>
  `, `
    <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
    <button class="btn btn-accent" onclick="saveUser(${existing?.id || 'null'})">Save</button>
  `);
}

async function saveUser(id) {
  const data = { name: document.getElementById('u-name').value, role: document.getElementById('u-role').value, status: document.getElementById('u-status').value };
  const perms = ['can_edit_rates'].filter((p) => document.getElementById(`perm-${p}`)?.checked);
  data.permissions = perms;
  if (!id) { data.email = document.getElementById('u-email').value; data.password = document.getElementById('u-pass').value; }
  try {
    if (id) await API.users.update(id, data);
    else     await API.users.create(data);
    Modal.close();
    Toast.success(id ? 'User updated' : 'User created');
    loadSettings();
  } catch (err) { Toast.error(err.message); }
}

async function toggleUserStatus(id, currentStatus) {
  const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
  try {
    await API.users.update(id, { status: newStatus });
    Toast.success(`User ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
    loadSettings();
  } catch (err) { Toast.error(err.message); }
}

// ── Debounce utility ──────────────────────────────────────────────────────
let _debounceTimers = {};
function debounce(fn, delay) {
  return function(...args) {
    const key = fn.toString().slice(0, 20);
    clearTimeout(_debounceTimers[key]);
    _debounceTimers[key] = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
