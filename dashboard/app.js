// ============================================================
// Kiko AI — Super Dashboard (app.js)
// ============================================================

// ---------------------------------------------------------
// 1. CONFIGURATION
// ---------------------------------------------------------
const SUPABASE_URL = 'https://kdxlxwyjhaijdjpbfnir.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeGx4d3lqaGFpamRqcGJmbmlyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzgzMDAwOCwiZXhwIjoyMDg5NDA2MDA4fQ.NdKZPvbr_OXoAtW2686QOpfu3qdmF7ucCzg1lG_vayk';
const DASHBOARD_PASSWORD = 'admin';
const PER_PAGE = 25;

// ---------------------------------------------------------
// 2. STATE
// ---------------------------------------------------------
let supabaseClient = null;
let ordersChartInstance = null;
let statusChartInstance = null;
let realtimeChannel = null;
let _refreshTimer = null;

const state = {
    dateFilter: '7days',   // active preset
    dateStart: null,       // Date object
    dateEnd: null,         // Date object
    pages: { orders: 1, transcripts: 1, activity: 1, users: 1, firstOtp: 1 },
    activeTab: 'tab-overview',
    loading: false,
    error: null,
};

const globalData = {
    orders: [],
    recordings: [],
    activity: [],
    users: [],
    stores: [],
};

// Init Supabase
try {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
} catch (e) {
    console.error('Supabase init failed:', e);
}

// ---------------------------------------------------------
// 3. DATE FILTER SYSTEM
// ---------------------------------------------------------
function getDateRange(preset) {
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    let start;

    switch (preset) {
        case 'today':
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            return { start, end: endOfToday };
        case 'yesterday':
            const y = new Date(now); y.setDate(y.getDate() - 1);
            start = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
            const endY = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
            return { start, end: endY };
        case '3days':
            start = new Date(now); start.setDate(start.getDate() - 2); start.setHours(0,0,0,0);
            return { start, end: endOfToday };
        case '7days':
            start = new Date(now); start.setDate(start.getDate() - 6); start.setHours(0,0,0,0);
            return { start, end: endOfToday };
        case '15days':
            start = new Date(now); start.setDate(start.getDate() - 14); start.setHours(0,0,0,0);
            return { start, end: endOfToday };
        case 'all':
            return { start: null, end: null };
        case 'custom':
            return { start: state.dateStart, end: state.dateEnd };
        default:
            start = new Date(now); start.setDate(start.getDate() - 6); start.setHours(0,0,0,0);
            return { start, end: endOfToday };
    }
}

function setDateFilter(preset) {
    state.dateFilter = preset;
    // Reset all pages
    Object.keys(state.pages).forEach(k => state.pages[k] = 1);

    // Update chip UI
    document.querySelectorAll('.date-chip[data-filter]').forEach(c => {
        c.classList.toggle('active', c.dataset.filter === preset);
    });

    // Clear custom date inputs if not custom
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
    if (sessionStorage.getItem('kiko_dashboard_auth') === 'true') {
        showDashboard();
    }

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
        fetchDashboardData().finally(() => {
            setTimeout(() => btn.classList.remove('animate-spin'), 600);
        });
    });

    document.getElementById('date-start').addEventListener('change', onCustomDateChange);
    document.getElementById('date-end').addEventListener('change', onCustomDateChange);

    // Order filters
    const orderSearch = document.getElementById('order-search');
    const orderStatus = document.getElementById('order-status-filter');
    if (orderSearch) orderSearch.addEventListener('input', () => { state.pages.orders = 1; renderFullOrders(globalData.orders); });
    if (orderStatus) orderStatus.addEventListener('change', () => { state.pages.orders = 1; renderFullOrders(globalData.orders); });

    // Activity filter
    const actFilter = document.getElementById('activity-type-filter');
    if (actFilter) actFilter.addEventListener('change', () => { state.pages.activity = 1; renderFullActivity(globalData.activity); });
});

