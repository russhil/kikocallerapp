// ============================================================
// Kiko AI — Super Dashboard (app.js)  v5 — Azure PostgREST
// ============================================================

// ---------------------------------------------------------
// 1. CONFIGURATION
// ---------------------------------------------------------
const API_BASE = '/rest/v1';
const API_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoia2lrb2NhbGxlci1zZWxmaG9zdCJ9.78_YEZ8RnleBRjK5mnwgNtSd8oMHPzDDxJt_6IDsfBU';
const DASHBOARD_PASSWORD = 'admin';
let _perPage = 25;
const PER_PAGE_OPTIONS = [20, 50, 100];
const AUTO_REFRESH_MS = 30000;
Object.defineProperty(window, 'PER_PAGE', { get: () => _perPage });

// ---------------------------------------------------------
// 2. STATE
// ---------------------------------------------------------
let ordersChartInstance = null;
let statusChartInstance = null;
let _refreshTimer = null;
let _autoRefreshInterval = null;

const state = {
    dateFilter: '7days',
    dateStart: null,
    dateEnd: null,
    globalSeller: '',
    globalOrders: 'all',
    globalGmv: 'all',
    pages: { orders: 1, transcripts: 1, activity: 1, users: 1, firstOtp: 1, crm: 1, activeSellers: 1 },
    sort: {
        crm: { col: 'ts', dir: 'desc' },
        activeSellers: { col: 'orders', dir: 'desc' },
    },
    activeTab: 'tab-overview',
    loading: false,
    error: null,
};

const globalData = {
    orders: [], recordings: [], activity: [], users: [], stores: [],
    _rawOrders: [], _rawRecordings: [], _rawActivity: [], _rawUsers: [], _rawStores: [],
    _activeSellersMap: new Map(),
};

