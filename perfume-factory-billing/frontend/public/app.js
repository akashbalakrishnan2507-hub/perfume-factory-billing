/* =================================================================
   app.js — Perfume Factory Flower Procurement & Billing Management
   ================================================================= */

// ── Toast System ──────────────────────────────────────────────────────────
const Toast = {
  show(message, type = 'success', duration = 3500) {
    const icons = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };
    const container = document.getElementById('toast-container');
    if (!container) return;
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
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.remove('open');
  },
};

// ── Formatting Helpers ────────────────────────────────────────────────────
function fmtRupees(val) {
  const num = parseFloat(val || 0);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtWeight(val) {
  const num = parseFloat(val || 0);
  return num.toFixed(2) + ' kg';
}

function paymentBadge(status) {
  if (status === 'PAID')            return '<span class="badge badge-paid">✓ Paid</span>';
  if (status === 'PARTIALLY_PAID')  return '<span class="badge badge-partial">◑ Partial</span>';
  return '<span class="badge badge-unpaid">○ Pending</span>';
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

// ── Live Socket.IO Connection ─────────────────────────────────────────────
let socketClient = null;
function initRealtimeSocket() {
  if (typeof io === 'undefined') return;
  try {
    socketClient = io();
    socketClient.on('connect', () => {
      console.log('[Socket.IO] Real-time updates connected');
    });

    socketClient.on('dashboard:update', (evt) => {
      // Automatically refresh visible dashboard or lists without manual page refresh
      if (App.currentPage === 'dashboard')   loadDashboard(false);
      if (App.currentPage === 'bills')       loadBills(billsState.page, false);
      if (App.currentPage === 'collections') loadCollections(collectionsState.page, false);
      if (App.currentPage === 'payments')    loadPaymentsPage(1, false);
      if (App.currentPage === 'customers')   loadCustomers(customersState.page, false);
      if (App.currentPage === 'rates')       loadRates(false);
    });

    socketClient.on('bill:created', (data) => {
      Toast.info(`🧾 New Bill Created: ${data.bill_number} (${data.customer_name || 'Farmer'})`);
    });

    socketClient.on('payment:created', (data) => {
      Toast.info(`💳 Payment Recorded: ${fmtRupees(data.payment?.amount_rupees)}`);
    });
  } catch (e) {
    console.warn('[Socket.IO] Realtime socket initialization skipped:', e.message);
  }
}

// ── Single Page Router ────────────────────────────────────────────────────
const App = {
  currentPage: null,

  navigate(page) {
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

    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));

    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) {
      pageEl.classList.add('active');
      const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
      if (navEl) navEl.classList.add('active');
      this.currentPage = page;

      const titles = {
        dashboard:   '🌸 Dashboard',
        collections: '📦 Flower Intake / Collections',
        bills:       '🧾 Bills & Invoices',
        payments:    '💳 Payment Transactions',
        customers:   '👨‍🌾 Farmers (Suppliers)',
        villages:    '🏘️ Village Procurement Points',
        flowers:     '🌺 Flower Catalogue',
        rates:       '📈 Flower Rates & Pricing',
        reports:     '📊 Analytics & Reports',
        settings:    '⚙️ Staff & System Settings',
      };
      document.getElementById('topbar-title').textContent = titles[page] || page;

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
    document.querySelectorAll('.nav-item[data-page]').forEach((el) => {
      el.addEventListener('click', () => this.navigate(el.dataset.page));
    });

    document.getElementById('topbar-toggle')?.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('collapsed');
    });

    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) Modal.close();
    });
    document.getElementById('modal-close')?.addEventListener('click', () => Modal.close());

    this.refreshUserUI();

    initRealtimeSocket();

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
    const av = document.getElementById('sidebar-avatar');
    if (av) av.textContent = initials;
    const nm = document.getElementById('sidebar-name');
    if (nm) nm.textContent = user.name || user.email;
    const rl = document.getElementById('sidebar-role');
    if (rl) rl.textContent = user.role;
    if (user.role !== 'admin') {
      document.querySelectorAll('[data-admin-only]').forEach((el) => el.classList.add('hidden'));
    }
  },
};

// ── Login Page ────────────────────────────────────────────────────────────
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
    btn.textContent = 'Sign In →'; btn.disabled = false;
  }
}

async function handleLogout() {
  try { await API.auth.logout(); } catch {}
  Auth.clearSession();
  App.navigate('login');
  Toast.info('Logged out successfully');
}