function showDashboard() {
    document.getElementById('login-screen').classList.add('fade-out');
    setTimeout(() => {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        fetchDashboardData();
        setupRealtime();
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
    const tab = document.getElementById(tabId);
    if (tab) { tab.classList.remove('hidden'); tab.classList.add('block'); }
    const btn = document.querySelector(`.sidebar-link[data-tab="${tabId}"]`);
    if (btn) {
        btn.classList.add('active', 'bg-brand-50', 'text-brand-700');
        btn.classList.remove('text-gray-600', 'hover:bg-gray-100');
    }
    // Update page title
    const titles = {
        'tab-overview': 'Dashboard Overview', 'tab-orders': 'Orders',
        'tab-transcripts': 'Call Transcriptions', 'tab-users': 'Users & Logins',
        'tab-activity': 'Activity Logs', 'tab-first-otp': 'First OTP Requests'
    };
    document.getElementById('page-title').innerText = titles[tabId] || 'Dashboard';
    closeSidebar();
}

function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
}

// ---------------------------------------------------------
// 6. REALTIME SUBSCRIPTIONS
// ---------------------------------------------------------
function setupRealtime() {
    if (!supabaseClient) return;

    const rtEl = document.getElementById('rt-status');

    realtimeChannel = supabaseClient.channel('dashboard-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => debouncedRefresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'recordings' }, () => debouncedRefresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log' }, () => debouncedRefresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => debouncedRefresh())
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                rtEl.className = 'rt-indicator rt-connected';
                rtEl.innerHTML = '<span class="rt-dot"></span><span>Live</span>';
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                rtEl.className = 'rt-indicator rt-disconnected';
                rtEl.innerHTML = '<span class="rt-dot"></span><span>Disconnected</span>';
            }
        });
}

function debouncedRefresh() {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(() => fetchDashboardData(), 800);
}

// ---------------------------------------------------------
// 7. DATA FETCHING
// ---------------------------------------------------------
async function fetchDashboardData() {
    if (!supabaseClient) { alert('Database connection not available.'); return; }
    if (state.loading) return;
    state.loading = true;

    const now = new Date();
    document.getElementById('last-updated').innerText = `Last updated: ${now.toLocaleTimeString('en-IN')}`;

    const { start, end } = getDateRange(state.dateFilter);

    try {
        const fetchAll = async (table, dateCol = 'created_at') => {
            let res = [];
            let from = 0;
            const step = 1000;
            let hasMore = true;
            while (hasMore) {
                let query = supabaseClient.from(table).select('*').order(dateCol, { ascending: false });
                if (start) query = query.gte(dateCol, start.getTime());
                if (end) query = query.lte(dateCol, end.getTime());
                const { data, error } = await query.range(from, from + step - 1);
                if (error) { console.error(`Error ${table}:`, error); break; }
                if (data && data.length > 0) { res = res.concat(data); from += step; if (data.length < step) hasMore = false; }
                else hasMore = false;
            }
            return res;
        };

        // Fetch tables in parallel. Users and stores without date filter.
        const [allOrders, allRecordings, allActivity] = await Promise.all([
            fetchAll('orders'),
            fetchAll('recordings'),
            fetchAll('activity_log'),
        ]);

        let allUsers = [];
        let allStores = [];
        try {
            const { data } = await supabaseClient.from('users').select('*').order('last_login_at', { ascending: false });
            if (data) allUsers = data;
        } catch (e) { console.error('Users fetch:', e); }
        try {
            const { data } = await supabaseClient.from('stores').select('*').order('last_active_at', { ascending: false });
            if (data) allStores = data;
        } catch (e) { console.error('Stores fetch:', e); }

        globalData.orders = allOrders || [];
        globalData.recordings = allRecordings || [];
        globalData.activity = allActivity || [];
        globalData.users = allUsers || [];
        globalData.stores = allStores || [];

        // Render everything
        processMetrics();
        renderCharts();
        renderRecentLogins();
        renderFullOrders(globalData.orders);
        renderFullTranscripts(globalData.recordings);
        renderFullUsers(globalData.users, globalData.orders);
        renderFullActivity(globalData.activity);
        renderFirstOtp(globalData.activity, globalData.users);

    } catch (err) {
        console.error('Dashboard fetch error:', err);
        state.error = err.message;
    } finally {
        state.loading = false;
    }
}