// ---------------------------------------------------------
// 2b. PostgREST FETCH HELPER
// ---------------------------------------------------------
async function pgFetch(table, { orderCol = 'created_at', ascending = false, gte, lte, limit, offset } = {}) {
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('order', `${orderCol}.${ascending ? 'asc' : 'desc'}`);
    if (gte !== undefined) params.append(orderCol, `gte.${gte}`);
    if (lte !== undefined) params.append(orderCol, `lte.${lte}`);
    if (limit !== undefined) params.set('limit', limit);
    if (offset !== undefined) params.set('offset', offset);
    const url = `${API_BASE}/${table}?${params.toString()}`;
    const resp = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${API_KEY}`, 'apikey': API_KEY, 'Accept': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0'
        },
    });
    if (!resp.ok) throw new Error(`PostgREST ${table}: ${resp.status} ${resp.statusText}`);
    return resp.json();
}

// ---------------------------------------------------------
// 3. DATE FILTER SYSTEM
// ---------------------------------------------------------
function getDateRange(preset) {
    if (preset === 'all') return { start: null, end: null };
    if (preset === 'custom') return { start: state.dateStart, end: state.dateEnd };

    // Get current time string in IST, then parse it locally to manipulate days easily
    const nowStr = new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"});
    const nowIST = new Date(nowStr);
    
    // Create true IST timestamp boundaries
    // UTC time of IST midnight is (year, month, date, -5, -30, 0, 0)
    const getISTMidnight = (dateObj) => new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), -5, -30, 0, 0));
    const getISTEndOfDay = (dateObj) => new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 18, 29, 59, 999));

    let startObj = new Date(nowIST);
    let endObj = new Date(nowIST);
    
    switch (preset) {
        case 'today': break;
        case 'yesterday':
            startObj.setDate(startObj.getDate() - 1);
            endObj = new Date(startObj);
            break;
        case '3days': startObj.setDate(startObj.getDate() - 2); break;
        case '15days': startObj.setDate(startObj.getDate() - 14); break;
        case '7days':
        default: startObj.setDate(startObj.getDate() - 6); break;
    }

    return {
        start: getISTMidnight(startObj),
        end: getISTEndOfDay(endObj)
    };
}

function setDateFilter(preset) {
    state.dateFilter = preset;
    Object.keys(state.pages).forEach(k => state.pages[k] = 1);
    document.querySelectorAll('.date-chip[data-filter]').forEach(c => c.classList.toggle('active', c.dataset.filter === preset));
    if (preset !== 'custom') {
        document.getElementById('date-start').value = '';
        document.getElementById('date-end').value = '';
    }
    fetchDashboardData();
}

function onCustomDateChange() {
    const s = document.getElementById('date-start').value;
    const e = document.getElementById('date-end').value;
    if (s || e) {
        state.dateFilter = 'custom';
        state.dateStart = s ? new Date(s + 'T00:00:00') : null;
        state.dateEnd = e ? new Date(e + 'T23:59:59.999') : null;
        document.querySelectorAll('.date-chip[data-filter]').forEach(c => c.classList.remove('active'));
        Object.keys(state.pages).forEach(k => state.pages[k] = 1);
        fetchDashboardData();
    }
}

// ---------------------------------------------------------
// 4. LIFECYCLE
// ---------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem('kiko_dashboard_auth') === 'true') showDashboard();

    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const pwd = document.getElementById('password-input').value;
        if (pwd === DASHBOARD_PASSWORD) {
            sessionStorage.setItem('kiko_dashboard_auth', 'true');
            showDashboard();
        } else {
            document.getElementById('login-error').classList.remove('hidden');
            setTimeout(() => document.getElementById('login-error').classList.add('hidden'), 3000);
        }
    });

    document.getElementById('refresh-btn').addEventListener('click', () => {
        const btn = document.getElementById('refresh-btn');
        btn.classList.add('animate-spin');
        fetchDashboardData().finally(() => setTimeout(() => btn.classList.remove('animate-spin'), 600));
    });

    document.getElementById('date-start').addEventListener('change', onCustomDateChange);
    document.getElementById('date-end').addEventListener('change', onCustomDateChange);

    const gSeller = document.getElementById('global-seller-filter');
    const gOrders = document.getElementById('global-orders-filter');
    const gGmv = document.getElementById('global-gmv-filter');
    if (gSeller) gSeller.addEventListener('input', () => { state.globalSeller = gSeller.value; state.pages.orders = 1; state.pages.crm = 1; state.pages.activeSellers = 1; applyGlobalFiltersAndRender(); });
    if (gOrders) gOrders.addEventListener('change', () => { state.globalOrders = gOrders.value; state.pages.orders = 1; state.pages.crm = 1; state.pages.activeSellers = 1; applyGlobalFiltersAndRender(); });
    if (gGmv) gGmv.addEventListener('change', () => { state.globalGmv = gGmv.value; state.pages.orders = 1; state.pages.crm = 1; state.pages.activeSellers = 1; applyGlobalFiltersAndRender(); });

    const orderSearch = document.getElementById('order-search');
    const orderStatus = document.getElementById('order-status-filter');
    if (orderSearch) orderSearch.addEventListener('input', () => { state.pages.orders = 1; renderFullOrders(globalData.orders); });
    if (orderStatus) orderStatus.addEventListener('change', () => { state.pages.orders = 1; renderFullOrders(globalData.orders); });

    const actFilter = document.getElementById('activity-type-filter');
    if (actFilter) actFilter.addEventListener('change', () => { state.pages.activity = 1; renderFullActivity(globalData.activity); });
});

function setupChartFilter() {
    const sel = document.getElementById('chart-timeframe-filter');
    if (sel && !sel.dataset.bound) {
        sel.addEventListener('change', () => renderOrdersOverTime());
        sel.dataset.bound = 'true';
    }
}

function showDashboard() {
    document.getElementById('login-screen').classList.add('fade-out');
    setTimeout(() => {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        setupChartFilter();
        fetchDashboardData();
        startAutoRefresh();
    }, 300);
}

// ---------------------------------------------------------
// 5. SIDEBAR & TABS
// ---------------------------------------------------------
function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.tab-content').forEach(el => { el.classList.add('hidden'); el.classList.remove('block'); });
    document.querySelectorAll('.sidebar-link').forEach(el => {
        el.classList.remove('active', 'bg-brand-50', 'text-brand-700');
        el.classList.add('text-gray-600', 'hover:bg-gray-100');
    });
    document.querySelectorAll('.mobile-tab-btn').forEach(el => {
        el.classList.remove('active', 'bg-brand-50', 'text-brand-700', 'font-semibold');
        el.classList.add('text-gray-600', 'hover:bg-gray-100', 'font-medium');
    });
    const tab = document.getElementById(tabId);
    if (tab) { tab.classList.remove('hidden'); tab.classList.add('block'); }
    document.querySelectorAll(`.sidebar-link[data-tab="${tabId}"]`).forEach(btn => {
        btn.classList.add('active', 'bg-brand-50', 'text-brand-700');
        btn.classList.remove('text-gray-600', 'hover:bg-gray-100');
    });
    document.querySelectorAll(`.mobile-tab-btn[data-tab="${tabId}"]`).forEach(btn => {
        btn.classList.add('active', 'bg-brand-50', 'text-brand-700', 'font-semibold');
        btn.classList.remove('text-gray-600', 'hover:bg-gray-100', 'font-medium');
    });
    const titles = {
        'tab-overview': 'Dashboard Overview', 'tab-orders': 'Orders',
        'tab-transcripts': 'Call Transcriptions', 'tab-users': 'Users & Logins',
        'tab-activity': 'Activity Logs', 'tab-first-otp': 'First OTP Requests',
        'tab-crm': 'CRM Leads', 'tab-active-sellers': 'Active Sellers',
        'tab-seller-retention': 'Seller Retention'
    };
    document.getElementById('page-title').innerText = titles[tabId] || 'Dashboard';
    closeSidebar();
    if (typeof renderActiveTab === 'function') renderActiveTab();
}

function openSidebar() { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebar-overlay').classList.add('open'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebar-overlay').classList.remove('open'); }

// ---------------------------------------------------------
// 6. AUTO-REFRESH
// ---------------------------------------------------------
function startAutoRefresh() {
    if (_autoRefreshInterval) clearInterval(_autoRefreshInterval);
    const rtEl = document.getElementById('rt-status');
    if (rtEl) { rtEl.className = 'rt-indicator rt-connected'; rtEl.innerHTML = '<span class="rt-dot"></span><span>Live</span>'; }
    _autoRefreshInterval = setInterval(() => { if (!state.loading) fetchDashboardData(); }, AUTO_REFRESH_MS);
}
function debouncedRefresh() { if (_refreshTimer) clearTimeout(_refreshTimer); _refreshTimer = setTimeout(() => fetchDashboardData(), 800); }

// ---------------------------------------------------------
// 7. DATA FETCHING
// ---------------------------------------------------------
async function fetchDashboardData() {
    if (state.loading) return;
    state.loading = true;

    if (globalData._rawOrders.length === 0) {
        const skelRow = `<tr class="animate-pulse border-b border-gray-100"><td class="p-4"><div class="h-4 bg-gray-200 rounded w-24"></div></td><td class="p-4"><div class="h-4 bg-gray-200 rounded w-32"></div></td><td class="p-4"><div class="h-4 bg-gray-200 rounded w-20"></div></td><td class="p-4"><div class="h-4 bg-gray-200 rounded w-16"></div></td></tr>`;
        const tbodySkel = Array(5).fill(skelRow).join('');
        ['orders-tbody', 'transcripts-tbody', 'users-tbody', 'activity-tbody', 'crm-tbody', 'active-sellers-tbody'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = tbodySkel;
        });
    }

    document.getElementById('last-updated').innerText = `Last updated: ${new Date().toLocaleTimeString('en-IN')}`;
    const { start, end } = getDateRange(state.dateFilter);
    try {
        const fetchAll = async (table, dateCol = 'created_at') => {
            let res = [], offset = 0;
            const step = 1000;
            let hasMore = true;
            while (hasMore) {
                const opts = { orderCol: dateCol, ascending: false, limit: step, offset };
                if (start) opts.gte = start.getTime();
                if (end) opts.lte = end.getTime();
                const data = await pgFetch(table, opts);
                if (data && data.length > 0) { res = res.concat(data); offset += step; if (data.length < step) hasMore = false; }
                else hasMore = false;
            }
            return res;
        };
        const [allOrders, allRecordings, allActivity] = await Promise.all([
            fetchAll('orders'), fetchAll('recordings', 'created_at'), fetchAll('activity_log'),
        ]);
        let allUsers = [], allStores = [];
        const refCache = sessionStorage.getItem('kiko_ref_data');
        if (refCache) {
            try {
                const p = JSON.parse(refCache);
                if (Date.now() - p.ts < 300000) { allUsers = p.users; allStores = p.stores; }
            } catch(e) {}
        }
        if (allUsers.length === 0 || allStores.length === 0) {
            try { allUsers = await pgFetch('users', { orderCol: 'last_login_at', ascending: false }); } catch (e) { console.error('Users fetch:', e); }
            try { allStores = await pgFetch('stores', { orderCol: 'last_active_at', ascending: false }); } catch (e) { console.error('Stores fetch:', e); }
            if (allUsers.length > 0 && allStores.length > 0) sessionStorage.setItem('kiko_ref_data', JSON.stringify({ ts: Date.now(), users: allUsers, stores: allStores }));
        }
        globalData._rawOrders = allOrders || [];
        globalData._rawRecordings = allRecordings || [];
        globalData._rawActivity = allActivity || [];
        globalData._rawUsers = allUsers || [];
        globalData._rawStores = allStores || [];

        applyGlobalFiltersAndRender();
    } catch (err) {
        console.error('Dashboard fetch error:', err);
        state.error = err.message;
        const rtEl = document.getElementById('rt-status');
        if (rtEl) { rtEl.className = 'rt-indicator rt-disconnected'; rtEl.innerHTML = '<span class="rt-dot"></span><span>Offline</span>'; }
    } finally { state.loading = false; }
}

function applyGlobalFiltersAndRender() {
    const baseMap = getActiveSellersMap(globalData._rawOrders);
    const q = (state.globalSeller || '').toLowerCase();
    const ord = state.globalOrders;
    const gmv = state.globalGmv;

    const hasFilters = q || ord !== 'all' || gmv !== 'all';
    let allowedPhones = null;

    if (hasFilters) {
        allowedPhones = new Set();
        const evaluatePhone = (phone, name) => {
            if (!phone) return;
            const data = baseMap.get(phone) || { orders: 0, gmv: 0 };
            const matchQ = !q || name.includes(q) || phone.includes(q);
            
            let matchOrd = true;
            if (ord === '1+') matchOrd = data.orders >= 1;
            if (ord === '5+') matchOrd = data.orders >= 5;
            if (ord === '10+') matchOrd = data.orders >= 10;
            if (ord === '50+') matchOrd = data.orders >= 50;

            let matchGmv = true;
            if (gmv === '1k+') matchGmv = data.gmv >= 1000;
            if (gmv === '5k+') matchGmv = data.gmv >= 5000;
            if (gmv === '10k+') matchGmv = data.gmv >= 10000;
            if (gmv === '50k+') matchGmv = data.gmv >= 50000;

            if (matchQ && matchOrd && matchGmv) allowedPhones.add(phone);
        };

        globalData._rawUsers.forEach(u => evaluatePhone(u.phone, (u.shop_name || '').toLowerCase()));
        baseMap.forEach((_, phone) => { if (!allowedPhones.has(phone)) evaluatePhone(phone, ''); });
    }

    if (allowedPhones) {
        globalData.orders = globalData._rawOrders.filter(o => allowedPhones.has(o.store_phone));
        globalData.users = globalData._rawUsers.filter(u => allowedPhones.has(u.phone));
        globalData.activity = globalData._rawActivity.filter(a => allowedPhones.has(a.user_phone || a.store_phone));
        globalData.recordings = globalData._rawRecordings.filter(r => allowedPhones.has(r.store_phone || r.user_phone || r.phone)); 
        globalData.stores = globalData._rawStores.filter(s => allowedPhones.has(s.phone));
    } else {
        globalData.orders = [...globalData._rawOrders];
        globalData.users = [...globalData._rawUsers];
        globalData.activity = [...globalData._rawActivity];
        globalData.recordings = [...globalData._rawRecordings];
        globalData.stores = [...globalData._rawStores];
    }

    globalData._activeSellersMap = getActiveSellersMap(globalData.orders);

    processMetrics(); renderCharts(); renderFunnel(); fetchAllTimeData(); renderRecentLogins();
    renderActiveTab();
}

function renderActiveTab() {
    switch (state.activeTab) {
        case 'tab-orders': return renderFullOrders(globalData.orders);
        case 'tab-transcripts': return renderFullTranscripts(globalData.recordings);
        case 'tab-users': return renderFullUsers(globalData.users, globalData.orders);
        case 'tab-activity': return renderFullActivity(globalData.activity);
        case 'tab-first-otp': return renderFirstOtp(globalData.activity, globalData.users);
        case 'tab-crm': return renderCRM(globalData.activity, globalData.users);
        case 'tab-active-sellers': return renderActiveSellers(globalData.orders, globalData.users);
        case 'tab-seller-retention': return renderRetentionTab();
        case 'tab-overview':
        default:
            // Overview relies on processMetrics, renderCharts, etc. which are always called.
            break;
    }
}

// ---------------------------------------------------------
// 8. TIMESTAMP HELPERS
// ---------------------------------------------------------
function parseTs(val) {
    if (!val) return null;
    if (typeof val === 'number') return val;
    const n = parseInt(val);
    if (!isNaN(n) && n > 1e12) return n;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.getTime();
}
function fmtDate(ts) {
    if (!ts) return '—';
    const d = new Date(typeof ts === 'number' ? ts : parseTs(ts));
    if (isNaN(d.getTime())) return '—';
    const day = d.getDate().toString().padStart(2, '0');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mon = months[d.getMonth()];
    const year = d.getFullYear();
    let hr = d.getHours();
    const ampm = hr >= 12 ? 'pm' : 'am';
    hr = hr % 12 || 12;
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${day} ${mon} ${year} ${hr.toString().padStart(2, '0')}:${min} ${ampm}`;
}
function timeAgo(ts) {
    if (!ts) return '';
    const ms = Date.now() - (typeof ts === 'number' ? ts : parseTs(ts));
    if (ms < 0) return 'just now';
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'just now'; if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}
function fmtDuration(ms) {
    if (!ms || ms <= 0) return '—';
    const secs = Math.floor(ms / 1000);
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------
// 9. METRICS
// ---------------------------------------------------------
function processMetrics() {
    const { orders, users, recordings } = globalData;
    const { start, end } = getDateRange(state.dateFilter);
    const installsInRange = state.dateFilter === 'all' ? users : users.filter(u => {
        const t = parseTs(u.created_at);
        if (t === null) return false;
        if (start && t < start.getTime()) return false;
        if (end && t > end.getTime()) return false;
        return true;
    });
    document.getElementById('stat-installs').innerText = installsInRange.length;
    document.getElementById('stat-orders').innerText = orders.length;
    const totalSales = orders.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
    document.getElementById('stat-sales').innerText = `₹${totalSales.toLocaleString('en-IN')}`;
    const custSet = new Set();
    orders.forEach(o => { if (o.customer_phone) custSet.add(o.customer_phone); });
    const statCustEl = document.getElementById('stat-customers');
    if (statCustEl) statCustEl.innerText = custSet.size;
    // Single source of truth for active sellers
    const activeSellerEl = document.getElementById('stat-active-sellers');
    if (activeSellerEl) activeSellerEl.innerText = (globalData._activeSellersMap || new Map()).size;
    const onboarded = users.filter(u => u.shop_name && u.shop_name.length > 0).length;
    document.getElementById('stat-sellers').innerText = onboarded > 0 ? onboarded : users.length;
    const aov = orders.length > 0 ? totalSales / orders.length : 0;
    document.getElementById('stat-aov').innerText = `₹${Math.round(aov).toLocaleString('en-IN')}`;
    document.getElementById('total-calls').innerText = recordings.length;
    if (recordings.length > 0) {
        const lt = parseTs(recordings[0].date_recorded || recordings[0].created_at);
        const el = document.getElementById('transcripts-last-updated');
        if (el && lt) el.innerText = `Latest record: ${fmtDate(lt)}`;
    }
    const badge = document.getElementById('login-count-badge');
    if (badge) badge.innerText = `${users.reduce((s, u) => s + (u.login_count || 0), 0)} total logins`;
}

// ---------------------------------------------------------
// 10. PAGINATION
// ---------------------------------------------------------
function renderPagination(containerId, total, page, type, callback) {
    const cont = document.getElementById(containerId);
    if (!cont) return;
    const maxP = Math.ceil(total / _perPage) || 1;
    if (total <= _perPage && maxP <= 1) { cont.classList.add('hidden'); return; }
    cont.classList.remove('hidden');
    const rowsOpts = PER_PAGE_OPTIONS.map(n => `<option value="${n}" ${n === _perPage ? 'selected' : ''}>${n} rows</option>`).join('');
    cont.innerHTML = `
        <div class="flex items-center gap-3">
            <span class="text-sm text-gray-500">Page ${page} of ${maxP} &nbsp;&middot;&nbsp; ${total} records</span>
            <select class="px-2 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-brand-500 bg-gray-50" id="perpage-sel-${containerId}">${rowsOpts}</select>
        </div>
        <div class="flex gap-2">
            <button class="px-3 py-1.5 border rounded-lg text-sm font-medium ${page===1?'text-gray-300 cursor-not-allowed':'text-brand-600 hover:bg-gray-50'}" ${page===1?'disabled':''} id="prev-${containerId}">&#8592; Prev</button>
            <button class="px-3 py-1.5 border rounded-lg text-sm font-medium ${page===maxP?'text-gray-300 cursor-not-allowed':'text-brand-600 hover:bg-gray-50'}" ${page===maxP?'disabled':''} id="next-${containerId}">Next &#8594;</button>
        </div>`;
    const prev = document.getElementById(`prev-${containerId}`);
    const next = document.getElementById(`next-${containerId}`);
    const ppSel = document.getElementById(`perpage-sel-${containerId}`);
    if (prev && page > 1) prev.onclick = () => { state.pages[type] = page - 1; callback(); };
    if (next && page < maxP) next.onclick = () => { state.pages[type] = page + 1; callback(); };
    if (ppSel) ppSel.onchange = (e) => { _perPage = parseInt(e.target.value); state.pages[type] = 1; callback(); };
}
function paginate(arr, page) { return arr.slice((page - 1) * _perPage, page * _perPage); }

// ---------------------------------------------------------
// 10b. ACTIVE SELLERS — Single Source of Truth
// ---------------------------------------------------------
function getActiveSellersMap(orders) {
    const map = new Map();
    const { start, end } = getDateRange(state.dateFilter);
    const filtered = state.dateFilter === 'all' ? orders : orders.filter(o => {
        const t = parseTs(o.created_at);
        if (!t) return false;
        if (start && t < start.getTime()) return false;
        if (end && t > end.getTime()) return false;
        return true;
    });
    filtered.forEach(o => {
        if (!o.store_phone) return;
        if (!map.has(o.store_phone)) map.set(o.store_phone, { orders: 0, gmv: 0, first: null, last: null });
        const s = map.get(o.store_phone);
        s.orders++;
        s.gmv += (parseFloat(o.total_amount) || 0);
        const t = parseTs(o.created_at);
        if (t) { if (!s.first || t < s.first) s.first = t; if (!s.last || t > s.last) s.last = t; }
    });
    return map;
}

// Sort helper for column headers
function makeSortHeader(label, col, tableKey, callback, extraClass = '') {
    const cur = state.sort[tableKey];
    const active = cur && cur.col === col;
    const dir = active ? cur.dir : null;
    const arrow = active ? (dir === 'asc' ? ' &#9650;' : ' &#9660;') : ' &#8645;';
    return `<th class="sortable-th cursor-pointer select-none ${extraClass}" data-sort-table="${tableKey}" data-sort-col="${col}">${label}<span class="sort-arrow text-[10px] ml-1 ${active ? 'text-brand-600' : 'text-gray-300'}">${arrow}</span></th>`;
}
function bindSortHeaders(tableKey, callback) {
    document.querySelectorAll(`[data-sort-table="${tableKey}"]`).forEach(th => {
        if (th.dataset.sortBound) return;
        th.dataset.sortBound = 'true';
        th.addEventListener('click', () => {
            const col = th.dataset.sortCol;
            if (!state.sort[tableKey]) state.sort[tableKey] = { col, dir: 'desc' };
            const cur = state.sort[tableKey];
            if (cur.col === col) cur.dir = cur.dir === 'asc' ? 'desc' : 'asc';
            else { cur.col = col; cur.dir = 'desc'; }
            state.pages[tableKey] = 1;
            callback();
        });
    });
}
function openCRMWithFilter(statusFilter) {
    switchTab('tab-crm');
    const sel = document.getElementById('crm-status-filter');
    if (sel) { sel.value = statusFilter; state.pages.crm = 1; renderCRM(globalData.activity, globalData.users); }
}

// ---------------------------------------------------------
// 11. CHARTS
// ---------------------------------------------------------
function renderCharts() {
    const { orders } = globalData;

    // --- Order Status Pie ---
    const statusCounts = { pending: 0, completed: 0, cancelled: 0 };
    orders.forEach(o => {
        const st = getOrderStatus(o).toLowerCase();
        if (st === 'delivered' || st === 'completed') statusCounts.completed++;
        else if (st === 'cancelled') statusCounts.cancelled++;
        else statusCounts.pending++;
    });

    document.getElementById('pie-center-total').innerText = orders.length;

    const ctxS = document.getElementById('statusChart')?.getContext('2d');
    if (ctxS) {
        if (statusChartInstance) statusChartInstance.destroy();
        statusChartInstance = new Chart(ctxS, {
            type: 'doughnut',
            data: {
                labels: ['Pending', 'Completed', 'Cancelled'],
                datasets: [{ data: [statusCounts.pending, statusCounts.completed, statusCounts.cancelled], backgroundColor: ['#f59e0b', '#10b981', '#ef4444'], borderWidth: 0, cutout: '75%', hoverOffset: 6 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 11 } } } } }
        });
    }

    // Line chart is now rendered separately
    renderOrdersOverTime();
}