// ══════════════════════════════════════════════════════════════════════════
//  1. DASHBOARD (All 7 Real MySQL KPIs + Recent Activity + Flower Summary)
// ══════════════════════════════════════════════════════════════════════════
async function loadDashboard(showLoading = true) {
  const el = document.getElementById('page-dashboard');
  if (showLoading) {
    el.innerHTML = `<div class="text-center" style="padding:60px"><div class="spinner"></div></div>`;
  }
  try {
    const [summRes, chartRes] = await Promise.all([API.dashboard.summary(), API.dashboard.charts()]);
    const s = summRes.data;
    const c = chartRes.data;
    const kpi = s.kpi || {};

    el.innerHTML = `
      <!-- 7 KPI Metric Cards (Real MySQL Data) -->
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:14px;margin-bottom:24px">
        
        <!-- 1. Today's Bills -->
        <div class="stat-card" style="--card-accent: #d97706">
          <div class="stat-icon" style="background:#fef3c7">🧾</div>
          <div class="stat-body">
            <div class="stat-label">Today's Bills</div>
            <div class="stat-value">${kpi.today_bills ?? s.today?.bills ?? 0}</div>
            <div class="stat-sub">Bills generated today</div>
          </div>
        </div>

        <!-- 2. Today's Flower Weight -->
        <div class="stat-card" style="--card-accent: #059669">
          <div class="stat-icon" style="background:#d1fae5">⚖️</div>
          <div class="stat-body">
            <div class="stat-label">Today's Flower Weight</div>
            <div class="stat-value">${fmtWeight(kpi.today_flower_weight_kg ?? s.today?.weight_kg ?? 0)}</div>
            <div class="stat-sub">Total intake today</div>
          </div>
        </div>

        <!-- 3. Today's Purchase Amount -->
        <div class="stat-card" style="--card-accent: #0f2e24">
          <div class="stat-icon" style="background:#e6f4ea">💵</div>
          <div class="stat-body">
            <div class="stat-label">Today's Purchase</div>
            <div class="stat-value">${fmtRupees(kpi.today_purchase_amount_rupees ?? s.today?.amount_rupees ?? 0)}</div>
            <div class="stat-sub">Procurement value today</div>
          </div>
        </div>

        <!-- 4. Monthly Revenue -->
        <div class="stat-card" style="--card-accent: #2563eb">
          <div class="stat-icon" style="background:#dbeafe">📅</div>
          <div class="stat-body">
            <div class="stat-label">Monthly Revenue</div>
            <div class="stat-value">${fmtRupees(kpi.monthly_revenue_rupees ?? s.month?.amount_rupees ?? 0)}</div>
            <div class="stat-sub">${s.month?.bills || 0} bills this month</div>
          </div>
        </div>

        <!-- 5. Collected Amount -->
        <div class="stat-card" style="--card-accent: #16a34a">
          <div class="stat-icon" style="background:#dcfce7">💰</div>
          <div class="stat-body">
            <div class="stat-label">Collected Amount</div>
            <div class="stat-value">${fmtRupees(kpi.collected_amount_rupees ?? s.totals?.collected_amount_rupees ?? 0)}</div>
            <div class="stat-sub">Total settled payments</div>
          </div>
        </div>

        <!-- 6. Pending Payments -->
        <div class="stat-card" style="--card-accent: #dc2626">
          <div class="stat-icon" style="background:#fee2e2">⏳</div>
          <div class="stat-body">
            <div class="stat-label">Pending Payments</div>
            <div class="stat-value">${fmtRupees(kpi.pending_payments_rupees ?? s.totals?.pending_payments_rupees ?? 0)}</div>
            <div class="stat-sub">${s.month?.unpaid_count || 0} unpaid · ${s.month?.partial_count || 0} partial</div>
          </div>
        </div>

        <!-- 7. Active Farmers -->
        <div class="stat-card" style="--card-accent: #7c3aed">
          <div class="stat-icon" style="background:#ede9fe">👨‍🌾</div>
          <div class="stat-body">
            <div class="stat-label">Active Farmers</div>
            <div class="stat-value">${kpi.active_farmers ?? s.totals?.active_customers ?? 0}</div>
            <div class="stat-sub">${s.totals?.active_flowers || 0} active flower types</div>
          </div>
        </div>

      </div>

      <!-- Center Grid: Recent Activity & Flower-wise Summary -->
      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:18px;margin-bottom:24px">
        
        <!-- Recent Activity Feed (Live updating) -->
        <div class="card">
          <div class="section-header" style="margin-bottom:14px">
            <div>
              <div class="section-title">⚡ Recent Activity</div>
              <div class="section-subtitle">Real-time procurement &amp; payment transactions</div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="App.navigate('bills')">View All Bills →</button>
          </div>
          <div class="recent-activity-list" style="max-height:360px;overflow-y:auto">
            ${(s.recent_activity || []).map((a) => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;margin-bottom:8px;background:var(--color-surface-2);border-radius:var(--radius-md);font-size:13px">
                <div style="display:flex;align-items:center;gap:10px">
                  <span style="font-size:18px">${a.icon || (a.type === 'BILL' ? '🧾' : '💳')}</span>
                  <div>
                    <div style="font-weight:600;color:var(--color-primary)">${a.title}</div>
                    <div class="td-muted" style="font-size:11.5px">
                      ${a.customer_name ? `<strong>${a.customer_name}</strong> · ` : ''}
                      ${a.flowers_summary ? `${a.flowers_summary} (${a.weight_kg} kg) · ` : ''}
                      ${new Date(a.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
                <div style="text-align:right">
                  <div style="font-weight:700;color:${a.type === 'BILL' ? 'var(--color-primary)' : 'var(--color-success)'}">
                    ${fmtRupees(a.amount_rupees)}
                  </div>
                  ${a.payment_status ? paymentBadge(a.payment_status) : '<span class="badge badge-paid">Payment</span>'}
                </div>
              </div>
            `).join('') || '<p class="td-muted text-center" style="padding:30px">No recent activity yet</p>'}
          </div>
        </div>

        <!-- Flower-wise Summary -->
        <div class="card">
          <div class="section-header" style="margin-bottom:14px">
            <div>
              <div class="section-title">🌺 Flower-wise Summary</div>
              <div class="section-subtitle">Intake weight &amp; value this month</div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="App.navigate('rates')">Rates →</button>
          </div>
          <div class="table-wrap" style="max-height:360px;overflow-y:auto">
            <table>
              <thead>
                <tr>
                  <th>Flower</th>
                  <th>Weight</th>
                  <th>Amount</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                ${(s.flower_summary || []).map((f) => `
                  <tr>
                    <td>
                      <strong>${f.flower_name}</strong>
                      ${f.local_name ? `<br><span class="td-muted" style="font-size:11px">${f.local_name}</span>` : ''}
                    </td>
                    <td class="font-bold">${fmtWeight(f.total_weight_kg)}</td>
                    <td class="text-primary font-bold">${fmtRupees(f.total_amount_rupees)}</td>
                    <td>
                      <span class="badge badge-active">${f.share_percentage}%</span>
                    </td>
                  </tr>
                `).join('') || '<tr><td colspan="4" class="text-center td-muted">No flower data yet</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <!-- Charts Row: Monthly Trend & Village Breakdown -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:24px">
        <div class="card">
          <div class="section-header" style="margin-bottom:16px">
            <div>
              <div class="section-title">Monthly Trend</div>
              <div class="section-subtitle">Last 6 months collection value</div>
            </div>
          </div>
          <div class="chart-wrap" id="chart-monthly">${renderMonthlyChart(c.monthly_trend)}</div>
        </div>

        <div class="card">
          <div class="section-header">
            <div>
              <div class="section-title">Village Breakdown</div>
              <div class="section-subtitle">Monthly flower supply by village</div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="App.navigate('villages')">Manage Villages →</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Village</th><th>District</th><th>Bills</th><th>Amount</th></tr></thead>
              <tbody>
                ${(c.village_breakdown || []).map((v) => `
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
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="card"><p class="text-danger" style="padding:20px">Failed to load dashboard: ${err.message}</p></div>`;
  }
}

function renderMonthlyChart(data) {
  if (!data || !data.length) return '<p class="td-muted text-center" style="padding:40px">No data yet</p>';
  const max = Math.max(...data.map((d) => d.total_amount_rupees || 0), 1);
  return data.map((d) => {
    const h = Math.round((d.total_amount_rupees / max) * 180);
    return `<div class="chart-bar">
      <div class="chart-bar-val">${fmtRupees(d.total_amount_rupees).replace('₹','₹')}</div>
      <div class="chart-bar-fill" style="height:${h}px"></div>
      <div class="chart-bar-label">${d.month_label}</div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════
//  2. BILLING & COLLECTIONS (Farmer → Village → Flower → Weight → Rate → Bill)
// ══════════════════════════════════════════════════════════════════════════
let collectionsState = { page: 1, filters: {} };

async function loadCollections(page = 1, showLoading = true) {
  collectionsState.page = page;
  const el = document.getElementById('page-collections');
  const params = { page, pageSize: 15, ...collectionsState.filters };

  if (showLoading) {
    el.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">Flower Procurement Intake</div>
          <div class="section-subtitle">Record daily flower supply from farmers</div>
        </div>
        <button class="btn btn-accent" onclick="showNewCollectionModal()">＋ New Collection / Bill</button>
      </div>
      <div class="card mb-4">
        <div class="filters-bar">
          <input class="filter-input" id="col-search" placeholder="Search bill number or farmer…" value="${params.search || ''}" oninput="debounce(() => { collectionsState.filters.search = this.value; loadCollections(1, false); }, 350)()">
          <select class="filter-select" onchange="collectionsState.filters.payment_status = this.value; loadCollections(1)">
            <option value="">All Status</option>
            <option value="UNPAID" ${params.payment_status === 'UNPAID' ? 'selected' : ''}>Pending (Unpaid)</option>
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
  }

  try {
    const res = await API.collections.list(params);
    const { data, meta } = res;

    document.getElementById('collections-table-wrap').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Bill #</th>
              <th>Date &amp; Time</th>
              <th>Farmer</th>
              <th>Village</th>
              <th>Flower(s)</th>
              <th>Weight</th>
              <th>Amount</th>
              <th>Paid</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${data.length === 0 ? `<tr><td colspan="10" class="text-center td-muted" style="padding:40px">No collections found</td></tr>` :
            data.map((c) => `
              <tr>
                <td><span class="font-mono font-bold" style="color:var(--color-primary)">${c.bill_number}</span></td>
                <td class="td-muted" style="font-size:12px">
                  ${new Date(c.collection_date).toLocaleDateString('en-IN')}<br>
                  <span style="font-size:10.5px">${new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </td>
                <td>
                  <strong>${c.customer_name}</strong><br>
                  <span class="td-muted" style="font-size:11.5px">${c.customer_mobile || ''}</span>
                </td>
                <td class="td-muted">${c.village_name || '-'}</td>
                <td><strong>${c.flowers_summary || 'Flower'}</strong></td>
                <td class="font-bold">${fmtWeight(c.total_weight_kg)}</td>
                <td class="font-bold text-primary">${fmtRupees(c.total_amount_rupees)}</td>
                <td class="text-success">${fmtRupees(c.paid_amount_rupees)}</td>
                <td>${paymentBadge(c.payment_status)}</td>
                <td>
                  <div class="td-actions">
                    <button class="btn btn-ghost btn-sm btn-icon" title="View Bill" onclick="viewCollection(${c.id})">👁</button>
                    <button class="btn btn-outline btn-sm btn-icon" title="Print Invoice" onclick="showPrintableInvoiceModal(${c.id})">🖨</button>
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

// ══════════════════════════════════════════════════════════════════════════
//  3. BILLS & INVOICES PAGE (Dedicated Full Bill View with All 11 Fields)
// ══════════════════════════════════════════════════════════════════════════
let billsState = { page: 1, filters: {} };

async function loadBills(page = 1, showLoading = true) {
  billsState.page = page;
  const el = document.getElementById('page-bills');
  const params = { page, pageSize: 15, ...billsState.filters };

  if (showLoading) {
    el.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">Bills &amp; Invoices</div>
          <div class="section-subtitle">Comprehensive procurement billing directory with settlement tracking</div>
        </div>
        <button class="btn btn-accent" onclick="showNewCollectionModal()">＋ Generate New Bill</button>
      </div>
      <div class="card mb-4">
        <div class="filters-bar">
          <input class="filter-input" placeholder="Search bill # or farmer…" value="${params.search || ''}" oninput="debounce(() => { billsState.filters.search = this.value; loadBills(1, false); }, 350)()">
          <select class="filter-select" onchange="billsState.filters.payment_status = this.value; loadBills(1)">
            <option value="">All Payment Statuses</option>
            <option value="UNPAID" ${params.payment_status === 'UNPAID' ? 'selected' : ''}>Pending (Unpaid)</option>
            <option value="PARTIALLY_PAID" ${params.payment_status === 'PARTIALLY_PAID' ? 'selected' : ''}>Partially Paid</option>
            <option value="PAID" ${params.payment_status === 'PAID' ? 'selected' : ''}>Paid</option>
          </select>
          <input type="date" class="filter-input" value="${params.date_from || ''}" onchange="billsState.filters.date_from = this.value; loadBills(1)" title="From date">
          <input type="date" class="filter-input" value="${params.date_to || ''}" onchange="billsState.filters.date_to = this.value; loadBills(1)" title="To date">
          <button class="btn btn-ghost btn-sm" onclick="billsState.filters = {}; loadBills(1)">Clear</button>
        </div>
      </div>
      <div class="card" id="bills-table-wrap">
        <div class="text-center" style="padding:40px"><div class="spinner"></div></div>
      </div>`;
  }

  try {
    const res = await API.collections.list(params);
    const { data, meta } = res;

    document.getElementById('bills-table-wrap').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Bill Number</th>
              <th>Date &amp; Time</th>
              <th>Farmer Name</th>
              <th>Village</th>
              <th>Flower</th>
              <th>Weight</th>
              <th>Rate/KG</th>
              <th>Total Amount</th>
              <th>Paid Amount</th>
              <th>Pending Amount</th>
              <th>Payment Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${data.length === 0 ? `<tr><td colspan="12" class="text-center td-muted" style="padding:40px">No bills found</td></tr>` :
            data.map((c) => `
              <tr>
                <td><strong class="font-mono" style="color:var(--color-primary)">${c.bill_number}</strong></td>
                <td class="td-muted" style="font-size:12px">
                  ${new Date(c.collection_date).toLocaleDateString('en-IN')}<br>
                  <span style="font-size:10.5px">${new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </td>
                <td><strong>${c.customer_name}</strong><br><span class="td-muted" style="font-size:11.5px">${c.customer_mobile || ''}</span></td>
                <td class="td-muted">${c.village_name || '-'}</td>
                <td>${c.flowers_summary || 'Flower'}</td>
                <td class="font-bold">${fmtWeight(c.total_weight_kg)}</td>
                <td class="td-muted">${c.rates_summary || '-'}</td>
                <td class="font-bold text-primary" style="font-size:15px">${fmtRupees(c.total_amount_rupees)}</td>
                <td class="text-success font-bold">${fmtRupees(c.paid_amount_rupees)}</td>
                <td class="${c.pending_amount_rupees > 0 ? 'text-danger font-bold' : 'text-success'}">${fmtRupees(c.pending_amount_rupees)}</td>
                <td>${paymentBadge(c.payment_status)}</td>
                <td>
                  <div class="td-actions">
                    <button class="btn btn-ghost btn-sm btn-icon" title="View Details" onclick="viewCollection(${c.id})">👁</button>
                    <button class="btn btn-outline btn-sm btn-icon" title="Print Invoice" onclick="showPrintableInvoiceModal(${c.id})">🖨</button>
                    ${c.payment_status !== 'PAID' ? `<button class="btn btn-accent btn-sm" onclick="showPaymentModal(${c.id}, '${c.bill_number}', ${c.total_amount_rupees}, ${c.paid_amount_rupees})">Pay</button>` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${buildPagination(meta, 'loadBills')}
    `;
  } catch (err) {
    document.getElementById('bills-table-wrap').innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

// ── New Collection / Bill Modal ───────────────────────────────────────────
async function showNewCollectionModal() {
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
    Toast.error('Failed to load billing master data: ' + err.message);
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const customerOpts = customersData.map((c) => `<option value="${c.id}" data-village="${c.village_id}">${c.name} — ${c.mobile} (${c.village_name || 'Village'})</option>`).join('');
  const villageOpts  = villagesData.map((v) => `<option value="${v.id}">${v.name} — ${v.district}</option>`).join('');

  Modal.open('🌸 New Flower Procurement & Bill Generation', `
    <form id="collection-form" onsubmit="event.preventDefault(); submitCollection();">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Farmer / Supplier <span class="required">*</span></label>
          <select class="form-control" id="col-customer" required onchange="autoFillVillage(this)">
            <option value="">— Select farmer —</option>${customerOpts}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Village Procurement Point <span class="required">*</span></label>
          <select class="form-control" id="col-village" required>
            <option value="">— Select village —</option>${villageOpts}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Procurement Date <span class="required">*</span></label>
          <input type="date" class="form-control" id="col-date" value="${today}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Remarks / Notes</label>
          <input type="text" class="form-control" id="col-remarks" placeholder="Batch or driver notes…">
        </div>
      </div>

      <hr class="divider">
      <div class="section-header" style="margin-bottom:12px">
        <div>
          <strong style="color:var(--color-primary);font-size:15px">🌸 Flower Line Items</strong>
          <div class="td-muted" style="font-size:12px">Rate per KG is automatically fetched from MySQL</div>
        </div>
        <button type="button" class="btn btn-outline btn-sm" onclick="addItemRow()">＋ Add Flower</button>
      </div>

      <div id="item-rows"></div>

      <div style="background:var(--color-surface-2);border-radius:var(--radius-md);padding:14px;margin-top:14px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span class="td-muted">Gross Amount:</span>
          <strong id="col-subtotal">₹0.00</strong>
        </div>
        <div class="form-row" style="margin-bottom:6px">
          <div class="form-group mb-0">
            <label class="form-label" style="font-size:12px">Discount (₹)</label>
            <input type="number" class="form-control" id="col-discount" value="0" min="0" step="0.01" oninput="recalcTotal()">
          </div>
          <div class="form-group mb-0">
            <label class="form-label" style="font-size:12px">Other Charges / Transport (₹)</label>
            <input type="number" class="form-control" id="col-other" value="0" min="0" step="0.01" oninput="recalcTotal()">
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px dashed var(--color-border);margin-top:10px">
          <span style="font-size:16px;font-weight:700;color:var(--color-primary)">Net Bill Amount:</span>
          <strong style="font-size:22px;color:var(--color-primary)" id="col-total">₹0.00</strong>
        </div>
      </div>
    </form>
  `, `
    <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
    <button class="btn btn-accent btn-lg" id="btn-submit-collection" onclick="submitCollection()">🧾 Generate Bill</button>
  `, 'modal-lg');

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
    if (villageSelect) villageSelect.value = villageId;
  }
}

let itemRowCount = 0;
function addItemRow() {
  itemRowCount++;
  const flowers = window._flowersForModal || [];
  const flowerOpts = flowers.map((f) =>
    `<option value="${f.id}" data-rate="${f.current_rate_rupees || 0}" data-unit="${f.unit || 'kg'}">${f.name}${f.current_rate_rupees ? ` — ₹${f.current_rate_rupees}/kg` : ' (No active rate)'}</option>`
  ).join('');

  const row = document.createElement('div');
  row.className = 'item-row';
  row.id = `item-row-${itemRowCount}`;
  row.style.cssText = 'display:grid;grid-template-columns:2fr 1.2fr 1.2fr 1.5fr 36px;gap:8px;align-items:center;margin-bottom:8px';
  row.innerHTML = `
    <select class="form-control" id="item-flower-${itemRowCount}" onchange="updateItemRate(${itemRowCount})" required>
      <option value="">— Select flower —</option>${flowerOpts}
    </select>
    <input type="number" class="form-control" id="item-weight-${itemRowCount}" placeholder="Weight (kg)" min="0.001" step="0.001" oninput="calcItemAmount(${itemRowCount})" required>
    <div style="position:relative">
      <input type="number" class="form-control" id="item-rate-${itemRowCount}" placeholder="₹/kg" step="0.01" readonly style="background:var(--color-surface-2);font-weight:600">
    </div>
    <div class="item-amount font-bold text-primary" id="item-amt-${itemRowCount}" style="text-align:right;font-size:15px">₹0.00</div>
    <button type="button" class="item-remove btn btn-ghost btn-sm" onclick="removeItemRow(${itemRowCount})" title="Remove" style="color:var(--color-danger)">✕</button>
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
  const rate = parseFloat(opt?.dataset?.rate || 0);
  document.getElementById(`item-rate-${id}`).value = rate > 0 ? rate : '';
  calcItemAmount(id);
}

function calcItemAmount(id) {
  const weight = parseFloat(document.getElementById(`item-weight-${id}`)?.value || 0);
  const rate   = parseFloat(document.getElementById(`item-rate-${id}`)?.value || 0);
  const amount = weight * rate; // Formula: Amount = Weight × Rate per KG
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

  const subEl = document.getElementById('col-subtotal');
  if (subEl) subEl.textContent = fmtRupees(subtotal);
  const el = document.getElementById('col-total');
  if (el) el.textContent = fmtRupees(Math.max(0, total));
}

async function submitCollection() {
  const btn = document.getElementById('btn-submit-collection');
  btn.disabled = true; btn.textContent = 'Generating Bill…';

  const customer_id     = document.getElementById('col-customer').value;
  const village_id      = document.getElementById('col-village').value;
  const collection_date = document.getElementById('col-date').value;
  const remarks         = document.getElementById('col-remarks').value;
  const discount        = parseFloat(document.getElementById('col-discount').value || 0);
  const other_charges   = parseFloat(document.getElementById('col-other').value || 0);

  if (!customer_id) {
    Toast.error('Please select a farmer'); btn.disabled = false; btn.textContent = '🧾 Generate Bill'; return;
  }
  if (!village_id) {
    Toast.error('Please select a village'); btn.disabled = false; btn.textContent = '🧾 Generate Bill'; return;
  }

  const rows = document.querySelectorAll('[id^="item-row-"]');
  const items = [];
  for (const row of rows) {
    const id = row.id.replace('item-row-', '');
    const flower_id  = document.getElementById(`item-flower-${id}`)?.value;
    const weight_kg  = parseFloat(document.getElementById(`item-weight-${id}`)?.value || 0);
    if (!flower_id || isNaN(weight_kg) || weight_kg <= 0) continue;
    items.push({ flower_id: parseInt(flower_id), weight_kg });
  }

  if (items.length === 0) {
    Toast.error('Please add at least one flower with a valid weight greater than 0');
    btn.disabled = false; btn.textContent = '🧾 Generate Bill'; return;
  }

  try {
    const res = await API.collections.create({
      customer_id: parseInt(customer_id),
      village_id: parseInt(village_id),
      collection_date,
      items,
      discount,
      other_charges,
      remarks
    });

    Modal.close();
    Toast.success(`Bill ${res.data.bill_number} generated! Total: ${fmtRupees(res.data.total_amount_rupees)}`);
    
    // Refresh both collections and bills list
    if (App.currentPage === 'collections') loadCollections(1);
    if (App.currentPage === 'bills')       loadBills(1);
    
    // Automatically open invoice view for instant printing / review
    setTimeout(() => showPrintableInvoiceModal(res.data.id), 300);
  } catch (err) {
    Toast.error(err.message);
    btn.disabled = false; btn.textContent = '🧾 Generate Bill';
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  4. PROFESSIONAL PRINTABLE INVOICE (Factory Name, Bill#, Farmer, Flower,
//     Weight, Rate, Total, Paid, Pending)
// ══════════════════════════════════════════════════════════════════════════
async function showPrintableInvoiceModal(id) {
  try {
    const res = await API.collections.getById(id);
    const c = res.data;

    const invoiceHtml = `
      <div class="printable-invoice" id="invoice-sheet-${c.id}">
        <!-- Header -->
        <div class="invoice-header">
          <div class="invoice-brand">
            <h2>🌸 PERFUME FACTORY</h2>
            <p>Aromatic Flower Procurement, Extraction &amp; Processing Division</p>
            <p style="font-size:11px;color:#64748b;margin-top:2px">Industrial Area, Keelakuilkudi, Tamil Nadu · Reg: IND-TN-2026-PF</p>
          </div>
          <div class="invoice-meta">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:700">TAX / PROCUREMENT INVOICE</div>
            <div class="bill-no">${c.bill_number}</div>
            <div style="font-size:12px;color:#64748b;margin-top:3px">
              Date: <strong>${new Date(c.collection_date).toLocaleDateString('en-IN')}</strong><br>
              Time: ${new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>

        <!-- Parties Row -->
        <div class="invoice-parties">
          <div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:4px">FARMER / SUPPLIER</div>
            <strong>${c.customer_name}</strong>
            <div style="font-size:12px;color:#475569;margin-top:2px">
              Mobile: ${c.customer_mobile || '-'}<br>
              Address: ${c.address || 'Local Grower'}
            </div>
          </div>
          <div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:4px">PROCUREMENT LOCATION</div>
            <strong>${c.village_name || '-'}</strong>
            <div style="font-size:12px;color:#475569;margin-top:2px">
              District: ${c.district || '-'}<br>
              Payment Status: <strong>${paymentBadge(c.payment_status)}</strong>
            </div>
          </div>
        </div>

        <!-- Flower Items Table -->
        <div class="table-wrap" style="margin-bottom:16px">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:#0f2e24;color:#ffffff">
                <th style="padding:8px 12px;text-align:left">#</th>
                <th style="padding:8px 12px;text-align:left">Flower Variety</th>
                <th style="padding:8px 12px;text-align:right">Weight (KG)</th>
                <th style="padding:8px 12px;text-align:right">Rate / KG</th>
                <th style="padding:8px 12px;text-align:right">Total Amount</th>
              </tr>
            </thead>
            <tbody>
              ${c.items.map((item, idx) => `
                <tr style="border-bottom:1px solid #e2e8f0">
                  <td style="padding:8px 12px">${idx + 1}</td>
                  <td style="padding:8px 12px">
                    <strong>${item.flower_name}</strong>
                    ${item.local_name ? `<br><span style="font-size:11px;color:#64748b">${item.local_name}</span>` : ''}
                  </td>
                  <td style="padding:8px 12px;text-align:right;font-weight:700">${item.weight_kg.toFixed(3)} kg</td>
                  <td style="padding:8px 12px;text-align:right">${fmtRupees(item.rate_per_kg_rupees)}/kg</td>
                  <td style="padding:8px 12px;text-align:right;font-weight:700;color:#0f2e24">${fmtRupees(item.amount_rupees)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Totals & Financial Settlement Box -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="max-width:300px;font-size:12px;color:#64748b;margin-top:10px">
            ${c.remarks ? `<div><strong>Remarks:</strong> ${c.remarks}</div>` : ''}
            <div style="margin-top:6px">Verified against standard weight measurement &amp; procurement quality specifications.</div>
          </div>
          <div class="invoice-totals-box">
            ${c.discount_rupees > 0 ? `
              <div class="invoice-totals-row">
                <span style="color:#64748b">Discount:</span>
                <span class="text-danger">- ${fmtRupees(c.discount_rupees)}</span>
              </div>
            ` : ''}
            ${c.other_charges_rupees > 0 ? `
              <div class="invoice-totals-row">
                <span style="color:#64748b">Transport / Other Charges:</span>
                <span>+ ${fmtRupees(c.other_charges_rupees)}</span>
              </div>
            ` : ''}
            <div class="invoice-totals-row final">
              <span>Total Bill Amount:</span>
              <span>${fmtRupees(c.total_amount_rupees)}</span>
            </div>
            <div class="invoice-totals-row" style="margin-top:6px">
              <span style="color:#16a34a;font-weight:600">Paid Amount:</span>
              <strong class="text-success">${fmtRupees(c.paid_amount_rupees)}</strong>
            </div>
            <div class="invoice-totals-row" style="border-top:1px solid #e2e8f0;padding-top:6px;margin-top:6px">
              <span style="color:#dc2626;font-weight:700">Pending Amount:</span>
              <strong class="${c.pending_amount_rupees > 0 ? 'text-danger' : 'text-success'}" style="font-size:16px">
                ${fmtRupees(c.pending_amount_rupees)}
              </strong>
            </div>
          </div>
        </div>

        <!-- Signature Placeholders -->
        <div class="invoice-signatures">
          <div class="sig-box">
            <div class="sig-line"></div>
            <div style="font-size:11.5px;color:#64748b">Farmer / Supplier Signature</div>
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <div style="font-size:11.5px;color:#64748b">Factory Cashier / Officer</div>
          </div>
        </div>
      </div>
    `;

    Modal.open(`Invoice — ${c.bill_number}`, invoiceHtml, `
      <button class="btn btn-primary" onclick="window.print()">🖨 Print Invoice</button>
      <a href="${API.collections.invoiceUrl(id)}" target="_blank" class="btn btn-outline">⬇ Download PDF</a>
      ${c.payment_status !== 'PAID' ? `<button class="btn btn-accent" onclick="Modal.close(); showPaymentModal(${c.id}, '${c.bill_number}', ${c.total_amount_rupees}, ${c.paid_amount_rupees})">💳 Record Payment</button>` : ''}
      <button class="btn btn-ghost" onclick="Modal.close()">Close</button>
    `, 'modal-lg');
  } catch (err) {
    Toast.error(err.message);
  }
}

async function viewCollection(id) {
  showPrintableInvoiceModal(id);
}

// ══════════════════════════════════════════════════════════════════════════
//  5. PAYMENT HANDLING (Paid, Partially Paid, Pending + Overpayment Guard)
// ══════════════════════════════════════════════════════════════════════════
function showPaymentModal(collectionId, billNumber, totalRupees, paidRupees) {
  const pending = totalRupees - paidRupees;
  Modal.open(`Record Payment — ${billNumber}`, `
    <div style="background:var(--color-surface-2);border-radius:var(--radius-md);padding:14px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span class="td-muted">Total Bill Amount:</span> <strong>${fmtRupees(totalRupees)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span class="td-muted">Already Paid:</span> <strong class="text-success">${fmtRupees(paidRupees)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;border-top:1px dashed var(--color-border);padding-top:6px">
        <span class="td-muted">Current Pending Amount:</span> <strong class="text-danger" style="font-size:16px">${fmtRupees(pending)}</strong>
      </div>
    </div>
    <form id="payment-form" onsubmit="event.preventDefault(); submitPayment(${collectionId});">
      <div class="form-group">
        <label class="form-label">Payment Amount (₹) <span class="required">*</span></label>
        <input type="number" class="form-control" id="pmt-amount" placeholder="Enter payment amount" min="0.01" max="${pending.toFixed(2)}" step="0.01" value="${pending.toFixed(2)}" required>
        <div class="form-hint" style="color:var(--color-text-muted);font-size:12px;margin-top:4px">
          Maximum payable: <strong>${fmtRupees(pending)}</strong> (Payment cannot exceed pending amount)
        </div>
      </div>
      <div class="form-row">
        <div class="form-group mb-0">
          <label class="form-label">Payment Mode</label>
          <select class="form-control" id="pmt-mode">
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="CHEQUE">Cheque</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Reference / UTR Number</label>
          <input type="text" class="form-control" id="pmt-ref" placeholder="Optional transaction ID…">
        </div>
      </div>
      <div class="form-group" style="margin-top:12px">
        <label class="form-label">Notes</label>
        <input type="text" class="form-control" id="pmt-notes" placeholder="Optional settlement remark…">
      </div>
    </form>
  `, `
    <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
    <button class="btn btn-accent" id="btn-submit-payment" onclick="submitPayment(${collectionId})">Confirm Payment</button>
  `);
}

async function submitPayment(collectionId) {
  const btn = document.getElementById('btn-submit-payment');
  btn.disabled = true; btn.textContent = 'Processing…';

  const amount = parseFloat(document.getElementById('pmt-amount').value);
  const payment_mode = document.getElementById('pmt-mode').value;
  const reference_number = document.getElementById('pmt-ref').value;
  const notes = document.getElementById('pmt-notes').value;

  if (isNaN(amount) || amount <= 0) {
    Toast.error('Payment amount must be greater than 0');
    btn.disabled = false; btn.textContent = 'Confirm Payment';
    return;
  }

  try {
    const res = await API.payments.create(collectionId, { amount, payment_mode, reference_number, notes });
    Modal.close();
    Toast.success(`Payment of ${fmtRupees(amount)} recorded successfully! Status: ${res.data.collection_status}`);
    
    // Refresh current page
    if (App.currentPage === 'bills')       loadBills(billsState.page, false);
    if (App.currentPage === 'collections') loadCollections(collectionsState.page, false);
    if (App.currentPage === 'payments')    loadPaymentsPage(1, false);
    if (App.currentPage === 'dashboard')   loadDashboard(false);
  } catch (err) {
    Toast.error(err.message);
    btn.disabled = false; btn.textContent = 'Confirm Payment';
  }
}

async function loadPaymentsPage(page = 1, showLoading = true) {
  const el = document.getElementById('page-payments');
  if (showLoading) {
    el.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">Payment Transactions &amp; Ledger</div>
          <div class="section-subtitle">Track settlements, cash disbursements and outstanding balances across all bills</div>
        </div>
        <button class="btn btn-outline" onclick="App.navigate('reports')">📋 Payment Reports</button>
      </div>
      <div class="card" id="payments-table-wrap"><div class="text-center" style="padding:40px"><div class="spinner"></div></div></div>`;
  }

  try {
    const res = await API.reports.payments({ page, pageSize: 25 });
    const { data } = res.data;

    document.getElementById('payments-table-wrap').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Bill #</th>
              <th>Date</th>
              <th>Farmer Name</th>
              <th>Village</th>
              <th>Total Amount</th>
              <th>Paid Amount</th>
              <th>Pending Amount</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${data.map((r) => `
              <tr>
                <td><strong class="font-mono text-primary">${r.bill_number}</strong></td>
                <td class="td-muted">${new Date(r.collection_date).toLocaleDateString('en-IN')}</td>
                <td><strong>${r.customer_name}</strong></td>
                <td class="td-muted">${r.village_name || '-'}</td>
                <td class="font-bold">${fmtRupees(r.total_amount_rupees)}</td>
                <td class="text-success font-bold">${fmtRupees(r.paid_amount_rupees)}</td>
                <td class="${r.pending_amount_rupees > 0 ? 'text-danger font-bold' : 'text-success'}">${fmtRupees(r.pending_amount_rupees)}</td>
                <td>${paymentBadge(r.payment_status)}</td>
                <td>
                  ${r.payment_status !== 'PAID'
                    ? `<button class="btn btn-accent btn-sm" onclick="showPaymentModal(${r.id}, '${r.bill_number}', ${r.total_amount_rupees}, ${r.paid_amount_rupees})">💳 Pay</button>`
                    : `<button class="btn btn-ghost btn-sm" onclick="showPrintableInvoiceModal(${r.id})">Invoice</button>`}
                </td>
              </tr>
            `).join('') || '<tr><td colspan="9" class="text-center td-muted" style="padding:40px">No payment records found</td></tr>'}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    document.getElementById('payments-table-wrap').innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  6. FARMERS (Farmer ID, Name, Phone, Village, Address, Weight, Amount,
//     Pending Amount, Search & Transaction History)
// ══════════════════════════════════════════════════════════════════════════
let customersState = { page: 1, search: '', village_id: '' };

async function loadCustomers(page = 1, showLoading = true) {
  customersState.page = page;
  const el = document.getElementById('page-customers');

  if (showLoading) {
    el.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">Farmers (Suppliers)</div>
          <div class="section-subtitle">Manage grower profiles, supply metrics and outstanding balances</div>
        </div>
        <button class="btn btn-accent" onclick="showCustomerModal()">＋ Add New Farmer</button>
      </div>
      <div class="card mb-4">
        <div class="filters-bar">
          <input class="filter-input" id="farmer-search" placeholder="Search by name, phone, address, or village…" value="${customersState.search || ''}" oninput="debounce(() => { customersState.search = this.value; loadCustomers(1, false); }, 350)()">
          <select class="filter-select" id="farmer-village-filter" onchange="customersState.village_id = this.value; loadCustomers(1)">
            <option value="">All Villages</option>
          </select>
          <button class="btn btn-ghost btn-sm" onclick="customersState.search = ''; customersState.village_id = ''; loadCustomers(1)">Clear</button>
        </div>
      </div>
      <div class="card" id="customers-table-wrap"><div class="text-center" style="padding:40px"><div class="spinner"></div></div></div>`;
    
    // Populate villages in filter
    API.villages.list({ pageSize: 200, status: 'active' }).then((vr) => {
      const vSelect = document.getElementById('farmer-village-filter');
      if (vSelect && vr.data) {
        vSelect.innerHTML = '<option value="">All Villages</option>' + vr.data.map((v) => `<option value="${v.id}" ${customersState.village_id == v.id ? 'selected' : ''}>${v.name}</option>`).join('');
      }
    }).catch(() => {});
  }

  try {
    const res = await API.customers.list({
      page,
      pageSize: 20,
      search: customersState.search,
      village_id: customersState.village_id
    });
    const { data, meta } = res;

    document.getElementById('customers-table-wrap').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Farmer ID</th>
              <th>Farmer Name</th>
              <th>Phone Number</th>
              <th>Village</th>
              <th>Address</th>
              <th>Supplied Weight</th>
              <th>Total Amount</th>
              <th>Pending Amount</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${data.map((c) => `
              <tr>
                <td><span class="font-mono font-bold" style="color:var(--color-primary)">#${c.id}</span></td>
                <td><strong>${c.name}</strong></td>
                <td class="font-mono">${c.mobile}</td>
                <td class="td-muted">${c.village_name || '-'}<br><span style="font-size:11px">${c.district || ''}</span></td>
                <td class="td-muted" style="max-width:180px;font-size:12px">${c.address || '-'}</td>
                <td class="font-bold">${fmtWeight(c.total_supplied_weight_kg)}</td>
                <td class="font-bold text-primary">${fmtRupees(c.total_amount_rupees)}</td>
                <td class="${c.pending_amount_rupees > 0 ? 'text-danger font-bold' : 'text-success'}">${fmtRupees(c.pending_amount_rupees)}</td>
                <td>${statusBadge(c.status)}</td>
                <td>
                  <div class="td-actions">
                    <button class="btn btn-ghost btn-sm" onclick="viewCustomerHistory(${c.id}, '${c.name.replace(/'/g,"\\'")}')">📋 History</button>
                    <button class="btn btn-outline btn-sm" onclick="showCustomerModal(${JSON.stringify(c).replace(/"/g,'&quot;')})">Edit</button>
                  </div>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="10" class="text-center td-muted" style="padding:40px">No farmers found</td></tr>'}
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

  Modal.open(existing ? `Edit Farmer: ${existing.name}` : 'Add New Farmer', `
    <form id="customer-form" onsubmit="event.preventDefault(); saveCustomer(${existing?.id || 'null'});">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Farmer Full Name <span class="required">*</span></label>
          <input type="text" class="form-control" id="c-name" value="${existing?.name || ''}" placeholder="e.g. Murugesan Rajan" required>
        </div>
        <div class="form-group">
          <label class="form-label">Phone Number <span class="required">*</span></label>
          <input type="tel" class="form-control" id="c-mobile" value="${existing?.mobile || ''}" placeholder="10-digit mobile number" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Village <span class="required">*</span></label>
          <select class="form-control" id="c-village" required>
            <option value="">— Select village —</option>${villageOpts}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Alternate Phone</label>
          <input type="tel" class="form-control" id="c-alt-mobile" value="${existing?.alternate_mobile || ''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Full Address</label>
        <textarea class="form-control" id="c-address" rows="2" placeholder="Street, landmark, door number…">${existing?.address || ''}</textarea>
      </div>
      <div class="form-row-3">
        <div class="form-group"><label class="form-label">Bank Name</label><input type="text" class="form-control" id="c-bank" value="${existing?.bank_name || ''}" placeholder="e.g. SBI"></div>
        <div class="form-group"><label class="form-label">Account Number</label><input type="text" class="form-control" id="c-acc" value="${existing?.account_number || ''}"></div>
        <div class="form-group"><label class="form-label">IFSC Code</label><input type="text" class="form-control" id="c-ifsc" value="${existing?.ifsc_code || ''}"></div>
      </div>
    </form>
  `, `
    <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
    <button class="btn btn-accent" onclick="saveCustomer(${existing?.id || 'null'})">Save Farmer</button>
  `);
}

async function saveCustomer(id) {
  const data = {
    name: document.getElementById('c-name').value.trim(),
    mobile: document.getElementById('c-mobile').value.trim(),
    alternate_mobile: document.getElementById('c-alt-mobile')?.value?.trim() || null,
    village_id: parseInt(document.getElementById('c-village').value),
    address: document.getElementById('c-address').value.trim(),
    bank_name: document.getElementById('c-bank').value.trim(),
    account_number: document.getElementById('c-acc').value.trim(),
    ifsc_code: document.getElementById('c-ifsc').value.trim(),
  };

  if (!data.name || !data.mobile || !data.village_id) {
    Toast.error('Farmer name, mobile, and village are required');
    return;
  }

  try {
    if (id) await API.customers.update(id, data);
    else     await API.customers.create(data);
    Modal.close();
    Toast.success(id ? 'Farmer updated successfully' : 'Farmer added successfully');
    loadCustomers(customersState.page);
  } catch (err) {
    Toast.error(err.message);
  }
}

async function viewCustomerHistory(id, name) {
  try {
    const res = await API.customers.history(id);
    const { data, summary, customer } = res;

    Modal.open(`Farmer History — ${name} (#${id})`, `
      <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:10px;margin-bottom:18px">
        <div style="background:var(--color-surface-2);border-radius:var(--radius-md);padding:12px;text-align:center">
          <div class="td-muted" style="font-size:11.5px">Total Weight</div>
          <div style="font-weight:800;color:var(--color-primary);font-size:16px">${fmtWeight(summary.total_weight_kg)}</div>
        </div>
        <div style="background:var(--color-surface-2);border-radius:var(--radius-md);padding:12px;text-align:center">
          <div class="td-muted" style="font-size:11.5px">Total Billed</div>
          <div style="font-weight:800;color:var(--color-primary);font-size:16px">${fmtRupees(summary.total_billed_rupees)}</div>
        </div>
        <div style="background:#dcfce7;border-radius:var(--radius-md);padding:12px;text-align:center">
          <div class="td-muted" style="font-size:11.5px">Total Paid</div>
          <div style="font-weight:800;color:#16a34a;font-size:16px">${fmtRupees(summary.total_paid_rupees)}</div>
        </div>
        <div style="background:#fee2e2;border-radius:var(--radius-md);padding:12px;text-align:center">
          <div class="td-muted" style="font-size:11.5px">Pending Balance</div>
          <div style="font-weight:800;color:#dc2626;font-size:16px">${fmtRupees(summary.total_pending_rupees)}</div>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Bill #</th>
              <th>Date</th>
              <th>Flower(s)</th>
              <th>Weight</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Pending</th>
              <th>Status</th>
              <th>Invoice</th>
            </tr>
          </thead>
          <tbody>
            ${data.map((c) => `
              <tr>
                <td><strong class="font-mono text-primary">${c.bill_number}</strong></td>
                <td class="td-muted">${new Date(c.collection_date).toLocaleDateString('en-IN')}</td>
                <td>${c.flowers_summary}</td>
                <td class="font-bold">${fmtWeight(c.total_weight_kg)}</td>
                <td class="font-bold">${fmtRupees(c.total_amount_rupees)}</td>
                <td class="text-success font-bold">${fmtRupees(c.paid_amount_rupees)}</td>
                <td class="${c.pending_amount_rupees > 0 ? 'text-danger font-bold' : 'text-success'}">${fmtRupees(c.pending_amount_rupees)}</td>
                <td>${paymentBadge(c.payment_status)}</td>
                <td>
                  <button class="btn btn-outline btn-sm" onclick="showPrintableInvoiceModal(${c.id})">🖨 Bill</button>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="9" class="text-center td-muted" style="padding:30px">No transaction history found</td></tr>'}
          </tbody>
        </table>
      </div>
    `, `<button class="btn btn-outline" onclick="Modal.close()">Close</button>`, 'modal-lg');
  } catch (err) {
    Toast.error(err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  7. FLOWER RATES (Flower Name, Current Rate/KG, Effective Date, Add/Edit/Update)
// ══════════════════════════════════════════════════════════════════════════
async function loadRates(showLoading = true) {
  const el = document.getElementById('page-rates');
  if (showLoading) {
    el.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">Flower Rates &amp; Pricing</div>
          <div class="section-subtitle">Manage date-effective procurement rates per KG. Billing auto-fetches these rates directly from MySQL.</div>
        </div>
      </div>
      <div class="card"><div class="text-center" style="padding:40px"><div class="spinner"></div></div></div>`;
  }

  try {
    const flowersRes = await API.flowers.list({ pageSize: 100 });
    const flowers = flowersRes.data || [];

    let html = '';
    for (const f of flowers) {
      const ratesRes = await API.flowers.rates(f.id);
      const rates = ratesRes.data || [];
      const currentRate = rates.find((r) => r.is_active === 1) || rates[0];

      html += `
        <div class="card mb-4">
          <div class="section-header">
            <div>
              <div class="section-title" style="display:flex;align-items:center;gap:10px">
                🌸 ${f.name}
                ${currentRate ? `<span class="badge badge-paid font-mono">Current: ₹${currentRate.rate_per_kg_rupees}/kg</span>` : '<span class="badge badge-unpaid">No rate set</span>'}
              </div>
              <div class="section-subtitle">
                ${f.local_name ? `Tamil: ${f.local_name} · ` : ''}
                ${f.botanical_name ? `Botanical: <em>${f.botanical_name}</em> · ` : ''}
                Effective Date: <strong>${f.effective_date || (currentRate ? currentRate.effective_date : 'N/A')}</strong>
              </div>
            </div>
            <div style="display:flex;gap:8px">
              ${currentRate ? `<button class="btn btn-outline btn-sm" onclick="showEditRateModal(${f.id}, ${currentRate.id}, '${f.name.replace(/'/g,"\\'")}', ${currentRate.rate_per_kg_rupees}, '${currentRate.effective_date}')">Edit Current Rate</button>` : ''}
              <button class="btn btn-accent btn-sm" onclick="showSetRateModal(${f.id}, '${f.name.replace(/'/g,"\\'")}', ${f.current_rate_rupees || 0})">＋ Set New Rate</button>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rate (₹/KG)</th>
                  <th>Effective Date (From)</th>
                  <th>Effective To</th>
                  <th>Configured By</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${rates.map((r) => `
                  <tr>
                    <td class="font-bold" style="font-size:16px;color:var(--color-primary)">
                      ${fmtRupees(r.rate_per_kg_rupees)}<span style="font-size:12px;font-weight:400;color:var(--color-text-muted)"> / kg</span>
                    </td>
                    <td><strong>${r.effective_date || new Date(r.effective_from).toLocaleDateString('en-IN')}</strong></td>
                    <td>${r.effective_to ? new Date(r.effective_to).toLocaleDateString('en-IN') : '<span class="badge badge-active">Current Rate</span>'}</td>
                    <td class="td-muted">${r.created_by_name || 'Admin'}</td>
                    <td>${r.is_active ? '<span class="badge badge-paid">Active</span>' : '<span class="badge badge-inactive">Closed</span>'}</td>
                    <td>
                      <button class="btn btn-ghost btn-sm" onclick="showEditRateModal(${f.id}, ${r.id}, '${f.name.replace(/'/g,"\\'")}', ${r.rate_per_kg_rupees}, '${r.effective_date}')">Edit</button>
                    </td>
                  </tr>
                `).join('') || '<tr><td colspan="6" class="text-center td-muted">No rate history recorded yet</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>`;
    }

    el.innerHTML = html || '<div class="card"><p class="td-muted text-center" style="padding:40px">No flowers found. Add flowers in the Flowers catalog first.</p></div>';
  } catch (err) {
    el.innerHTML = `<div class="card"><p class="text-danger" style="padding:20px">Error: ${err.message}</p></div>`;
  }
}

function showSetRateModal(flowerId, flowerName, currentRate) {
  const today = new Date().toISOString().split('T')[0];
  Modal.open(`Set New Rate — ${flowerName}`, `
    <form id="set-rate-form" onsubmit="event.preventDefault(); saveNewRate(${flowerId});">
      <div style="background:var(--color-surface-2);border-radius:var(--radius-md);padding:12px;margin-bottom:14px;font-size:13px">
        Current Active Rate: <strong>${currentRate ? fmtRupees(currentRate) + '/kg' : 'None'}</strong><br>
        Setting a new rate will automatically close the previous rate and become effective immediately for all new billing entries.
      </div>
      <div class="form-group">
        <label class="form-label">New Rate per KG (₹) <span class="required">*</span></label>
        <input type="number" class="form-control" id="rate-val" min="0.01" step="0.01" value="${currentRate || ''}" placeholder="e.g. 85.00" required>
      </div>
      <div class="form-group">
        <label class="form-label">Effective Date <span class="required">*</span></label>
        <input type="date" class="form-control" id="rate-effective-date" value="${today}" required>
      </div>
    </form>
  `, `
    <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
    <button class="btn btn-accent" onclick="saveNewRate(${flowerId})">Activate New Rate</button>
  `);
}

async function saveNewRate(flowerId) {
  const rateVal = parseFloat(document.getElementById('rate-val').value);
  const effectiveDate = document.getElementById('rate-effective-date').value;
  if (isNaN(rateVal) || rateVal <= 0) {
    Toast.error('Rate per KG must be greater than 0');
    return;
  }
  try {
    await API.flowers.setRate(flowerId, rateVal, effectiveDate);
    Modal.close();
    Toast.success('New flower rate activated successfully!');
    loadRates();
  } catch (err) {
    Toast.error(err.message);
  }
}

function showEditRateModal(flowerId, rateId, flowerName, currentRate, effectiveDate) {
  Modal.open(`Edit Rate Entry — ${flowerName}`, `
    <form id="edit-rate-form" onsubmit="event.preventDefault(); saveEditRate(${flowerId}, ${rateId});">
      <div class="form-group">
        <label class="form-label">Rate per KG (₹) <span class="required">*</span></label>
        <input type="number" class="form-control" id="edit-rate-val" min="0.01" step="0.01" value="${currentRate || ''}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Effective Date <span class="required">*</span></label>
        <input type="date" class="form-control" id="edit-rate-effective-date" value="${effectiveDate || ''}" required>
      </div>
    </form>
  `, `
    <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
    <button class="btn btn-accent" onclick="saveEditRate(${flowerId}, ${rateId})">Update Rate</button>
  `);
}

async function saveEditRate(flowerId, rateId) {
  const rateVal = parseFloat(document.getElementById('edit-rate-val').value);
  const effectiveDate = document.getElementById('edit-rate-effective-date').value;
  if (isNaN(rateVal) || rateVal <= 0) {
    Toast.error('Rate per KG must be greater than 0');
    return;
  }
  try {
    await API.flowers.updateRate(flowerId, rateId, { rate_per_kg: rateVal, effective_from: effectiveDate });
    Modal.close();
    Toast.success('Rate record updated successfully!');
    loadRates();
  } catch (err) {
    Toast.error(err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  8. REPORTS (All 6: Daily, Weekly, Monthly, Farmer-wise, Village-wise,
//     Flower-wise with Weight, Amount, Paid, Pending)
// ══════════════════════════════════════════════════════════════════════════
async function loadReports() {
  const el = document.getElementById('page-reports');
  const today = new Date().toISOString().split('T')[0];
  const lastWeek = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];
  const month = new Date().getMonth() + 1;
  const year  = new Date().getFullYear();

  el.innerHTML = `
    <div class="section-header">
      <div>
        <div class="section-title">Analytics &amp; Financial Reports</div>
        <div class="section-subtitle">Real-time procurement, weight yield and settlement reports with CSV export</div>
      </div>
    </div>
    
    <!-- Report Type Tabs (All 6 Required Reports) -->
    <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">
      ${['Daily', 'Weekly', 'Monthly', 'Farmer-wise', 'Village-wise', 'Flower-wise'].map((t, i) =>
        `<button class="btn ${i === 0 ? 'btn-primary' : 'btn-outline'} report-tab" data-tab="${t}" onclick="switchReportTab('${t}')">${t}</button>`
      ).join('')}
    </div>

    <!-- 1. Daily Report -->
    <div id="report-Daily" class="report-panel">
      <div class="card mb-4">
        <div class="filters-bar">
          <label class="form-label mb-0">Date:</label>
          <input type="date" class="filter-input" id="rep-daily-date" value="${today}">
          <button class="btn btn-primary btn-sm" onclick="fetchDailyReport()">Generate Report</button>
          <a id="rep-daily-export" href="${API.reports.exportUrl('daily', { date: today })}" download class="btn btn-outline btn-sm">⬇ Export CSV</a>
        </div>
      </div>
      <div id="rep-daily-results"></div>
    </div>

    <!-- 2. Weekly Report -->
    <div id="report-Weekly" class="report-panel hidden">
      <div class="card mb-4">
        <div class="filters-bar">
          <label class="form-label mb-0">From:</label>
          <input type="date" class="filter-input" id="rep-weekly-from" value="${lastWeek}">
          <label class="form-label mb-0">To:</label>
          <input type="date" class="filter-input" id="rep-weekly-to" value="${today}">
          <button class="btn btn-primary btn-sm" onclick="fetchWeeklyReport()">Generate Report</button>
          <a id="rep-weekly-export" href="${API.reports.exportUrl('weekly', { from: lastWeek, to: today })}" download class="btn btn-outline btn-sm">⬇ Export CSV</a>
        </div>
      </div>
      <div id="rep-weekly-results"></div>
    </div>

    <!-- 3. Monthly Report -->
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
          <button class="btn btn-primary btn-sm" onclick="fetchMonthlyReport()">Generate Report</button>
          <a id="rep-monthly-export" href="${API.reports.exportUrl('monthly', { month, year })}" download class="btn btn-outline btn-sm">⬇ Export CSV</a>
        </div>
      </div>
      <div id="rep-monthly-results"></div>
    </div>

    <!-- 4. Farmer-wise Report -->
    <div id="report-Farmer-wise" class="report-panel hidden">
      <div class="card mb-4">
        <div class="filters-bar">
          <label class="form-label mb-0">From:</label>
          <input type="date" class="filter-input" id="rep-farmer-from" value="${new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]}">
          <label class="form-label mb-0">To:</label>
          <input type="date" class="filter-input" id="rep-farmer-to" value="${today}">
          <button class="btn btn-primary btn-sm" onclick="fetchFarmerReport()">Generate Report</button>
          <a id="rep-farmer-export" href="${API.reports.exportUrl('farmer')}" download class="btn btn-outline btn-sm">⬇ Export CSV</a>
        </div>
      </div>
      <div id="rep-farmer-results"></div>
    </div>

    <!-- 5. Village-wise Report -->
    <div id="report-Village-wise" class="report-panel hidden">
      <div class="card mb-4">
        <div class="filters-bar">
          <label class="form-label mb-0">From:</label>
          <input type="date" class="filter-input" id="rep-v-from" value="${new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]}">
          <label class="form-label mb-0">To:</label>
          <input type="date" class="filter-input" id="rep-v-to" value="${today}">
          <button class="btn btn-primary btn-sm" onclick="fetchVillageReport()">Generate Report</button>
          <a id="rep-v-export" href="${API.reports.exportUrl('village')}" download class="btn btn-outline btn-sm">⬇ Export CSV</a>
        </div>
      </div>
      <div id="rep-village-results"></div>
    </div>

    <!-- 6. Flower-wise Report -->
    <div id="report-Flower-wise" class="report-panel hidden">
      <div class="card mb-4">
        <div class="filters-bar">
          <label class="form-label mb-0">From:</label>
          <input type="date" class="filter-input" id="rep-f-from" value="${new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]}">
          <label class="form-label mb-0">To:</label>
          <input type="date" class="filter-input" id="rep-f-to" value="${today}">
          <button class="btn btn-primary btn-sm" onclick="fetchFlowerReport()">Generate Report</button>
          <a id="rep-f-export" href="${API.reports.exportUrl('flower')}" download class="btn btn-outline btn-sm">⬇ Export CSV</a>
        </div>
      </div>
      <div id="rep-flower-results"></div>
    </div>
  `;

  fetchDailyReport();
}

function switchReportTab(name) {
  document.querySelectorAll('.report-tab').forEach((b) => {
    b.className = b.dataset.tab === name ? 'btn btn-primary report-tab' : 'btn btn-outline report-tab';
  });
  document.querySelectorAll('.report-panel').forEach((p) => p.classList.add('hidden'));
  const panel = document.getElementById(`report-${name}`);
  if (panel) panel.classList.remove('hidden');

  if (name === 'Daily')        fetchDailyReport();
  if (name === 'Weekly')       fetchWeeklyReport();
  if (name === 'Monthly')      fetchMonthlyReport();
  if (name === 'Farmer-wise')  fetchFarmerReport();
  if (name === 'Village-wise') fetchVillageReport();
  if (name === 'Flower-wise')  fetchFlowerReport();
}

function renderReportSummaryKPIs(s) {
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));gap:12px;margin-bottom:18px">
      <div style="background:var(--color-surface-2);border-radius:var(--radius-md);padding:14px;text-align:center">
        <div class="td-muted" style="font-size:12px">Total Bills</div>
        <div style="font-size:18px;font-weight:800;color:var(--color-primary)">${s.total_bills ?? '-'}</div>
      </div>
      <div style="background:var(--color-surface-2);border-radius:var(--radius-md);padding:14px;text-align:center">
        <div class="td-muted" style="font-size:12px">Total Weight</div>
        <div style="font-size:18px;font-weight:800;color:var(--color-primary)">${fmtWeight(s.total_weight_kg)}</div>
      </div>
      <div style="background:var(--color-surface-2);border-radius:var(--radius-md);padding:14px;text-align:center">
        <div class="td-muted" style="font-size:12px">Total Amount</div>
        <div style="font-size:18px;font-weight:800;color:var(--color-primary)">${fmtRupees(s.total_amount_rupees)}</div>
      </div>
      <div style="background:#dcfce7;border-radius:var(--radius-md);padding:14px;text-align:center">
        <div class="td-muted" style="font-size:12px">Paid Amount</div>
        <div style="font-size:18px;font-weight:800;color:#16a34a">${fmtRupees(s.total_paid_rupees)}</div>
      </div>
      <div style="background:#fee2e2;border-radius:var(--radius-md);padding:14px;text-align:center">
        <div class="td-muted" style="font-size:12px">Pending Amount</div>
        <div style="font-size:18px;font-weight:800;color:#dc2626">${fmtRupees(s.total_pending_rupees)}</div>
      </div>
    </div>
  `;
}

async function fetchDailyReport() {
  const d = document.getElementById('rep-daily-date')?.value || new Date().toISOString().split('T')[0];
  const el = document.getElementById('rep-daily-results');
  el.innerHTML = '<div class="text-center" style="padding:40px"><div class="spinner"></div></div>';
  document.getElementById('rep-daily-export').href = API.reports.exportUrl('daily', { date: d });

  try {
    const res = await API.reports.daily({ date: d });
    const { summary, collections } = res.data;

    el.innerHTML = `
      ${renderReportSummaryKPIs(summary)}
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Bill #</th><th>Farmer</th><th>Village</th><th>Flower(s)</th><th>Weight</th><th>Amount</th><th>Paid</th><th>Pending</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${collections.map((c) => `
                <tr>
                  <td><strong class="font-mono text-primary">${c.bill_number}</strong></td>
                  <td><strong>${c.customer_name}</strong></td>
                  <td class="td-muted">${c.village_name || '-'}</td>
                  <td>${c.flowers_summary || '-'}</td>
                  <td class="font-bold">${fmtWeight(c.total_weight_kg)}</td>
                  <td class="font-bold text-primary">${fmtRupees(c.total_amount_rupees)}</td>
                  <td class="text-success">${fmtRupees(c.paid_amount_rupees)}</td>
                  <td class="${c.pending_amount_rupees > 0 ? 'text-danger font-bold' : 'text-success'}">${fmtRupees(c.pending_amount_rupees)}</td>
                  <td>${paymentBadge(c.payment_status)}</td>
                </tr>
              `).join('') || '<tr><td colspan="9" class="text-center td-muted" style="padding:30px">No records for this date</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

async function fetchWeeklyReport() {
  const f = document.getElementById('rep-weekly-from')?.value;
  const t = document.getElementById('rep-weekly-to')?.value;
  const el = document.getElementById('rep-weekly-results');
  el.innerHTML = '<div class="text-center" style="padding:40px"><div class="spinner"></div></div>';
  document.getElementById('rep-weekly-export').href = API.reports.exportUrl('weekly', { from: f, to: t });

  try {
    const res = await API.reports.weekly({ from: f, to: t });
    const { summary, daily } = res.data;

    el.innerHTML = `
      ${renderReportSummaryKPIs(summary)}
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Bills</th><th>Total Weight</th><th>Total Amount</th><th>Paid Amount</th><th>Pending Amount</th></tr>
            </thead>
            <tbody>
              ${daily.map((r) => `
                <tr>
                  <td><strong>${new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</strong></td>
                  <td>${r.bill_count}</td>
                  <td class="font-bold">${fmtWeight(r.total_weight_kg)}</td>
                  <td class="font-bold text-primary">${fmtRupees(r.total_amount_rupees)}</td>
                  <td class="text-success font-bold">${fmtRupees(r.paid_amount_rupees)}</td>
                  <td class="${r.pending_amount_rupees > 0 ? 'text-danger font-bold' : 'text-success'}">${fmtRupees(r.pending_amount_rupees)}</td>
                </tr>
              `).join('') || '<tr><td colspan="6" class="text-center td-muted" style="padding:30px">No records for this period</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

async function fetchMonthlyReport() {
  const m = document.getElementById('rep-month')?.value;
  const y = document.getElementById('rep-year')?.value;
  const el = document.getElementById('rep-monthly-results');
  el.innerHTML = '<div class="text-center" style="padding:40px"><div class="spinner"></div></div>';
  document.getElementById('rep-monthly-export').href = API.reports.exportUrl('monthly', { month: m, year: y });

  try {
    const res = await API.reports.monthly({ month: m, year: y });
    const { summary, daily } = res.data;

    el.innerHTML = `
      ${renderReportSummaryKPIs(summary)}
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Bills</th><th>Total Weight</th><th>Total Amount</th><th>Paid Amount</th><th>Pending Amount</th></tr>
            </thead>
            <tbody>
              ${daily.map((r) => `
                <tr>
                  <td><strong>${new Date(r.date).toLocaleDateString('en-IN')}</strong></td>
                  <td>${r.bill_count}</td>
                  <td class="font-bold">${fmtWeight(r.total_weight_kg)}</td>
                  <td class="font-bold text-primary">${fmtRupees(r.total_amount_rupees)}</td>
                  <td class="text-success font-bold">${fmtRupees(r.paid_amount_rupees)}</td>
                  <td class="${r.pending_amount_rupees > 0 ? 'text-danger font-bold' : 'text-success'}">${fmtRupees(r.pending_amount_rupees)}</td>
                </tr>
              `).join('') || '<tr><td colspan="6" class="text-center td-muted" style="padding:30px">No records for this month</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

async function fetchFarmerReport() {
  const f = document.getElementById('rep-farmer-from')?.value;
  const t = document.getElementById('rep-farmer-to')?.value;
  const el = document.getElementById('rep-farmer-results');
  el.innerHTML = '<div class="text-center" style="padding:40px"><div class="spinner"></div></div>';
  document.getElementById('rep-farmer-export').href = API.reports.exportUrl('farmer', { from: f, to: t });

  try {
    const res = await API.reports.farmer({ from: f, to: t });
    const { summary, data } = res.data;

    el.innerHTML = `
      ${renderReportSummaryKPIs(summary)}
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Farmer Name</th><th>Phone</th><th>Village</th><th>Bills</th><th>Total Weight</th><th>Total Amount</th><th>Paid Amount</th><th>Pending Amount</th></tr>
            </thead>
            <tbody>
              ${data.map((r) => `
                <tr>
                  <td><strong>${r.customer_name}</strong></td>
                  <td class="font-mono">${r.customer_mobile || '-'}</td>
                  <td class="td-muted">${r.village_name}</td>
                  <td>${r.bill_count}</td>
                  <td class="font-bold">${fmtWeight(r.total_weight_kg)}</td>
                  <td class="font-bold text-primary">${fmtRupees(r.total_amount_rupees)}</td>
                  <td class="text-success font-bold">${fmtRupees(r.paid_amount_rupees)}</td>
                  <td class="${r.pending_amount_rupees > 0 ? 'text-danger font-bold' : 'text-success'}">${fmtRupees(r.pending_amount_rupees)}</td>
                </tr>
              `).join('') || '<tr><td colspan="8" class="text-center td-muted" style="padding:30px">No records found</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

async function fetchVillageReport() {
  const f = document.getElementById('rep-v-from')?.value;
  const t = document.getElementById('rep-v-to')?.value;
  const el = document.getElementById('rep-village-results');
  el.innerHTML = '<div class="text-center" style="padding:40px"><div class="spinner"></div></div>';
  document.getElementById('rep-v-export').href = API.reports.exportUrl('village', { from: f, to: t });

  try {
    const res = await API.reports.village({ from: f, to: t });
    const { summary, data } = res.data;

    el.innerHTML = `
      ${renderReportSummaryKPIs(summary)}
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Village Name</th><th>District</th><th>Bills</th><th>Total Weight</th><th>Total Amount</th><th>Paid Amount</th><th>Pending Amount</th></tr>
            </thead>
            <tbody>
              ${data.map((r) => `
                <tr>
                  <td><strong>${r.village_name}</strong></td>
                  <td class="td-muted">${r.district || '-'}</td>
                  <td>${r.bill_count}</td>
                  <td class="font-bold">${fmtWeight(r.total_weight_kg)}</td>
                  <td class="font-bold text-primary">${fmtRupees(r.total_amount_rupees)}</td>
                  <td class="text-success font-bold">${fmtRupees(r.paid_amount_rupees)}</td>
                  <td class="${r.pending_amount_rupees > 0 ? 'text-danger font-bold' : 'text-success'}">${fmtRupees(r.pending_amount_rupees)}</td>
                </tr>
              `).join('') || '<tr><td colspan="7" class="text-center td-muted" style="padding:30px">No records found</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

async function fetchFlowerReport() {
  const f = document.getElementById('rep-f-from')?.value;
  const t = document.getElementById('rep-f-to')?.value;
  const el = document.getElementById('rep-flower-results');
  el.innerHTML = '<div class="text-center" style="padding:40px"><div class="spinner"></div></div>';
  document.getElementById('rep-f-export').href = API.reports.exportUrl('flower', { from: f, to: t });

  try {
    const res = await API.reports.flower({ from: f, to: t });
    const { summary, data } = res.data;

    el.innerHTML = `
      ${renderReportSummaryKPIs(summary)}
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Flower Name</th><th>Unit</th><th>Bills</th><th>Total Weight</th><th>Avg Rate/KG</th><th>Total Amount</th><th>Paid Amount</th><th>Pending Amount</th></tr>
            </thead>
            <tbody>
              ${data.map((r) => `
                <tr>
                  <td>
                    <strong>${r.flower_name}</strong>
                    ${r.local_name ? `<br><span class="td-muted" style="font-size:11.5px">${r.local_name}</span>` : ''}
                  </td>
                  <td class="td-muted">${r.unit}</td>
                  <td>${r.bill_count}</td>
                  <td class="font-bold">${fmtWeight(r.total_weight_kg)}</td>
                  <td>${fmtRupees(r.avg_rate_rupees)}/kg</td>
                  <td class="font-bold text-primary">${fmtRupees(r.total_amount_rupees)}</td>
                  <td class="text-success font-bold">${fmtRupees(r.paid_amount_rupees)}</td>
                  <td class="${r.pending_amount_rupees > 0 ? 'text-danger font-bold' : 'text-success'}">${fmtRupees(r.pending_amount_rupees)}</td>
                </tr>
              `).join('') || '<tr><td colspan="8" class="text-center td-muted" style="padding:30px">No records found</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  9. VILLAGES
// ══════════════════════════════════════════════════════════════════════════
async function loadVillages() {
  const el = document.getElementById('page-villages');
  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">Villages</div><div class="section-subtitle">Procurement centres and collection points</div></div>
      <button class="btn btn-accent" onclick="showVillageModal()">＋ Add Village</button>
    </div>
    <div class="card" id="villages-table-wrap"><div class="text-center" style="padding:40px"><div class="spinner"></div></div></div>`;

  try {
    const res = await API.villages.list({ pageSize: 100 });
    document.getElementById('villages-table-wrap').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Village Name</th><th>District</th><th>State</th><th>Pincode</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${(res.data || []).map((v) => `
              <tr>
                <td><strong>${v.name}</strong></td>
                <td>${v.district}</td>
                <td class="td-muted">${v.state}</td>
                <td class="font-mono">${v.pincode}</td>
                <td>${statusBadge(v.status)}</td>
                <td><button class="btn btn-outline btn-sm" onclick="showVillageModal(${JSON.stringify(v).replace(/"/g,'&quot;')})">Edit</button></td>
              </tr>
            `).join('') || '<tr><td colspan="6" class="text-center td-muted" style="padding:40px">No villages configured yet</td></tr>'}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    document.getElementById('villages-table-wrap').innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

function showVillageModal(existing = null) {
  Modal.open(existing ? 'Edit Village' : 'Add Village', `
    <form id="village-form" onsubmit="event.preventDefault(); saveVillage(${existing?.id || 'null'});">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Village Name <span class="required">*</span></label>
          <input type="text" class="form-control" id="v-name" value="${existing?.name || ''}" placeholder="e.g. Nilakottai" required></div>
        <div class="form-group"><label class="form-label">District <span class="required">*</span></label>
          <input type="text" class="form-control" id="v-district" value="${existing?.district || ''}" placeholder="e.g. Dindigul" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">State</label>
          <input type="text" class="form-control" id="v-state" value="${existing?.state || 'Tamil Nadu'}"></div>
        <div class="form-group"><label class="form-label">Pincode <span class="required">*</span></label>
          <input type="text" class="form-control" id="v-pincode" value="${existing?.pincode || ''}" placeholder="6-digit pincode" required></div>
      </div>
    </form>
  `, `
    <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
    <button class="btn btn-accent" onclick="saveVillage(${existing?.id || 'null'})">Save Village</button>
  `);
}

async function saveVillage(id) {
  const data = {
    name: document.getElementById('v-name').value.trim(),
    district: document.getElementById('v-district').value.trim(),
    state: document.getElementById('v-state').value.trim(),
    pincode: document.getElementById('v-pincode').value.trim(),
  };
  try {
    if (id) await API.villages.update(id, data);
    else     await API.villages.create(data);
    Modal.close();
    Toast.success(id ? 'Village updated' : 'Village created');
    loadVillages();
  } catch (err) { Toast.error(err.message); }
}

// ══════════════════════════════════════════════════════════════════════════
//  10. FLOWERS CATALOGUE
// ══════════════════════════════════════════════════════════════════════════
async function loadFlowers() {
  const el = document.getElementById('page-flowers');
  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">Flower Varieties</div><div class="section-subtitle">Catalog of aromatic flower types</div></div>
      <button class="btn btn-accent" onclick="showFlowerModal()">＋ Add Flower Variety</button>
    </div>
    <div class="card" id="flowers-table-wrap"><div class="text-center" style="padding:40px"><div class="spinner"></div></div></div>`;

  try {
    const res = await API.flowers.list({ pageSize: 100 });
    document.getElementById('flowers-table-wrap').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Flower Name</th><th>Local / Tamil Name</th><th>Botanical Name</th><th>Current Rate (₹/kg)</th><th>Unit</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${(res.data || []).map((f) => `
              <tr>
                <td><strong>🌸 ${f.name}</strong></td>
                <td>${f.local_name || '-'}</td>
                <td class="td-muted"><em>${f.botanical_name || '-'}</em></td>
                <td class="font-bold text-primary" style="font-size:15px">${f.current_rate_rupees ? fmtRupees(f.current_rate_rupees) + '/kg' : '<span class="text-danger">No rate set</span>'}</td>
                <td>${f.unit}</td>
                <td>${statusBadge(f.status)}</td>
                <td>
                  <div class="td-actions">
                    <button class="btn btn-outline btn-sm" onclick="showFlowerModal(${JSON.stringify(f).replace(/"/g,'&quot;')})">Edit</button>
                    <button class="btn btn-accent btn-sm" onclick="showSetRateModal(${f.id}, '${f.name.replace(/'/g,"\\'")}', ${f.current_rate_rupees || 0})">Rate</button>
                  </div>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="7" class="text-center td-muted" style="padding:40px">No flowers configured yet</td></tr>'}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    document.getElementById('flowers-table-wrap').innerHTML = `<p class="text-danger" style="padding:20px">Error: ${err.message}</p>`;
  }
}

function showFlowerModal(existing = null) {
  Modal.open(existing ? 'Edit Flower Variety' : 'Add Flower Variety', `
    <form id="flower-form" onsubmit="event.preventDefault(); saveFlower(${existing?.id || 'null'});">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Flower Name <span class="required">*</span></label>
          <input type="text" class="form-control" id="fl-name" value="${existing?.name || ''}" placeholder="e.g. Jasmine (Madurai Malli)" required></div>
        <div class="form-group"><label class="form-label">Local / Tamil Name</label>
          <input type="text" class="form-control" id="fl-local" value="${existing?.local_name || ''}" placeholder="e.g. மல்லி"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Botanical Name</label>
          <input type="text" class="form-control" id="fl-botanical" value="${existing?.botanical_name || ''}" placeholder="e.g. Jasminum sambac"></div>
        <div class="form-group"><label class="form-label">Measurement Unit</label>
          <input type="text" class="form-control" id="fl-unit" value="${existing?.unit || 'kg'}"></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label>
        <textarea class="form-control" id="fl-notes" rows="2">${existing?.notes || ''}</textarea></div>
    </form>
  `, `
    <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
    <button class="btn btn-accent" onclick="saveFlower(${existing?.id || 'null'})">Save Flower</button>
  `);
}

async function saveFlower(id) {
  const data = {
    name: document.getElementById('fl-name').value.trim(),
    local_name: document.getElementById('fl-local').value.trim(),
    botanical_name: document.getElementById('fl-botanical').value.trim(),
    unit: document.getElementById('fl-unit').value.trim() || 'kg',
    notes: document.getElementById('fl-notes').value.trim(),
  };
  try {
    if (id) await API.flowers.update(id, data);
    else     await API.flowers.create(data);
    Modal.close();
    Toast.success(id ? 'Flower updated' : 'Flower added');
    loadFlowers();
  } catch (err) { Toast.error(err.message); }
}

// ══════════════════════════════════════════════════════════════════════════
//  11. SETTINGS & STAFF
// ══════════════════════════════════════════════════════════════════════════
async function loadSettings() {
  const el = document.getElementById('page-settings');
  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">Staff &amp; System Settings</div><div class="section-subtitle">Manage operator accounts and access permissions</div></div>
      <button class="btn btn-accent" onclick="showUserModal()">＋ Add Staff Member</button>
    </div>
    <div class="card" id="users-table-wrap"><div class="text-center" style="padding:40px"><div class="spinner"></div></div></div>`;

  try {
    const res = await API.users.list({ pageSize: 50 });
    document.getElementById('users-table-wrap').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Action</th></tr></thead>
          <tbody>
            ${(res.data || []).map((u) => `
              <tr>
                <td><strong>${u.name}</strong></td>
                <td class="font-mono">${u.email}</td>
                <td>${roleBadge(u.role)}</td>
                <td>${statusBadge(u.status)}</td>
                <td class="td-muted">${new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" onclick="toggleUserStatus(${u.id}, '${u.status}')">
                    ${u.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            `).join('')}
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
    <form onsubmit="event.preventDefault(); saveUser(${existing?.id || 'null'});">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Full Name <span class="required">*</span></label>
          <input type="text" class="form-control" id="u-name" value="${existing?.name || ''}" required></div>
        <div class="form-group"><label class="form-label">Email <span class="required">*</span></label>
          <input type="email" class="form-control" id="u-email" value="${existing?.email || ''}" ${existing ? 'readonly' : ''} required></div>
      </div>
      ${!existing ? `<div class="form-group"><label class="form-label">Password <span class="required">*</span></label>
        <input type="password" class="form-control" id="u-pass" required minlength="6" placeholder="At least 6 characters"></div>` : ''}
      <div class="form-row">
        <div class="form-group"><label class="form-label">Role</label>
          <select class="form-control" id="u-role">
            <option value="staff" ${existing?.role === 'staff' ? 'selected' : ''}>Staff / Operator</option>
            <option value="admin" ${existing?.role === 'admin' ? 'selected' : ''}>Administrator</option>
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
    <button class="btn btn-accent" onclick="saveUser(${existing?.id || 'null'})">Save Staff</button>
  `);
}

async function saveUser(id) {
  const data = {
    name: document.getElementById('u-name').value.trim(),
    role: document.getElementById('u-role').value,
    status: document.getElementById('u-status').value
  };
  const perms = ['can_edit_rates'].filter((p) => document.getElementById(`perm-${p}`)?.checked);
  data.permissions = perms;
  if (!id) {
    data.email = document.getElementById('u-email').value.trim();
    data.password = document.getElementById('u-pass').value;
  }
  try {
    if (id) await API.users.update(id, data);
    else     await API.users.create(data);
    Modal.close();
    Toast.success(id ? 'Staff updated' : 'Staff created');
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

// ── Global Search ─────────────────────────────────────────────────────────
function handleGlobalSearch(val) {
  if (!val || val.length < 2) return;
  if (App.currentPage !== 'bills') App.navigate('bills');
  setTimeout(() => {
    billsState.filters.search = val;
    loadBills(1, false);
  }, 100);
}

// ── Debounce Utility ──────────────────────────────────────────────────────
let _debounceTimers = {};
function debounce(fn, delay) {
  return function(...args) {
    const key = fn.toString().slice(0, 30);
    clearTimeout(_debounceTimers[key]);
    _debounceTimers[key] = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