// ---------------------------------------------------------
// 8. TIMESTAMP HELPERS
// ---------------------------------------------------------
function parseTs(val) {
    if (!val) return null;
    if (typeof val === 'number') return val;
    const n = parseInt(val);
    if (!isNaN(n) && n > 1e12) return n; // epoch ms
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.getTime();
}

function fmtDate(ts) {
    if (!ts) return '—';
    const d = new Date(typeof ts === 'number' ? ts : parseTs(ts));
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function timeAgo(ts) {
    if (!ts) return '';
    const ms = Date.now() - (typeof ts === 'number' ? ts : parseTs(ts));
    if (ms < 0) return 'just now';
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function fmtDuration(ms) {
    if (!ms || ms <= 0) return '—';
    const secs = Math.floor(ms / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------
// 9. METRICS
// ---------------------------------------------------------
function processMetrics() {
    const { orders, users, recordings, stores } = globalData;

    // Installs
    document.getElementById('stat-installs').innerText = users.length;

    // Orders
    document.getElementById('stat-orders').innerText = orders.length;

    // Sales
    const totalSales = orders.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
    document.getElementById('stat-sales').innerText = `₹${totalSales.toLocaleString('en-IN')}`;

    // Unique customers
    const custSet = new Set();
    orders.forEach(o => { if (o.customer_phone) custSet.add(o.customer_phone); });
    document.getElementById('stat-customers').innerText = custSet.size;

    // Sellers
    const onboarded = users.filter(u => u.shop_name && u.shop_name.length > 0).length;
    document.getElementById('stat-sellers').innerText = onboarded > 0 ? onboarded : users.length;

    // AOV
    const aov = orders.length > 0 ? totalSales / orders.length : 0;
    document.getElementById('stat-aov').innerText = `₹${Math.round(aov).toLocaleString('en-IN')}`;

    // Total Calls
    document.getElementById('total-calls').innerText = recordings.length;

    // Transcripts
    const successTranscripts = recordings.filter(r => r.transcript && r.transcript.length > 4).length;
    document.getElementById('total-transcripts').innerText = successTranscripts;
    const rate = recordings.length > 0 ? Math.round((successTranscripts / recordings.length) * 100) : 0;
    document.getElementById('kpi-transcript-rate').innerText = `${rate}% success rate`;

    // Transcripts last updated
    if (recordings.length > 0) {
        const latest = recordings[0];
        const lt = parseTs(latest.created_at);
        const el = document.getElementById('transcripts-last-updated');
        if (el && lt) el.innerText = `Latest record: ${fmtDate(lt)}`;
    }

    // Login count badge
    const totalLogins = users.reduce((s, u) => s + (u.login_count || 0), 0);
    const badge = document.getElementById('login-count-badge');
    if (badge) badge.innerText = `${totalLogins} total logins`;
}

// ---------------------------------------------------------
// 10. PAGINATION
// ---------------------------------------------------------
function renderPagination(containerId, total, page, type, callback) {
    const cont = document.getElementById(containerId);
    if (!cont) return;
    const maxP = Math.ceil(total / PER_PAGE) || 1;
    if (total <= PER_PAGE) { cont.classList.add('hidden'); return; }
    cont.classList.remove('hidden');
    cont.innerHTML = `
        <span class="text-sm text-gray-500">Page ${page} of ${maxP} (${total} items)</span>
        <div class="flex gap-2">
            <button class="px-3 py-1.5 border rounded-lg text-sm font-medium ${page === 1 ? 'text-gray-300 cursor-not-allowed' : 'text-brand-600 hover:bg-gray-50'}" ${page === 1 ? 'disabled' : ''} id="prev-${containerId}">← Prev</button>
            <button class="px-3 py-1.5 border rounded-lg text-sm font-medium ${page === maxP ? 'text-gray-300 cursor-not-allowed' : 'text-brand-600 hover:bg-gray-50'}" ${page === maxP ? 'disabled' : ''} id="next-${containerId}">Next →</button>
        </div>
    `;
    const prev = document.getElementById(`prev-${containerId}`);
    const next = document.getElementById(`next-${containerId}`);
    if (prev && page > 1) prev.onclick = () => { state.pages[type] = page - 1; callback(); };
    if (next && page < maxP) next.onclick = () => { state.pages[type] = page + 1; callback(); };
}

function paginate(arr, page) {
    const start = (page - 1) * PER_PAGE;
    return arr.slice(start, start + PER_PAGE);
}

// ---------------------------------------------------------
// 11. CHARTS
// ---------------------------------------------------------
function renderCharts() {
    const { orders, recordings } = globalData;

    // --- Status Pie ---
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

    // --- Orders + Calls Timeline ---
    const { start, end } = getDateRange(state.dateFilter);
    const startD = start || new Date(Date.now() - 7 * 86400000);
    const endD = end || new Date();
    const dayCount = Math.min(Math.ceil((endD - startD) / 86400000) + 1, 60);

    const ordersMap = {};
    const callsMap = {};
    for (let i = 0; i < dayCount; i++) {
        const d = new Date(startD);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().split('T')[0];
        ordersMap[key] = 0;
        callsMap[key] = 0;
    }

    orders.forEach(o => {
        const ts = parseTs(o.created_at);
        if (!ts) return;
        const key = new Date(ts).toISOString().split('T')[0];
        if (ordersMap[key] !== undefined) ordersMap[key]++;
    });

    recordings.forEach(r => {
        const ts = parseTs(r.created_at);
        if (!ts) return;
        const key = new Date(ts).toISOString().split('T')[0];
        if (callsMap[key] !== undefined) callsMap[key]++;
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
                    { label: 'Calls', data: Object.values(callsMap), borderColor: '#14b8a6', backgroundColor: 'rgba(20,184,166,0.06)', borderWidth: 2, tension: 0.4, fill: true, pointBackgroundColor: '#fff', pointBorderColor: '#14b8a6', pointBorderWidth: 2, pointRadius: 2, pointHoverRadius: 4, borderDash: [4, 3] },
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top', labels: { usePointStyle: true, font: { size: 11 } } } },
                scales: {
                    y: { beginAtZero: true, grid: { borderDash: [4, 4], color: '#f1f5f9' }, border: { display: false }, ticks: { font: { size: 11 } } },
                    x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 } } }
                }
            }
        });
    }
}