async function renderOrdersOverTime() {
    const { start, end } = getDateRange(state.dateFilter);
    const startD = start || new Date(Date.now() - 7 * 86400000);
    const endD = end || new Date();
    const dayCount = Math.min(Math.ceil((endD - startD) / 86400000) + 1, 60);

    const ordersMap = {};
    for (let i = 0; i < dayCount; i++) {
        const d = new Date(startD);
        d.setDate(d.getDate() + i);
        ordersMap[d.toISOString().split('T')[0]] = 0;
    }

    const ordersForChart = globalData.orders || [];
    ordersForChart.forEach(o => {
        const ts = parseTs(o.created_at);
        if (!ts) return;
        const key = new Date(ts).toISOString().split('T')[0];
        if (ordersMap[key] !== undefined) ordersMap[key]++;
    });

    const ctxO = document.getElementById('ordersChart')?.getContext('2d');
    if (ctxO) {
        if (ordersChartInstance) ordersChartInstance.destroy();
        const labels = Object.keys(ordersMap).map(d => { const p = d.split('-'); return `${p[2]}/${p[1]}`; });
        ordersChartInstance = new Chart(ctxO, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Orders', data: Object.values(ordersMap), borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,0.08)', borderWidth: 2.5, tension: 0.4, fill: true, pointBackgroundColor: '#fff', pointBorderColor: '#4f46e5', pointBorderWidth: 2, pointRadius: 3, pointHoverRadius: 5 },
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { borderDash: [4, 4], color: '#f1f5f9' }, border: { display: false }, ticks: { font: { size: 11 }, precision: 0 } },
                    x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 } } }
                }
            }
        });
    }
}

// ---------------------------------------------------------
// 11b. CONVERSION FUNNEL
// ---------------------------------------------------------
function renderFunnel() {
    const { orders, users, activity } = globalData;
    const container = document.getElementById('funnel-container');
    if (!container) return;

    // Build users phone→shopName map for OTP success detection
    const usersMap = {};
    users.forEach(u => { if (u.phone) usersMap[u.phone] = u.shop_name || ''; });

    // Stage 1: Total Installs — users created within selected date range
    const { start, end } = getDateRange(state.dateFilter);
    const installsCount = state.dateFilter === 'all'
        ? users.length
        : users.filter(u => {
            const t = parseTs(u.created_at);
            if (t === null) return false;
            if (start && t < start.getTime()) return false;
            if (end && t > end.getTime()) return false;
            return true;
        }).length;

    // Stages 2 & 3: First OTP events (activity already date-filtered by fetchAll)
    const otpEvents = activity.filter(a =>
        a.action === 'auth.first_otp' || a.action_type === 'auth.first_otp'
    );
    const otpSuccess = otpEvents.filter(a => {
        const phone = a.user_phone || a.store_phone || '';
        return phone && usersMap[phone];
    }).length;
    const otpFailure = otpEvents.length - otpSuccess;

    // Stage 4: Active Sellers — unique store_phone in orders (date-filtered)
    const activeSellersSet = new Set();
    orders.forEach(o => { if (o.store_phone) activeSellersSet.add(o.store_phone); });
    const activeSellers = activeSellersSet.size;

    // Stage 5: Total Orders (date-filtered)
    const totalOrders = orders.length;

    // Stage 6: Total GMV (date-filtered)
    const totalGMV = orders.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
    const gmvDisplay = `₹${Math.round(totalGMV).toLocaleString('en-IN')}`;

    const stages = [
        { label: 'Total Installs',     value: installsCount,  icon: '📲', color: '#8b5cf6', desc: 'New users registered in period' },
        { label: 'First OTP Success',  value: otpSuccess,     icon: '✅', color: '#10b981', desc: 'OTP verified & shop onboarded' },
        { label: 'First OTP Failure',  value: otpFailure,     icon: '⚠️', color: '#f59e0b', desc: 'OTP attempted, not onboarded' },
        { label: 'Active Sellers',     value: activeSellers,  icon: '🏪', color: '#f97316', desc: 'Sellers with ≥1 order in period' },
        { label: 'Total Orders',       value: totalOrders,    icon: '📦', color: '#4f46e5', desc: 'Orders placed in period' },
        { label: 'Total GMV',          value: gmvDisplay,     icon: '💰', color: '#059669', desc: 'Gross merchandise value in period', isAmount: true },
    ];

    // Max numeric value across comparable stages for bar width calculation
    const numericVals = [installsCount, otpSuccess + otpFailure, activeSellers, totalOrders];
    const maxVal = Math.max(...numericVals, 1);

    container.innerHTML = stages.map((s, i) => {
        const numVal = s.isAmount ? totalGMV : Number(s.value);
        const pct = s.isAmount ? Math.min(100, Math.round((totalGMV / Math.max(totalGMV, 1)) * 100)) : Math.round((numVal / maxVal) * 100);

        // Drop-off arrow between consecutive numeric stages
        let dropBadge = '';
        if (i > 0 && !s.isAmount && !stages[i - 1].isAmount) {
            const prev = Number(stages[i - 1].value);
            if (prev > 0 && numVal < prev) {
                const drop = Math.round(((prev - numVal) / prev) * 100);
                dropBadge = `<span class="funnel-drop">▼ ${drop}%</span>`;
            }
        }

        const displayVal = s.isAmount ? gmvDisplay : Number(s.value).toLocaleString('en-IN');

        return `
        <div class="funnel-stage">
            <div class="funnel-label">
                <span class="funnel-icon">${s.icon}</span>
                <div>
                    <div class="funnel-stage-name">${s.label}</div>
                    <div class="funnel-stage-desc">${s.desc}</div>
                </div>
            </div>
            <div class="funnel-bar-wrap">
                <div class="funnel-bar" style="--pct:${pct}%; --clr:${s.color}">
                    <div class="funnel-bar-fill"></div>
                </div>
            </div>
            <div class="funnel-value-col">
                <span class="funnel-value">${displayVal}</span>
                ${dropBadge}
            </div>
        </div>`;
    }).join('');
}

// ---------------------------------------------------------
// 11c. ALL TIME DATA
// ---------------------------------------------------------
async function fetchAllTimeData() {
    try {
        const { users, stores } = globalData;
        const sellersEl = document.getElementById('alltime-sellers');
        const usersEl = document.getElementById('alltime-users');
        const ordersEl = document.getElementById('alltime-orders');
        const customersEl = document.getElementById('alltime-customers');

        if (usersEl) usersEl.innerText = (users?.length || 0).toLocaleString('en-IN');
        if (sellersEl) sellersEl.innerText = (stores?.length || 0).toLocaleString('en-IN');

        const cacheKey = 'kiko_all_time_stats';
        const cached = sessionStorage.getItem(cacheKey);
        let allOrdersPhones = [];
        
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.ts < 300000) { // 5 min TTL
                    allOrdersPhones = parsed.data;
                }
            } catch (e) { console.error('Cache parse error'); }
        }
        
        if (allOrdersPhones.length === 0) {
            let offset = 0;
            const step = 2000;
            let hasMore = true;
            while (hasMore) {
                const url = `${API_BASE}/orders?select=customer_phone&limit=${step}&offset=${offset}`;
                const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${API_KEY}`, 'apikey': API_KEY } });
                if (!resp.ok) break;
                const data = await resp.json();
                if (data && data.length > 0) {
                    allOrdersPhones = allOrdersPhones.concat(data);
                    offset += step;
                    if (data.length < step) hasMore = false;
                } else {
                    hasMore = false;
                }
            }
            if (allOrdersPhones.length > 0) {
                sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: allOrdersPhones }));
            }
        }
        
        if (ordersEl) ordersEl.innerText = allOrdersPhones.length.toLocaleString('en-IN');
        const custSet = new Set();
        allOrdersPhones.forEach(o => { if (o.customer_phone) custSet.add(o.customer_phone); });
        if (customersEl) customersEl.innerText = custSet.size.toLocaleString('en-IN');
        
    } catch (e) {
        console.error('All time fetch error', e);
    }
}
// ---------------------------------------------------------
function getOrderStatus(o) {
    if (o.is_cancelled) return 'Cancelled';
    const ds = (o.delivery_status || o.status || 'pending').toLowerCase();
    if (ds === 'delivered' || ds === 'completed') return 'Delivered';
    if (ds === 'cancelled') return 'Cancelled';
    if (ds === 'dispatched') return 'Dispatched';
    return 'Pending';
}

function statusColor(st) {
    const s = st.toLowerCase();
    if (s === 'delivered' || s === 'completed') return 'bg-emerald-100 text-emerald-800';
    if (s === 'cancelled') return 'bg-red-100 text-red-800';
    if (s === 'dispatched') return 'bg-blue-100 text-blue-800';
    return 'bg-amber-100 text-amber-800';
}

// ---------------------------------------------------------
// 13. RECENT LOGINS (Overview)
// ---------------------------------------------------------
function renderRecentLogins() {
    const { users } = globalData;
    const tbody = document.getElementById('recent-logins-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-8">No users found.</td></tr>';
        return;
    }

    const recent = users.filter(u => u.last_login_at).slice(0, 10);
    recent.forEach((u, index) => {
        const lt = parseTs(u.last_login_at);
        const online = lt && (Date.now() - lt) < 3600000;
        const dot = online
            ? '<span class="inline-flex items-center gap-1"><span class="w-2 h-2 bg-green-500 rounded-full pulse-soft"></span><span class="text-green-600 text-xs font-semibold">Online</span></span>'
            : '<span class="inline-flex items-center gap-1"><span class="w-2 h-2 bg-gray-300 rounded-full"></span><span class="text-gray-500 text-xs font-medium">Offline</span></span>';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50/50 transition-colors';
        tr.innerHTML = `
            <td class="px-6 py-3.5 whitespace-nowrap text-xs text-gray-500">${index + 1}</td>
            <td class="px-6 py-3.5 font-medium text-gray-900 font-mono text-sm">${u.phone || '—'}</td>
            <td class="px-6 py-3.5 text-gray-700 text-sm">${u.shop_name || '<span class="text-gray-400 italic">Not setup</span>'}</td>
            <td class="px-6 py-3.5"><div class="text-sm text-gray-900">${fmtDate(lt)}</div><div class="text-xs text-gray-400">${timeAgo(lt)}</div></td>
            <td class="px-6 py-3.5"><span class="px-2.5 py-1 text-xs font-bold bg-brand-50 text-brand-700 rounded-full">${u.login_count || 0}</span></td>
            <td class="px-6 py-3.5">${dot}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ---------------------------------------------------------
// 14. ORDERS TABLE
// ---------------------------------------------------------
function renderFullOrders(orders) {
    const tbody = document.getElementById('full-orders-table-body');
    if (!tbody) return;

    // Filters
    const q = (document.getElementById('order-search')?.value || '').toLowerCase();
    const sf = document.getElementById('order-status-filter')?.value || 'all';

    let filtered = orders.filter(o => {
        const text = `${o.order_id} ${o.customer_name} ${o.customer_phone} ${o.store_name}`.toLowerCase();
        const matchQ = !q || text.includes(q);
        const st = getOrderStatus(o).toLowerCase();
        const matchS = sf === 'all' || st === sf;
        return matchQ && matchS;
    });

    tbody.innerHTML = '';
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-8">No orders found.</td></tr>';
        document.getElementById('pagination-orders')?.classList.add('hidden');
        return;
    }

    const page = state.pages.orders;
    const items = paginate(filtered, page);
    renderPagination('pagination-orders', filtered.length, page, 'orders', () => renderFullOrders(orders));

    items.forEach((o, index) => {
        const srNo = (page - 1) * PER_PAGE + index + 1;
        const st = getOrderStatus(o);
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50/50 transition-colors cursor-pointer';
        tr.onclick = () => showOrderDetail(o);
        tr.innerHTML = `
            <td class="px-6 py-3.5 whitespace-nowrap text-xs text-gray-500">${srNo}</td>
            <td class="px-6 py-3.5"><div class="font-semibold text-brand-600 text-sm">#${(o.order_id || '----')}</div><div class="text-xs text-gray-400">${fmtDate(o.created_at)}</div></td>
            <td class="px-6 py-3.5"><div class="font-medium text-gray-900 text-sm">${o.customer_name || 'Unknown'}</div><div class="text-xs text-gray-500">${o.customer_phone || ''}</div></td>
            <td class="px-6 py-3.5"><div class="text-sm text-gray-700">${o.store_name || o.shop_name || '—'}</div><div class="text-xs text-gray-400">${o.store_phone || ''}</div></td>
            <td class="px-6 py-3.5 font-semibold text-sm">₹${o.total_amount || '0'}</td>
            <td class="px-6 py-3.5"><span class="px-2.5 py-1 text-xs font-semibold rounded-full ${statusColor(st)}">${st}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// ---------------------------------------------------------
// 15. ORDER DETAIL MODAL
// ---------------------------------------------------------
function showOrderDetail(o) {
    document.getElementById('modal-order-id').innerText = '#' + (o.order_id || '----');
    document.getElementById('modal-order-date').innerText = fmtDate(o.created_at);

    const cname = o.customer_name || 'Unknown';
    document.getElementById('modal-cust-name').innerText = cname;
    document.getElementById('modal-cust-init').innerText = cname[0]?.toUpperCase() || '?';
    document.getElementById('modal-cust-phone').innerText = o.customer_phone || '—';
    document.getElementById('modal-cust-addr').innerText = o.customer_address || o.address || 'No address';

    document.getElementById('modal-seller-info').innerText = o.store_name || o.shop_name || o.store_phone || '—';
    document.getElementById('modal-order-source').innerText = o.order_source || 'call';

    const st = getOrderStatus(o);
    const stEl = document.getElementById('modal-order-status');
    stEl.innerText = st.toUpperCase();
    stEl.className = `px-3 py-1 rounded-full text-xs font-bold uppercase text-white ${st === 'Delivered' ? 'bg-emerald-500' : st === 'Cancelled' ? 'bg-red-500' : 'bg-amber-500'}`;

    // Items
    const itemsTbody = document.getElementById('modal-items-tbody');
    itemsTbody.innerHTML = '';
    let prods = [];
    try { prods = typeof o.products === 'string' ? JSON.parse(o.products) : (o.products || []); } catch (e) {}
    if (!Array.isArray(prods)) prods = [];

    let itemsCount = 0;
    if (!prods.length) {
        itemsTbody.innerHTML = '<tr><td colspan="3" class="px-4 py-4 text-center text-gray-400 text-sm italic">No items</td></tr>';
    } else {
        prods.forEach(item => {
            const qty = item.quantity || 1;
            const name = item.name || item.product || 'Unknown';
            const price = item.price || 0;
            itemsCount += Number(qty) || 0;
            const r = document.createElement('tr');
            r.innerHTML = `<td class="px-4 py-3 font-medium text-gray-800 text-sm">${name}</td><td class="px-4 py-3 text-center"><span class="px-2 py-0.5 bg-gray-100 rounded text-gray-700 font-mono text-sm">${qty}</span></td><td class="px-4 py-3 text-right text-gray-600 text-sm">₹${price || '—'}</td>`;
            itemsTbody.appendChild(r);
        });
    }

    document.getElementById('modal-items-count').innerText = prods.length > 0 ? itemsCount : (o.item_count || 0);
    document.getElementById('modal-total-amount').innerText = '₹' + (o.total_amount || 0);

    const notes = o.notes || '';
    const nc = document.getElementById('modal-notes-container');
    if (notes.trim()) { nc.classList.remove('hidden'); document.getElementById('modal-notes-text').innerText = notes; }
    else nc.classList.add('hidden');

    // Show modal
    document.getElementById('order-modal-backdrop').classList.add('active');
    document.getElementById('order-modal').classList.add('active');
}

function closeOrderModal() {
    document.getElementById('order-modal-backdrop').classList.remove('active');
    document.getElementById('order-modal').classList.remove('active');
}

// ---------------------------------------------------------
// 16. TRANSCRIPTS TABLE
// ---------------------------------------------------------
function renderFullTranscripts(recordings) {
    const tbody = document.getElementById('full-transcripts-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!recordings.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-8">No recordings found.</td></tr>';
        document.getElementById('pagination-transcripts')?.classList.add('hidden');
        return;
    }

    // Sort recordings by date_recorded descending so the latest transcripts appear at the top
    const sortedRecordings = [...recordings].sort((a, b) => {
        const tA = parseTs(a.date_recorded || a.created_at) || 0;
        const tB = parseTs(b.date_recorded || b.created_at) || 0;
        return tB - tA;
    });

    const page = state.pages.transcripts;
    const items = paginate(sortedRecordings, page);
    renderPagination('pagination-transcripts', sortedRecordings.length, page, 'transcripts', () => renderFullTranscripts(recordings));

    items.forEach((r, index) => {
        const srNo = (page - 1) * PER_PAGE + index + 1;
        const ts = parseTs(r.date_recorded || r.created_at);
        const identifier = r.source_phone || r.store_phone || r.contact_name || 'Unknown';
        const storeName = r.store_phone || '';
        const hasTranscript = r.transcript && r.transcript.length > 4;

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50/50 transition-colors';
        tr.innerHTML = `
            <td class="px-6 py-3.5 whitespace-nowrap text-xs text-gray-500">${srNo}</td>
            <td class="px-6 py-3.5 whitespace-nowrap text-xs text-gray-500">${fmtDate(ts)}</td>
            <td class="px-6 py-3.5"><div class="font-medium text-sm text-gray-900">${identifier}</div>${storeName ? `<div class="text-xs text-gray-400">${storeName}</div>` : ''}</td>
            <td class="px-6 py-3.5 text-sm text-gray-600 font-mono">${fmtDuration(r.duration_ms)}</td>
            <td class="px-6 py-3.5 text-sm ${hasTranscript ? 'text-gray-700 italic border-l-2 border-indigo-200 pl-3' : 'text-gray-400'}">
                ${hasTranscript ? `"${r.transcript.substring(0, 200)}${r.transcript.length > 200 ? '…' : ''}"` : '<span class="text-gray-400">[No transcript]</span>'}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ---------------------------------------------------------
// 17. USERS TABLE (FIXED: curItems bug)
// ---------------------------------------------------------
function renderFullUsers(users, orders) {
    const tbody = document.getElementById('full-users-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    let filteredUsers = users.filter(u => u.shop_name && u.shop_name.trim() !== '');

    if (!filteredUsers.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400 py-8">No users found.</td></tr>';
        document.getElementById('pagination-users')?.classList.add('hidden');
        return;
    }

    // Order count map
    const orderCountMap = {};
    (orders || []).forEach(o => {
        const phone = o.store_phone || '';
        if (phone) orderCountMap[phone] = (orderCountMap[phone] || 0) + 1;
    });

    // Stats
    const totalUsers = users.length;
    const onboarded = filteredUsers.length;
    const now24 = Date.now() - 86400000;
    const active24 = users.filter(u => { const t = parseTs(u.last_login_at); return t && t >= now24; }).length;

    const elTotal = document.getElementById('user-stat-total');
    const elOnb = document.getElementById('user-stat-onboarded');
    const elAct = document.getElementById('user-stat-active24');
    if (elTotal) elTotal.innerText = totalUsers;
    if (elOnb) elOnb.innerText = onboarded;
    if (elAct) elAct.innerText = active24;

    // Pagination — THIS IS THE FIX for the curItems bug
    const page = state.pages.users;
    const curItems = paginate(filteredUsers, page);
    renderPagination('pagination-users', filteredUsers.length, page, 'users', () => renderFullUsers(users, orders));

    curItems.forEach((u, index) => {
        const srNo = (page - 1) * PER_PAGE + index + 1;
        const lt = parseTs(u.last_login_at);
        const isActive = lt && (Date.now() - lt) < 86400000;
        const statusBadge = isActive
            ? '<span class="px-2 py-1 text-xs font-bold rounded-full bg-green-100 text-green-700">Active</span>'
            : (u.shop_name ? '<span class="px-2 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-600">Inactive</span>'
                : '<span class="px-2 py-1 text-xs font-bold rounded-full bg-yellow-100 text-yellow-700">Setup Pending</span>');

        const userOrders = orderCountMap[u.phone] || 0;

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50/50 transition-colors';
        tr.innerHTML = `
            <td class="px-6 py-3.5 whitespace-nowrap text-xs text-gray-500">${srNo}</td>
            <td class="px-6 py-3.5 font-medium text-gray-900 font-mono text-sm">${u.phone || '—'}</td>
            <td class="px-6 py-3.5 text-gray-700 text-sm">${u.shop_name || '<span class="text-gray-400 italic">—</span>'}</td>
            <td class="px-6 py-3.5 text-gray-700 text-sm">${u.shopkeeper_name || '<span class="text-gray-400 italic">—</span>'}</td>
            <td class="px-6 py-3.5"><div class="text-sm text-gray-900">${fmtDate(lt)}</div><div class="text-xs text-gray-400">${timeAgo(lt)}</div></td>
            <td class="px-6 py-3.5"><span class="px-2.5 py-1 text-xs font-bold bg-brand-50 text-brand-700 rounded-full">${u.login_count || 0}</span></td>
            <td class="px-6 py-3.5"><span class="px-2.5 py-1 text-xs font-bold ${userOrders > 0 ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-500'} rounded-full">${userOrders}</span></td>
            <td class="px-6 py-3.5">${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ---------------------------------------------------------
// 18. ACTIVITY LOGS TABLE
// ---------------------------------------------------------
function getActionLabel(a) {
    return a.action || a.action_type || 'UNKNOWN';
}

function actionBadgeColor(act) {
    const u = act.toUpperCase();
    if (u.includes('CREATE') || u.includes('SIGNUP')) return 'bg-blue-100 text-blue-700';
    if (u.includes('UPDATE') || u.includes('SYNC')) return 'bg-amber-100 text-amber-700';
    if (u.includes('DELIVER') || u.includes('COMPLETE') || u.includes('LOGIN')) return 'bg-emerald-100 text-emerald-700';
    if (u.includes('DELETE') || u.includes('CANCEL') || u.includes('ERROR')) return 'bg-red-100 text-red-700';
    if (u.includes('OTP')) return 'bg-purple-100 text-purple-700';
    if (u.includes('TRANSCRIBE')) return 'bg-indigo-100 text-indigo-700';
    if (u.includes('CLASSIFY') || u.includes('EXTRACT')) return 'bg-cyan-100 text-cyan-700';
    if (u.includes('RECORDING')) return 'bg-teal-100 text-teal-700';
    return 'bg-gray-100 text-gray-600';
}

function renderFullActivity(activity) {
    const tbody = document.getElementById('full-activity-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Filter
    const typeFilter = document.getElementById('activity-type-filter')?.value || 'all';
    let filtered = activity;
    if (typeFilter !== 'all') {
        filtered = activity.filter(a => {
            const act = getActionLabel(a).toLowerCase();
            return act.includes(typeFilter);
        });
    }

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-8">No activity logs found.</td></tr>';
        document.getElementById('pagination-activity')?.classList.add('hidden');
        return;
    }

    const page = state.pages.activity;
    const items = paginate(filtered, page);
    renderPagination('pagination-activity', filtered.length, page, 'activity', () => renderFullActivity(activity));

    items.forEach((a, index) => {
        const srNo = (page - 1) * PER_PAGE + index + 1;
        const ts = parseTs(a.created_at);
        const act = getActionLabel(a);
        const meta = a.metadata ? (typeof a.metadata === 'string' ? a.metadata : JSON.stringify(a.metadata).substring(0, 120)) : '';
        const entityInfo = a.entity_type ? `${a.entity_type}${a.entity_id ? ': ' + a.entity_id.substring(0, 20) : ''}` : '—';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50/50 transition-colors cursor-pointer';
        tr.onclick = () => showActivityDetail(a);
        tr.innerHTML = `
            <td class="px-6 py-3.5 whitespace-nowrap text-xs text-gray-500">${srNo}</td>
            <td class="px-6 py-3.5 whitespace-nowrap text-xs text-gray-500">${fmtDate(ts)}</td>
            <td class="px-6 py-3.5"><span class="badge ${actionBadgeColor(act)}">${act}</span></td>
            <td class="px-6 py-3.5 text-sm text-gray-700 font-mono">${a.user_phone || a.store_phone || 'System'}</td>
            <td class="px-6 py-3.5 text-sm text-gray-500">${entityInfo}</td>
            <td class="px-6 py-3.5 text-sm text-gray-600 truncate max-w-[200px]">${a.notes || meta || '—'}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ---------------------------------------------------------
// 19. ACTIVITY DETAIL SLIDE PANEL
// ---------------------------------------------------------
function showActivityDetail(a) {
    const content = document.getElementById('activity-detail-content');
    const act = getActionLabel(a);
    const ts = parseTs(a.created_at);
    let metaObj = {};
    try { metaObj = typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata || {}); } catch (e) {}

    content.innerHTML = `
        <div>
            <span class="badge ${actionBadgeColor(act)} text-sm px-3 py-1.5">${act}</span>
        </div>
        <div class="space-y-3">
            <div><label class="text-xs font-semibold text-gray-400 uppercase">Timestamp</label><p class="text-sm text-gray-900 mt-0.5">${fmtDate(ts)}</p><p class="text-xs text-gray-400">${timeAgo(ts)}</p></div>
            <div><label class="text-xs font-semibold text-gray-400 uppercase">User / Phone</label><p class="text-sm text-gray-900 font-mono mt-0.5">${a.user_phone || a.store_phone || 'System'}</p></div>
            ${a.entity_type ? `<div><label class="text-xs font-semibold text-gray-400 uppercase">Entity</label><p class="text-sm text-gray-900 mt-0.5">${a.entity_type}${a.entity_id ? ' → ' + a.entity_id : ''}</p></div>` : ''}
            ${a.notes ? `<div><label class="text-xs font-semibold text-gray-400 uppercase">Notes</label><p class="text-sm text-gray-700 mt-0.5">${a.notes}</p></div>` : ''}
            ${a.ip_address ? `<div><label class="text-xs font-semibold text-gray-400 uppercase">IP Address</label><p class="text-sm text-gray-700 font-mono mt-0.5">${a.ip_address}</p></div>` : ''}
            ${a.user_agent ? `<div><label class="text-xs font-semibold text-gray-400 uppercase">User Agent</label><p class="text-xs text-gray-500 mt-0.5 break-all">${a.user_agent}</p></div>` : ''}
        </div>
        ${Object.keys(metaObj).length > 0 ? `
        <div>
            <label class="text-xs font-semibold text-gray-400 uppercase mb-2 block">Metadata</label>
            <div class="bg-gray-50 rounded-xl p-4 space-y-2">
                ${Object.entries(metaObj).map(([k, v]) => `
                    <div class="flex justify-between items-start gap-4">
                        <span class="text-xs font-semibold text-gray-500 shrink-0">${k}</span>
                        <span class="text-xs text-gray-800 text-right break-all">${typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}
        <div class="text-xs text-gray-300 pt-4 border-t border-gray-100">Activity ID: ${a.id || '—'}</div>
    `;

    document.getElementById('activity-backdrop').classList.add('active');
    document.getElementById('activity-panel').classList.add('active');
}

function closeActivityDetail() {
    document.getElementById('activity-backdrop').classList.remove('active');
    document.getElementById('activity-panel').classList.remove('active');
}

// ---------------------------------------------------------
// 20. FIRST OTP TABLE
// ---------------------------------------------------------
function renderFirstOtp(activity, users) {
    const tbody = document.getElementById('full-first-otp-table-body');
    if (!tbody) return;

    const usersMap = {};
    users.forEach(u => { usersMap[u.phone] = u.shop_name; });

    let firstOtpLogs = activity.filter(a => (a.action === 'auth.first_otp' || a.action_type === 'auth.first_otp'));

    // Filters
    const searchInput = document.getElementById('first-otp-search');
    const statusFilter = document.getElementById('first-otp-status');
    const q = (searchInput?.value || '').toLowerCase();
    const sf = (statusFilter?.value || 'all').toLowerCase();

    let filtered = firstOtpLogs.filter(a => {
        const phone = a.user_phone || a.store_phone || '';
        const shop = usersMap[phone] || '';
        const status = shop ? 'success' : 'failed';
        const matchQ = !q || phone.toLowerCase().includes(q) || shop.toLowerCase().includes(q);
        const matchS = sf === 'all' || status === sf;
        return matchQ && matchS;
    });

    tbody.innerHTML = '';
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400 py-8">No onboarding requests found.</td></tr>';
        document.getElementById('pagination-first-otp')?.classList.add('hidden');
        return;
    }

    const page = state.pages.firstOtp;
    const items = paginate(filtered, page);
    renderPagination('pagination-first-otp', filtered.length, page, 'firstOtp', () => renderFirstOtp(activity, users));

    items.forEach((a, index) => {
        const srNo = (page - 1) * PER_PAGE + index + 1;
        let metaObj = {};
        try { metaObj = typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata || {}); } catch (e) {}
        const ts = parseTs(a.created_at);
        const phone = a.user_phone || a.store_phone || 'Unknown';
        const shopName = usersMap[phone] || '';
        const status = shopName ? 'Success' : 'Failed';
        const stColor = status === 'Success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50/50 transition-colors';
        tr.innerHTML = `
            <td class="px-6 py-3.5 whitespace-nowrap text-xs text-gray-500">${srNo}</td>
            <td class="px-6 py-3.5 whitespace-nowrap text-xs text-gray-500">${fmtDate(ts)}</td>
            <td class="px-6 py-3.5 font-medium text-gray-900 font-mono text-sm">${phone}</td>
            <td class="px-6 py-3.5 text-sm text-gray-700">${shopName || '<span class="text-gray-400 italic">None</span>'}</td>
            <td class="px-6 py-3.5 text-xs text-gray-500 font-mono break-all">${metaObj.device_id || '—'}</td>
            <td class="px-6 py-3.5 text-xs text-gray-600">${metaObj.device_model || '—'} · ${metaObj.device_os || '—'}</td>
            <td class="px-6 py-3.5"><span class="px-2.5 py-1 text-xs font-semibold rounded-full ${stColor}">${status}</span></td>
        `;
        tbody.appendChild(tr);
    });

    // Live filter listeners (only attach once)
    if (searchInput && !searchInput.dataset.bound) {
        searchInput.addEventListener('input', () => { state.pages.firstOtp = 1; renderFirstOtp(globalData.activity, globalData.users); });
        searchInput.dataset.bound = 'true';
    }
    if (statusFilter && !statusFilter.dataset.bound) {
        statusFilter.addEventListener('change', () => { state.pages.firstOtp = 1; renderFirstOtp(globalData.activity, globalData.users); });
        statusFilter.dataset.bound = 'true';
    }
}

// ---------------------------------------------------------
// 21. CSV EXPORT
// ---------------------------------------------------------
async function exportExcel(type) {
    if (typeof XLSX === 'undefined') {
        try {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        } catch (e) {
            console.error('Failed to load SheetJS', e);
            alert('Failed to load export library. Please try again.');
            return;
        }
    }

    let data = [];
    let headers = [];
    let filename = type;

    const toDate = (val) => {
        if (!val) return '';
        const d = new Date(val);
        return isNaN(d) ? val : d;
    };

    if (type === 'orders') {
        data = globalData.orders.map(o => ({...o, created_at: toDate(o.created_at)}));
        headers = ['order_id', 'created_at', 'customer_name', 'customer_phone', 'store_name', 'store_phone', 'total_amount', 'delivery_status', 'payment_status', 'is_cancelled'];
    } else if (type === 'recordings') {
        data = globalData.recordings.map(r => ({...r, created_at: toDate(r.created_at)}));
        headers = ['id', 'created_at', 'store_phone', 'source_phone', 'contact_name', 'duration_ms', 'transcript', 'classification'];
    } else if (type === 'activity') {
        data = globalData.activity.map(a => ({...a, created_at: toDate(a.created_at)}));
        headers = ['id', 'created_at', 'action', 'action_type', 'user_phone', 'store_phone', 'entity_type', 'entity_id', 'notes'];
    } else if (type === 'users') {
        data = globalData.users.map(u => ({...u, last_login_at: toDate(u.last_login_at), created_at: toDate(u.created_at)}));
        headers = ['phone', 'shop_name', 'shopkeeper_name', 'last_login_at', 'login_count', 'created_at'];
    } else if (type === 'first_otp') {
        data = globalData.activity.filter(a => a.action === 'auth.first_otp' || a.action_type === 'auth.first_otp').map(a => ({...a, created_at: toDate(a.created_at)}));
        headers = ['created_at', 'user_phone', 'store_phone', 'metadata'];
        filename = 'first_otp';
    } else if (type === 'crm') {
        const source = globalData._currentCRMExport || [];
        data = source.map(l => ({
            timestamp: toDate(l.created_at),
            phone: l.phone,
            shop_name: l.shopName,
            city: l.city,
            otp_status: l.otpStatus,
            crm_status: l.crmStatus,
            calling_remarks: l.remarks,
            follow_up_remarks: l.followUp,
            updated_at: toDate(l.updatedAt)
        }));
        headers = ['timestamp', 'phone', 'shop_name', 'city', 'otp_status', 'crm_status', 'calling_remarks', 'follow_up_remarks', 'updated_at'];
        filename = 'crm_leads';
    } else if (type === 'active_sellers') {
        const source = globalData._currentActiveSellersExport || [];
        data = source.map(s => ({
            phone: s.phone,
            shop_name: s.shopName,
            city: s.city,
            total_orders: s.orders,
            gmv: s.gmv,
            first_order: toDate(s.first),
            last_order: toDate(s.last),
            calling_remarks: s.remarks,
            follow_up_remarks: s.followUp,
            updated_at: toDate(s.updatedAt)
        }));
        headers = ['phone', 'shop_name', 'city', 'total_orders', 'gmv', 'first_order', 'last_order', 'calling_remarks', 'follow_up_remarks', 'updated_at'];
        filename = 'active_sellers';
    }

    if (!data.length) { alert('No data to export.'); return; }

    // Map data so keys match headers perfectly
    const exportData = data.map(row => {
        let obj = {};
        headers.forEach(h => { obj[h] = row[h]; });
        return obj;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData, { header: headers, cellDates: true });
    
    // Auto-size columns slightly
    const colWidths = headers.map(h => ({ wch: Math.max(12, h.length + 2) }));
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    
    const finalFilename = `kiko_${filename}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, finalFilename);
}

// ---------------------------------------------------------
// 22. MOBILE SIDEBAR HELPERS (global)
// ---------------------------------------------------------
window.switchTab = switchTab;
window.setDateFilter = setDateFilter;
window.exportExcel = exportExcel;
window.openSidebar = openSidebar;
window.closeSidebar = closeSidebar;
window.closeOrderModal = closeOrderModal;
window.closeActivityDetail = closeActivityDetail;

// ---------------------------------------------------------
// 22b. ASYNC FIELD SAVE (generic)
// ---------------------------------------------------------
async function saveUserField(phone, fieldObj, localUpdate) {
    if (!phone) return;
    try {
        const resp = await fetch(`${API_BASE}/users?phone=eq.${encodeURIComponent(phone)}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${API_KEY}`, 'apikey': API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...fieldObj, crm_updated_at: Date.now() })
        });
        if (!resp.ok) throw new Error('Save failed');
        const user = globalData.users.find(u => u.phone === phone);
        if (user) Object.assign(user, fieldObj, { crm_updated_at: Date.now() });
        if (localUpdate) localUpdate();
    } catch (err) {
        console.error('Field save error:', err);
    }
}

// ---------------------------------------------------------
// 23. CRM MODULE
// ---------------------------------------------------------
async function updateLeadStatus(phone, newStatus) {
    if (!phone) return;
    try {
        const resp = await fetch(`${API_BASE}/users?phone=eq.${encodeURIComponent(phone)}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'apikey': API_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ crm_status: newStatus })
        });
        if (!resp.ok) throw new Error('Failed to update status');
        const user = globalData.users.find(u => u.phone === phone);
        if (user) user.crm_status = newStatus;
    } catch (err) {
        console.error('Status update failed:', err);
        alert('Failed to update status.');
    }
}

async function updateCallingRemarks(phone, remarks, btnEl) {
    if (!phone) return;
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Saving...'; }
    try {
        const resp = await fetch(`${API_BASE}/users?phone=eq.${encodeURIComponent(phone)}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'apikey': API_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ calling_remarks: remarks })
        });
        if (!resp.ok) throw new Error('Failed to update remarks');
        const user = globalData.users.find(u => u.phone === phone);
        if (user) user.calling_remarks = remarks;
        if (btnEl) { btnEl.textContent = '✓ Saved'; btnEl.classList.add('bg-emerald-500','text-white','border-emerald-500'); setTimeout(() => { btnEl.textContent = 'Save'; btnEl.disabled = false; btnEl.classList.remove('bg-emerald-500','text-white','border-emerald-500'); }, 1500); }
    } catch (err) {
        console.error('Remarks update failed:', err);
        if (btnEl) { btnEl.textContent = '✗ Failed'; btnEl.classList.add('bg-red-500','text-white','border-red-500'); setTimeout(() => { btnEl.textContent = 'Save'; btnEl.disabled = false; btnEl.classList.remove('bg-red-500','text-white','border-red-500'); }, 2000); }
        else { alert('Failed to update remarks.'); }
    }
}

async function updateCity(phone, city) {
    if (!phone) return;
    try {
        const resp = await fetch(`${API_BASE}/users?phone=eq.${encodeURIComponent(phone)}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'apikey': API_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ city: city })
        });
        if (!resp.ok) throw new Error('Failed to update city');
        const user = globalData.users.find(u => u.phone === phone);
        if (user) user.city = city;
    } catch (err) {
        console.error('City update failed:', err);
        alert('Failed to update city.');
    }
}