// ---------------------------------------------------------
// 12. HELPER: Order Status (fixes delivery_status vs status)
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
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-8">No users found.</td></tr>';
        return;
    }

    const recent = users.filter(u => u.last_login_at).slice(0, 10);
    recent.forEach(u => {
        const lt = parseTs(u.last_login_at);
        const online = lt && (Date.now() - lt) < 3600000;
        const dot = online
            ? '<span class="inline-flex items-center gap-1"><span class="w-2 h-2 bg-green-500 rounded-full pulse-soft"></span><span class="text-green-600 text-xs font-semibold">Online</span></span>'
            : '<span class="inline-flex items-center gap-1"><span class="w-2 h-2 bg-gray-300 rounded-full"></span><span class="text-gray-500 text-xs font-medium">Offline</span></span>';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50/50 transition-colors';
        tr.innerHTML = `
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
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-8">No orders found.</td></tr>';
        document.getElementById('pagination-orders')?.classList.add('hidden');
        return;
    }

    const page = state.pages.orders;
    const items = paginate(filtered, page);
    renderPagination('pagination-orders', filtered.length, page, 'orders', () => renderFullOrders(orders));

    items.forEach(o => {
        const st = getOrderStatus(o);
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50/50 transition-colors cursor-pointer';
        tr.onclick = () => showOrderDetail(o);
        tr.innerHTML = `
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
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-8">No recordings found.</td></tr>';
        document.getElementById('pagination-transcripts')?.classList.add('hidden');
        return;
    }

    const page = state.pages.transcripts;
    const items = paginate(recordings, page);
    renderPagination('pagination-transcripts', recordings.length, page, 'transcripts', () => renderFullTranscripts(recordings));

    items.forEach(r => {
        const ts = parseTs(r.created_at);
        const identifier = r.source_phone || r.store_phone || r.contact_name || 'Unknown';
        const storeName = r.store_phone || '';
        const hasTranscript = r.transcript && r.transcript.length > 4;

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50/50 transition-colors';
        tr.innerHTML = `
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

    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400 py-8">No users found.</td></tr>';
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
    const onboarded = users.filter(u => u.shop_name && u.shop_name.length > 0).length;
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
    const curItems = paginate(users, page);
    renderPagination('pagination-users', users.length, page, 'users', () => renderFullUsers(users, orders));

    curItems.forEach(u => {
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
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-8">No activity logs found.</td></tr>';
        document.getElementById('pagination-activity')?.classList.add('hidden');
        return;
    }

    const page = state.pages.activity;
    const items = paginate(filtered, page);
    renderPagination('pagination-activity', filtered.length, page, 'activity', () => renderFullActivity(activity));

    items.forEach(a => {
        const ts = parseTs(a.created_at);
        const act = getActionLabel(a);
        const meta = a.metadata ? (typeof a.metadata === 'string' ? a.metadata : JSON.stringify(a.metadata).substring(0, 120)) : '';
        const entityInfo = a.entity_type ? `${a.entity_type}${a.entity_id ? ': ' + a.entity_id.substring(0, 20) : ''}` : '—';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50/50 transition-colors cursor-pointer';
        tr.onclick = () => showActivityDetail(a);
        tr.innerHTML = `
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
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-8">No onboarding requests found.</td></tr>';
        document.getElementById('pagination-first-otp')?.classList.add('hidden');
        return;
    }

    const page = state.pages.firstOtp;
    const items = paginate(filtered, page);
    renderPagination('pagination-first-otp', filtered.length, page, 'firstOtp', () => renderFirstOtp(activity, users));

    items.forEach(a => {
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
function exportCSV(type) {
    let data = [];
    let headers = [];
    let filename = type;

    if (type === 'orders') {
        data = globalData.orders;
        headers = ['order_id', 'created_at', 'customer_name', 'customer_phone', 'store_name', 'store_phone', 'total_amount', 'delivery_status', 'payment_status', 'is_cancelled'];
    } else if (type === 'recordings') {
        data = globalData.recordings;
        headers = ['id', 'created_at', 'store_phone', 'source_phone', 'contact_name', 'duration_ms', 'transcript', 'classification'];
    } else if (type === 'activity') {
        data = globalData.activity;
        headers = ['id', 'created_at', 'action', 'action_type', 'user_phone', 'store_phone', 'entity_type', 'entity_id', 'notes'];
    } else if (type === 'users') {
        data = globalData.users;
        headers = ['phone', 'shop_name', 'shopkeeper_name', 'last_login_at', 'login_count', 'created_at'];
    } else if (type === 'first_otp') {
        data = globalData.activity.filter(a => a.action === 'auth.first_otp' || a.action_type === 'auth.first_otp');
        headers = ['created_at', 'user_phone', 'store_phone', 'metadata'];
        filename = 'first_otp';
    }

    if (!data.length) { alert('No data to export.'); return; }

    let csv = headers.join(',') + '\n';
    data.forEach(row => {
        const vals = headers.map(h => {
            let v = row[h] != null ? String(row[h]) : '';
            v = v.replace(/"/g, '""');
            if (v.includes(',') || v.includes('"') || v.includes('\n')) v = `"${v}"`;
            return v;
        });
        csv += vals.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kiko_${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ---------------------------------------------------------
// 22. MOBILE SIDEBAR HELPERS (global)
// ---------------------------------------------------------
window.switchTab = switchTab;
window.setDateFilter = setDateFilter;
window.exportCSV = exportCSV;
window.openSidebar = openSidebar;
window.closeSidebar = closeSidebar;
window.closeOrderModal = closeOrderModal;
window.closeActivityDetail = closeActivityDetail;