async function updateFollowUpRemarks(phone, remarks, btnEl) {
    if (!phone) return;
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Saving...'; }
    try {
        const resp = await fetch(`${API_BASE}/users?phone=eq.${encodeURIComponent(phone)}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'apikey': API_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ follow_up_remarks: remarks })
        });
        if (!resp.ok) throw new Error('Failed to update follow-up');
        const user = globalData.users.find(u => u.phone === phone);
        if (user) user.follow_up_remarks = remarks;
        if (btnEl) { btnEl.textContent = '✓ Saved'; btnEl.classList.add('bg-emerald-500','text-white','border-emerald-500'); setTimeout(() => { btnEl.textContent = 'Save'; btnEl.disabled = false; btnEl.classList.remove('bg-emerald-500','text-white','border-emerald-500'); }, 1500); }
    } catch (err) {
        console.error('Follow-up update failed:', err);
        if (btnEl) { btnEl.textContent = '✗ Failed'; btnEl.classList.add('bg-red-500','text-white','border-red-500'); setTimeout(() => { btnEl.textContent = 'Save'; btnEl.disabled = false; btnEl.classList.remove('bg-red-500','text-white','border-red-500'); }, 2000); }
        else { alert('Failed to update follow-up.'); }
    }
}

const INDIAN_CITIES = [
    '', 'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Ahmedabad', 'Chennai', 'Kolkata', 'Pune', 'Jaipur',
    'Surat', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane', 'Bhopal', 'Visakhapatnam', 'Patna',
    'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik', 'Faridabad', 'Meerut', 'Rajkot', 'Varanasi',
    'Srinagar', 'Aurangabad', 'Dhanbad', 'Amritsar', 'Navi Mumbai', 'Allahabad', 'Ranchi', 'Howrah',
    'Coimbatore', 'Jabalpur', 'Gwalior', 'Vijayawada', 'Jodhpur', 'Madurai', 'Raipur', 'Kota',
    'Chandigarh', 'Guwahati', 'Solapur', 'Hubli', 'Mysore', 'Tiruchirappalli', 'Bareilly', 'Aligarh',
    'Tiruppur', 'Moradabad', 'Jalandhar', 'Bhubaneswar', 'Salem', 'Warangal', 'Guntur', 'Bhiwandi',
    'Saharanpur', 'Gorakhpur', 'Bikaner', 'Amravati', 'Noida', 'Jamshedpur', 'Bhilai', 'Cuttack',
    'Firozabad', 'Kochi', 'Nellore', 'Bhavnagar', 'Dehradun', 'Durgapur', 'Asansol', 'Rourkela',
    'Nanded', 'Kolhapur', 'Ajmer', 'Akola', 'Gulbarga', 'Jamnagar', 'Ujjain', 'Loni', 'Siliguri',
    'Jhansi', 'Ulhasnagar', 'Jammu', 'Sangli', 'Mangalore', 'Erode', 'Belgaum', 'Ambattur', 'Tirunelveli',
    'Malegaon', 'Gaya', 'Udaipur', 'Kakinada', 'Davanagere', 'Kozhikode', 'Maheshtala', 'Rajpur Sonarpur',
    'Bokaro', 'South Dumdum', 'Bellary', 'Patiala', 'Gopalpur', 'Agartala', 'Bhagalpur', 'Muzaffarnagar',
    'Bhatpara', 'Panihati', 'Latur', 'Dhule', 'Tirupati', 'Rohtak', 'Korba', 'Bhilwara', 'Berhampur',
    'Muzaffarpur', 'Ahmednagar', 'Mathura', 'Kollam', 'Avadi', 'Kadapa', 'Anantapur', 'Kamarhati',
    'Bilaspur', 'Shahjahanpur', 'Satara', 'Bijapur', 'Rampur', 'Shimoga', 'Chandrapur', 'Junagadh',
    'Thrissur', 'Alwar', 'Bardhaman', 'Kulti', 'Nizamabad', 'Parbhani', 'Tumkur', 'Khammam',
    'Ozhukarai', 'Bihar Sharif', 'Panipat', 'Darbhanga', 'Bally', 'Aizawl', 'Dewas', 'Ichalkaranji',
    'Karnal', 'Bathinda', 'Jalna', 'Eluru', 'Kirari Suleman Nagar', 'Barasat'
].sort();

function getStatusBadge(status) {
    const s = (status || 'in progress').toLowerCase();
    if (s === 'active') return '🟢 Active';
    if (s === 'test order done') return '✅ Test Order Done';
    if (s === 'invalid') return '🔴 Invalid';
    if (s === 'not interested') return '🟠 Not Interested';
    if (s === 'dropped') return '⚫ Dropped';
    if (s === 'dnp') return '🔵 DNP';
    return '⚪ In Progress';
}

function getStatusOptions(currentStatus) {
    const opts = ['In Progress', 'Active', 'Test Order Done', 'Invalid', 'Not Interested', 'Dropped', 'DNP'];
    const cur = (currentStatus || 'In Progress').toLowerCase();
    return opts.map(o => `<option value="${o}" ${o.toLowerCase() === cur ? 'selected' : ''}>${getStatusBadge(o)}</option>`).join('');
}

function renderCRM(activity, users) {
    const tbody = document.getElementById('full-crm-table-body');
    if (!tbody) return;

    // Get single source of truth for active sellers
    const activeSellersMap = globalData._activeSellersMap || getActiveSellersMap(globalData.orders);

    let firstOtpLogs = activity.filter(a => (a.action === 'auth.first_otp' || a.action_type === 'auth.first_otp'));

    const searchInput = document.getElementById('crm-search');
    const statusFilter = document.getElementById('crm-status-filter');
    const q = (searchInput?.value || '').toLowerCase();
    const sf = (statusFilter?.value || 'all').toLowerCase();

    // Map logs to user data, injecting Active status from activeSellersMap
    let leads = firstOtpLogs.map(a => {
        const phone = a.user_phone || a.store_phone || '';
        const user = users.find(u => u.phone === phone) || {};
        let metaObj = {};
        try { metaObj = typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata || {}); } catch (e) {}
        const isActiveSeller = activeSellersMap.has(phone);
        const sellerStats = isActiveSeller ? activeSellersMap.get(phone) : null;
        return {
            ...a,
            phone,
            shopName: user.shop_name || '',
            city: user.city || '',
            crmStatus: isActiveSeller ? 'Active' : (user.crm_status || 'In Progress'),
            isActiveSeller,
            sellerOrders: sellerStats ? sellerStats.orders : 0,
            sellerGMV: sellerStats ? sellerStats.gmv : 0,
            remarks: user.calling_remarks || '',
            followUp: user.follow_up_remarks || '',
            updatedAt: user.crm_updated_at || null,
            otpStatus: user.shop_name ? 'Success' : 'Failed'
        };
    });

    // Date Filter (from activity timestamp) — CRM always shows all-time leads
    // but we note which are active in current period
    // Don't date-filter the lead list itself (show all CRM leads always)

    // Search and Status Filters
    let filtered = leads.filter(l => {
        const matchQ = !q || l.phone.toLowerCase().includes(q) || l.shopName.toLowerCase().includes(q) || (l.city || '').toLowerCase().includes(q);
        let effectiveStatus = l.crmStatus.toLowerCase();
        const matchS = sf === 'all' || effectiveStatus === sf;
        return matchQ && matchS;
    });

    // Sorting
    const sort = state.sort.crm;
    filtered.sort((a, b) => {
        let va, vb;
        if (sort.col === 'ts') { va = parseTs(a.created_at) || 0; vb = parseTs(b.created_at) || 0; }
        else if (sort.col === 'phone') { va = a.phone; vb = b.phone; }
        else if (sort.col === 'shop') { va = a.shopName; vb = b.shopName; }
        else if (sort.col === 'city') { va = a.city; vb = b.city; }
        else if (sort.col === 'orders') { va = a.sellerOrders; vb = b.sellerOrders; }
        else if (sort.col === 'gmv') { va = a.sellerGMV; vb = b.sellerGMV; }
        else if (sort.col === 'status') { va = a.crmStatus; vb = b.crmStatus; }
        else { va = parseTs(a.created_at) || 0; vb = parseTs(b.created_at) || 0; }
        if (typeof va === 'string') return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        return sort.dir === 'asc' ? va - vb : vb - va;
    });

    globalData._currentCRMExport = filtered;

    // Update thead with sort headers
    const thead = tbody.closest('table')?.querySelector('thead tr');
    if (thead) {
        thead.innerHTML = [
            '<th class="w-10">Sr.</th>',
            makeSortHeader('Timestamp', 'ts', 'crm', () => renderCRM(activity, users), 'w-28'),
            makeSortHeader('Phone', 'phone', 'crm', () => renderCRM(activity, users), 'w-36'),
            makeSortHeader('Shop Name', 'shop', 'crm', () => renderCRM(activity, users), 'w-40'),
            makeSortHeader('City', 'city', 'crm', () => renderCRM(activity, users), 'min-w-[150px]'),
            '<th class="w-20">OTP</th>',
            makeSortHeader('Status', 'status', 'crm', () => renderCRM(activity, users), 'w-36'),
            '<th class="min-w-[280px]">Calling Remarks</th>',
        ].join('');
    }

    tbody.innerHTML = '';
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400 py-8">No leads found.</td></tr>';
        document.getElementById('pagination-crm')?.classList.add('hidden');
        bindSortHeaders('crm', () => renderCRM(activity, users));
        return;
    }

    const page = state.pages.crm;
    const items = paginate(filtered, page);
    renderPagination('pagination-crm', filtered.length, page, 'crm', () => renderCRM(activity, users));

    items.forEach((l, index) => {
        const srNo = (page - 1) * _perPage + index + 1;
        const ts = parseTs(l.created_at);
        const stColor = l.otpStatus === 'Success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50/50 transition-colors border-b border-gray-100';

        let waLink = '';
        if (l.phone) {
            let purePhone = l.phone.replace(/\D/g, '');
            if (purePhone.length === 10) purePhone = '91' + purePhone;
            waLink = `<a href="https://wa.me/${purePhone}" target="_blank" class="inline-flex items-center justify-center ml-2 text-green-600 hover:text-green-700 hover:scale-110 transition-transform" title="Chat on WhatsApp"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg></a>`;
        }

        // City dropdown
        const cityVal = (l.city || '').trim();
        let cityOptions = INDIAN_CITIES.map(c => {
            const selected = c.toLowerCase() === cityVal.toLowerCase() ? 'selected' : '';
            return `<option value="${c}" ${selected}>${c || '— Select City —'}</option>`;
        }).join('');
        if (cityVal && !INDIAN_CITIES.some(c => c.toLowerCase() === cityVal.toLowerCase())) {
            cityOptions = `<option value="${cityVal}" selected>${cityVal}</option>` + cityOptions;
        }

        // Status cell: Active sellers get locked badge; others get dropdown
        let statusCell;
        if (l.isActiveSeller) {
            statusCell = `<span class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>Active</span><div class="text-[10px] text-gray-400 mt-0.5">${l.sellerOrders} orders · ₹${Math.round(l.sellerGMV).toLocaleString('en-IN')}</div>`;
        } else {
            statusCell = `<select class="status-select bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-brand-500" data-phone="${l.phone}">${getStatusOptions(l.crmStatus)}</select>`;
        }

        tr.innerHTML = `
            <td class="px-4 py-3 whitespace-nowrap text-xs text-gray-500">${srNo}</td>
            <td class="px-4 py-3 whitespace-nowrap text-xs text-gray-500">${fmtDate(ts)}</td>
            <td class="px-4 py-3 font-medium text-gray-900 font-mono text-sm"><div class="flex items-center">${l.phone || 'Unknown'}${waLink}</div></td>
            <td class="px-4 py-3 text-sm text-gray-700">${l.shopName || '<span class="text-gray-400 italic">None</span>'}</td>
            <td class="px-4 py-3"><select class="city-select bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-brand-500 w-full" data-phone="${l.phone}">${cityOptions}</select></td>
            <td class="px-4 py-3"><span class="px-2 py-1 text-xs font-semibold rounded-full ${stColor}">${l.otpStatus}</span></td>
            <td class="px-4 py-3">${statusCell}</td>
            <td class="px-4 py-3"><div class="flex flex-col gap-1"><textarea class="remarks-input bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-brand-500 w-full resize-vertical" rows="3" data-phone="${l.phone}" placeholder="Add remarks...">${l.remarks || ''}</textarea><button class="remarks-save-btn px-3 py-1 text-xs font-semibold border border-gray-300 rounded-lg bg-white hover:bg-brand-50 hover:border-brand-400 transition-colors cursor-pointer" data-phone="${l.phone}">Save</button></div></td>
        `;
        tbody.appendChild(tr);
    });

    // Attach event listeners
    document.querySelectorAll('#full-crm-table-body .status-select').forEach(sel => {
        sel.addEventListener('change', e => updateLeadStatus(e.target.dataset.phone, e.target.value));
    });
    document.querySelectorAll('#full-crm-table-body .city-select').forEach(sel => {
        sel.addEventListener('change', e => updateCity(e.target.dataset.phone, e.target.value));
    });
    document.querySelectorAll('#full-crm-table-body .remarks-save-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const phone = e.target.dataset.phone;
            const ta = e.target.closest('td').querySelector('.remarks-input');
            if (ta) updateCallingRemarks(phone, ta.value, e.target);
        });
    });

    // Live filter listeners (only attach once)
    if (searchInput && !searchInput.dataset.bound) {
        searchInput.addEventListener('input', () => { state.pages.crm = 1; renderCRM(globalData.activity, globalData.users); });
        searchInput.dataset.bound = 'true';
    }
    if (statusFilter && !statusFilter.dataset.bound) {
        statusFilter.addEventListener('change', () => { state.pages.crm = 1; renderCRM(globalData.activity, globalData.users); });
        statusFilter.dataset.bound = 'true';
    }

    // Bind sort headers (after DOM rendered)
    bindSortHeaders('crm', () => renderCRM(activity, users));
}

// ---------------------------------------------------------
// 24. ACTIVE SELLERS DRILL-DOWN
// ---------------------------------------------------------
function renderActiveSellers(orders, users) {
    const tbody = document.getElementById('full-active-sellers-body');
    if (!tbody) return;

    // Use single source of truth
    const activeSellersMap = globalData._activeSellersMap || getActiveSellersMap(orders);

    let sellers = [];
    activeSellersMap.forEach((stats, phone) => {
        const user = users.find(u => u.phone === phone) || {};
        sellers.push({
            phone,
            shopName: user.shop_name || 'Unknown',
            city: user.city || '',
            remarks: user.calling_remarks || '',
            followUp: user.follow_up_remarks || '',
            updatedAt: user.crm_updated_at || null,
            orders: stats.orders,
            gmv: stats.gmv,
            first: stats.first,
            last: stats.last,
        });
    });

    // Search filter
    const searchInput = document.getElementById('active-sellers-search');
    const q = (searchInput?.value || '').toLowerCase();
    let filtered = sellers.filter(s =>
        !q || s.phone.toLowerCase().includes(q) || s.shopName.toLowerCase().includes(q) || s.city.toLowerCase().includes(q)
    );

    // Column sorting
    const sort = state.sort.activeSellers;
    filtered.sort((a, b) => {
        let va, vb;
        if (sort.col === 'phone') { va = a.phone; vb = b.phone; }
        else if (sort.col === 'shop') { va = a.shopName; vb = b.shopName; }
        else if (sort.col === 'city') { va = a.city; vb = b.city; }
        else if (sort.col === 'orders') { va = a.orders; vb = b.orders; }
        else if (sort.col === 'gmv') { va = a.gmv; vb = b.gmv; }
        else if (sort.col === 'first') { va = a.first || 0; vb = b.first || 0; }
        else if (sort.col === 'last') { va = a.last || 0; vb = b.last || 0; }
        else { va = a.orders; vb = b.orders; }
        if (typeof va === 'string') return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        return sort.dir === 'asc' ? va - vb : vb - va;
    });

    globalData._currentActiveSellersExport = filtered;

    // Update thead with sort headers
    const thead = tbody.closest('table')?.querySelector('thead tr');
    if (thead) {
        thead.innerHTML = [
            '<th>Sr. No.</th>',
            makeSortHeader('Phone', 'phone', 'activeSellers', () => renderActiveSellers(orders, users)),
            makeSortHeader('Shop Name', 'shop', 'activeSellers', () => renderActiveSellers(orders, users)),
            makeSortHeader('City', 'city', 'activeSellers', () => renderActiveSellers(orders, users), 'min-w-[150px]'),
            makeSortHeader('Total Orders', 'orders', 'activeSellers', () => renderActiveSellers(orders, users)),
            makeSortHeader('GMV (₹)', 'gmv', 'activeSellers', () => renderActiveSellers(orders, users)),
            makeSortHeader('First Order', 'first', 'activeSellers', () => renderActiveSellers(orders, users)),
            makeSortHeader('Last Order', 'last', 'activeSellers', () => renderActiveSellers(orders, users)),
            '<th class="min-w-[200px]">Calling Remarks</th>',
            '<th class="min-w-[200px]">Follow-up Remarks</th>',
            '<th>Last Updated</th>',
        ].join('');
    }

    tbody.innerHTML = '';
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center text-gray-400 py-8">No active sellers found in this date range.</td></tr>';
        document.getElementById('pagination-active-sellers')?.classList.add('hidden');
        bindSortHeaders('activeSellers', () => renderActiveSellers(orders, users));
        return;
    }

    const page = state.pages.activeSellers;
    const items = paginate(filtered, page);
    renderPagination('pagination-active-sellers', filtered.length, page, 'activeSellers', () => renderActiveSellers(orders, users));

    items.forEach((s, index) => {
        const srNo = (page - 1) * _perPage + index + 1;
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50/50 transition-colors border-b border-gray-100';

        // Editable city text input
        const cityHtml = `<input type="text" class="city-input-as w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-brand-500" value="${(s.city || '').replace(/"/g, '&quot;')}" data-phone="${s.phone}" placeholder="Enter city...">`;

        tr.innerHTML = `
            <td class="px-4 py-3 whitespace-nowrap text-xs text-gray-500">${srNo}</td>
            <td class="px-4 py-3 font-medium text-gray-900 font-mono text-sm">${s.phone}</td>
            <td class="px-4 py-3 text-sm text-gray-700">${s.shopName}</td>
            <td class="px-4 py-3">${cityHtml}</td>
            <td class="px-4 py-3 text-sm font-bold text-gray-900 text-center">${s.orders}</td>
            <td class="px-4 py-3 text-sm font-bold text-emerald-600">₹${Math.round(s.gmv).toLocaleString('en-IN')}</td>
            <td class="px-4 py-3 text-xs text-gray-500">${fmtDate(s.first)}</td>
            <td class="px-4 py-3 text-xs text-gray-500">${fmtDate(s.last)}</td>
            <td class="px-4 py-3"><div class="flex flex-col gap-1"><textarea class="as-remarks-input w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-brand-500 resize-vertical" rows="2" data-phone="${s.phone}" placeholder="Calling remarks...">${s.remarks || ''}</textarea><button class="as-remarks-save-btn px-3 py-1 text-xs font-semibold border border-gray-300 rounded-lg bg-white hover:bg-brand-50 hover:border-brand-400 transition-colors cursor-pointer" data-phone="${s.phone}">Save</button></div></td>
            <td class="px-4 py-3"><div class="flex flex-col gap-1"><textarea class="as-followup-input w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-brand-500 resize-vertical" rows="2" data-phone="${s.phone}" placeholder="Follow-up remarks...">${s.followUp || ''}</textarea><button class="as-followup-save-btn px-3 py-1 text-xs font-semibold border border-gray-300 rounded-lg bg-white hover:bg-brand-50 hover:border-brand-400 transition-colors cursor-pointer" data-phone="${s.phone}">Save</button></div></td>
            <td class="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">${s.updatedAt ? fmtDate(s.updatedAt) : '—'}</td>
        `;
        tbody.appendChild(tr);
    });

    // Autosave listeners
    tbody.querySelectorAll('.city-input-as').forEach(inp => {
        inp.addEventListener('blur', e => updateCity(e.target.dataset.phone, e.target.value));
    });
    tbody.querySelectorAll('.as-remarks-save-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const phone = e.target.dataset.phone;
            const ta = e.target.closest('td').querySelector('.as-remarks-input');
            if (ta) updateCallingRemarks(phone, ta.value, e.target);
        });
    });
    tbody.querySelectorAll('.as-followup-save-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const phone = e.target.dataset.phone;
            const ta = e.target.closest('td').querySelector('.as-followup-input');
            if (ta) updateFollowUpRemarks(phone, ta.value, e.target);
        });
    });

    // Live search listener (only attach once)
    if (searchInput && !searchInput.dataset.bound) {
        searchInput.addEventListener('input', () => { state.pages.activeSellers = 1; renderActiveSellers(globalData.orders, globalData.users); });
        searchInput.dataset.bound = 'true';
    }

    // Bind sort headers (after DOM rendered)
    bindSortHeaders('activeSellers', () => renderActiveSellers(orders, users));
}

window.closeActivityDetail = closeActivityDetail;
window.updateLeadStatus = updateLeadStatus;
window.updateCallingRemarks = updateCallingRemarks;
window.updateFollowUpRemarks = updateFollowUpRemarks;
window.updateCity = updateCity;
window.openCRMWithFilter = openCRMWithFilter;

// ============================================================
// SELLER RETENTION MODULE — Native (uses real globalData)
// ============================================================

let _retentionFunnelChart = null;
let _retentionCurrentStage = 'all'; // tracks which funnel stage is drilled into
let _retentionPage = 1;
let _retentionSortCol = 'firstOrder';
let _retentionSortAsc = false; // default newest to oldest
let _retentionFilterStatus = 'all';
let _retentionFilterPriority = 'all';

window.sortRetentionTable = function(col) {
    if (_retentionSortCol === col) {
        _retentionSortAsc = !_retentionSortAsc; // toggle
    } else {
        _retentionSortCol = col;
        _retentionSortAsc = false; // default desc for new column
    }
    _retentionPage = 1;
    renderRetentionDrilldown(calculateRetentionMetrics());
};

/**
 * calculateRetentionMetrics()
 * Derives all retention stages from real globalData:
 *   - users         → all registered sellers (OTP Success)
 *   - activity_log  → auth.first_otp events (install attempts)
 *   - orders        → determines activation, active days, churn
 *
 * Uses ALL raw data (ignores date filter) so the funnel shows lifetime numbers.
 * The drilldown table then reflects who is in each stage.
 */
function calculateRetentionMetrics() {
    // Show ALL users regardless of date filter — this is a lifetime retention view.
    const allUsers = globalData.users || [];
    const allOrders = globalData._rawOrders || [];
    const allActivity = globalData.activity || [];

    // Map: phone → user record
    const userMap = new Map();
    allUsers.forEach(u => { if (u.phone) userMap.set(u.phone, u); });

    // App Installs = unique phones that ever attempted auth.first_otp
    const installPhones = new Set();
    allActivity.forEach(a => {
        if (a.action === 'auth.first_otp' || a.action_type === 'auth.first_otp') {
            const ph = a.user_phone || a.store_phone;
            if (ph) installPhones.add(ph);
        }
    });

    // OTP Success = seller exists in users table (they registered)
    const otpSuccessPhones = new Set(allUsers.map(u => u.phone).filter(Boolean));

    // Build per-seller order data from ALL orders
    const sellerOrders = new Map(); // phone → { orders:[], firstOrderTs, lastOrderTs, activeDaysSet }
    allOrders.forEach(o => {
        if (!o.store_phone) return;
        if (!sellerOrders.has(o.store_phone)) {
            sellerOrders.set(o.store_phone, { orders: [], firstOrderTs: null, lastOrderTs: null, activeDates: new Set() });
        }
        const sd = sellerOrders.get(o.store_phone);
        const ts = parseTs(o.created_at);
        sd.orders.push(o);
        if (ts) {
            if (!sd.firstOrderTs || ts < sd.firstOrderTs) sd.firstOrderTs = ts;
            if (!sd.lastOrderTs  || ts > sd.lastOrderTs)  sd.lastOrderTs  = ts;
            sd.activeDates.add(new Date(ts).toISOString().split('T')[0]);
        }
    });

    const now = Date.now();
    const DAY_MS = 86400000;

    // Activated: placed ≥1 order ever
    const activatedPhones = new Set([...sellerOrders.keys()]);

    // Retained Day 2+: first order date ≠ last order date (ordered on multiple calendar days)
    const retainedDay2Phones = new Set();
    // Active 7+ days: active on ≥7 unique calendar days
    const active7dPhones = new Set();
    // Churned: activated but last order >7 days ago
    const churnedPhones = new Set();
    // Long-term: active on ≥30 unique calendar days
    const longTermPhones = new Set();

    sellerOrders.forEach((sd, phone) => {
        const activeDayCount = sd.activeDates.size;
        const firstD = sd.firstOrderTs ? new Date(sd.firstOrderTs).toISOString().split('T')[0] : null;
        const lastD  = sd.lastOrderTs  ? new Date(sd.lastOrderTs).toISOString().split('T')[0]  : null;
        const daysSinceLast = sd.lastOrderTs ? Math.floor((now - sd.lastOrderTs) / DAY_MS) : 999;

        if (firstD && lastD && firstD !== lastD) retainedDay2Phones.add(phone);
        if (activeDayCount >= 7)  active7dPhones.add(phone);
        if (activeDayCount >= 30) longTermPhones.add(phone);
        if (daysSinceLast > 7)    churnedPhones.add(phone);
    });

    return {
        installPhones,
        otpSuccessPhones,
        activatedPhones,
        retainedDay2Phones,
        active7dPhones,
        longTermPhones,
        churnedPhones,
        sellerOrders,
        userMap,
    };
}

/**
 * getSellerRowsForStage(stage, metrics)
 * Returns array of row objects for drilldown table.
 */
function getSellerRowsForStage(stage, metrics) {
    const { installPhones, otpSuccessPhones, activatedPhones, retainedDay2Phones,
            active7dPhones, longTermPhones, churnedPhones, sellerOrders, userMap } = metrics;

    let phones;
    switch (stage) {
        case 'installs':    phones = installPhones;      break;
        case 'otp':         phones = otpSuccessPhones;   break;
        case 'activated':   phones = activatedPhones;    break;
        case 'day2':        phones = retainedDay2Phones; break;
        case 'day7':        phones = active7dPhones;     break;
        case 'longterm':    phones = longTermPhones;     break;
        case 'churned':     phones = churnedPhones;      break;
        default:            phones = otpSuccessPhones;   break;
    }

    return [...phones].map(phone => {
        const u  = userMap.get(phone) || {};
        const sd = sellerOrders.get(phone) || { orders: [], firstOrderTs: null, lastOrderTs: null, activeDates: new Set() };
        
        const totalGMV = sd.orders.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
        const totalOrders = sd.orders.length;
        const activeDays = sd.activeDates.size;
        const daysSinceLast = sd.lastOrderTs ? Math.floor((Date.now() - sd.lastOrderTs) / 86400000) : null;
        
        const avgOrderValue = totalOrders > 0 ? (totalGMV / totalOrders) : 0;
        const avgOrdersPerDay = activeDays > 0 ? (totalOrders / activeDays) : 0;

        let status = 'Never Ordered';
        let priority = 'Low';

        if (totalOrders > 0 && daysSinceLast !== null) {
            if (daysSinceLast <= 3) {
                status = 'Active';
                priority = 'Low';
            } else if (daysSinceLast <= 7) {
                status = 'At Risk';
                priority = 'High';
            } else if (daysSinceLast <= 30) {
                status = 'Dormant';
                priority = 'Medium';
            } else {
                status = 'Churned';
                priority = 'Low';
            }
        }

        return {
            phone,
            shopName:      u.shop_name || '—',
            registered:    u.created_at ? parseTs(u.created_at) : null,
            city:          u.city || u.state || '—',
            activeDays,
            totalOrders,
            gmv:           totalGMV,
            avgOrderValue,
            avgOrdersPerDay,
            firstOrder:    sd.firstOrderTs,
            lastOrder:     sd.lastOrderTs,
            daysSinceLast,
            status,
            priority
        };
    });
}

/**
 * renderRetentionTab()
 * The main render function called whenever the Retention tab is active.
 */
function renderRetentionTab() {
    const metrics = calculateRetentionMetrics();
    renderRetentionDrilldown(metrics);
}

function renderRetentionDrilldown(metrics) {
    const tbody = document.getElementById('retention-drilldown-body');
    if (!tbody) return;

    let rows = getSellerRowsForStage(_retentionCurrentStage, metrics);

    // Filter by Dropdowns
    if (typeof _retentionFilterStatus !== 'undefined' && _retentionFilterStatus !== 'all') {
        rows = rows.filter(r => r.status === _retentionFilterStatus);
    }
    if (typeof _retentionFilterPriority !== 'undefined' && _retentionFilterPriority !== 'all') {
        rows = rows.filter(r => r.priority === _retentionFilterPriority);
    }

    // Apply search
    const searchEl = document.getElementById('retention-search');
    const q = searchEl ? searchEl.value.toLowerCase().trim() : '';
    if (q) rows = rows.filter(r => r.phone.includes(q) || r.shopName.toLowerCase().includes(q) || r.city.toLowerCase().includes(q));

    // Sort rows
    if (typeof _retentionSortCol !== 'undefined') {
        rows.sort((a, b) => {
            let valA = a[_retentionSortCol];
            let valB = b[_retentionSortCol];
            
            // Handle nulls and undefined
            if (valA === null || valA === undefined) valA = '';
            if (valB === null || valB === undefined) valB = '';
            
            // String comparison
            if (typeof valA === 'string' && typeof valB === 'string') {
                const cmp = valA.localeCompare(valB);
                return _retentionSortAsc ? cmp : -cmp;
            }
            
            // Numeric/Date comparison
            if (_retentionSortAsc) return valA > valB ? 1 : valA < valB ? -1 : 0;
            else return valA < valB ? 1 : valA > valB ? -1 : 0;
        });

        // Update UI headers
        document.querySelectorAll('span[id^="retention-sort-"]').forEach(el => {
            el.innerText = '↕';
            el.className = 'text-gray-300 text-xs font-mono ml-1';
        });
        const activeSortEl = document.getElementById(`retention-sort-${_retentionSortCol}`);
        if (activeSortEl) {
            activeSortEl.innerText = _retentionSortAsc ? '↑' : '↓';
            activeSortEl.className = 'text-brand-600 text-xs font-mono ml-1 font-bold';
        }
    }

    const total = rows.length;
    const paged = rows.slice((_retentionPage - 1) * _perPage, _retentionPage * _perPage);

    if (!paged.length) {
        tbody.innerHTML = '<tr><td colspan="14" class="text-center text-gray-400 py-8">No sellers found.</td></tr>';
        const paginationEl = document.getElementById('pagination-retention');
        if (paginationEl) paginationEl.classList.add('hidden');
        return;
    }

    tbody.innerHTML = paged.map((r, i) => {
        const sr = (_retentionPage - 1) * _perPage + i + 1;
        let statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">⚫ Never Ordered</span>';
        if (r.status === 'Active') {
            statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">🟢 Active</span>';
        } else if (r.status === 'At Risk') {
            statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">🟡 At Risk</span>';
        } else if (r.status === 'Dormant') {
            statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">🟠 Dormant</span>';
        } else if (r.status === 'Churned') {
            statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">🔴 Churned</span>';
        }

        const priorityBadge = r.priority === 'High' 
            ? '<span class="text-xs font-bold text-red-600">High</span>' 
            : r.priority === 'Medium' 
                ? '<span class="text-xs font-semibold text-orange-500">Medium</span>' 
                : '<span class="text-xs text-gray-400">Low</span>';

        const gmvStr = r.gmv > 0 ? `₹${Math.round(r.gmv).toLocaleString('en-IN')}` : '—';
        const aovStr = r.avgOrderValue > 0 ? `₹${Math.round(r.avgOrderValue).toLocaleString('en-IN')}` : '—';
        const aopdStr = r.avgOrdersPerDay > 0 ? r.avgOrdersPerDay.toFixed(1) : '—';

        return `<tr>
            <td class="font-mono text-gray-400 text-xs">${sr}</td>
            <td class="font-bold text-gray-900">${r.shopName}</td>
            <td class="text-xs text-gray-500 whitespace-nowrap">${r.registered ? fmtDate(r.registered) : '—'}</td>
            <td class="font-medium">${r.phone}</td>
            <td>${r.city}</td>
            <td class="font-semibold text-center">${r.activeDays}</td>
            <td class="font-semibold text-center">${r.totalOrders}</td>
            <td class="font-medium">${gmvStr}</td>
            <td class="text-xs">${aovStr}</td>
            <td class="text-xs text-center">${aopdStr}</td>
            <td class="text-xs text-gray-500 whitespace-nowrap">${r.firstOrder ? fmtDate(r.firstOrder) : '—'}</td>
            <td class="text-xs text-gray-500 whitespace-nowrap">${r.lastOrder ? fmtDate(r.lastOrder) : '—'}</td>
            <td class="font-mono text-center">${r.daysSinceLast !== null ? r.daysSinceLast : '—'}</td>
            <td class="whitespace-nowrap">${statusBadge}</td>
            <td>${priorityBadge}</td>
        </tr>`;
    }).join('');

    // Render pagination
    renderPagination('pagination-retention', total, _retentionPage, 'retention', () => renderRetentionTab());

    // Bind search (once)
    const searchEl2 = document.getElementById('retention-search');
    if (searchEl2 && !searchEl2.dataset.bound) {
        searchEl2.addEventListener('input', () => { _retentionPage = 1; renderRetentionTab(); });
        searchEl2.dataset.bound = 'true';
    }

    const filterStatusEl = document.getElementById('retention-filter-status');
    if (filterStatusEl && !filterStatusEl.dataset.bound) {
        filterStatusEl.addEventListener('change', (e) => {
            _retentionFilterStatus = e.target.value;
            _retentionPage = 1;
            renderRetentionTab();
        });
        filterStatusEl.dataset.bound = 'true';
    }

    const filterPriorityEl = document.getElementById('retention-filter-priority');
    if (filterPriorityEl && !filterPriorityEl.dataset.bound) {
        filterPriorityEl.addEventListener('change', (e) => {
            _retentionFilterPriority = e.target.value;
            _retentionPage = 1;
            renderRetentionTab();
        });
        filterPriorityEl.dataset.bound = 'true';
    }
}

window.exportExcel = function(type) {
    if (type !== 'retention') return;
    const metrics = calculateRetentionMetrics();
    const rows = getSellerRowsForStage(_retentionCurrentStage, metrics);
    let csv = 'Sr,Seller,Registration Date,Phone,City,Active Days,Lifetime Orders,Lifetime GMV,Avg Order Value,Avg Orders/Day,First Order,Last Order,Days Since Last Order,Status,Priority\n';
    rows.forEach((r, i) => {
        const reg = r.registered ? fmtDate(r.registered) : '';
        const first = r.firstOrder ? fmtDate(r.firstOrder) : '';
        const last  = r.lastOrder  ? fmtDate(r.lastOrder)  : '';
        csv += `${i+1},"${r.shopName}","${reg}","${r.phone}","${r.city}",${r.activeDays},${r.totalOrders},${Math.round(r.gmv)},${Math.round(r.avgOrderValue)},${r.avgOrdersPerDay.toFixed(1)},"${first}","${last}",${r.daysSinceLast !== null ? r.daysSinceLast : ''},"${r.status}","${r.priority}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `retention_${_retentionCurrentStage}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
};
