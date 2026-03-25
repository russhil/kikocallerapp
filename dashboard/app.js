// kikocall-dashboard/app.js

// ---------------------------------------------------------
// 1. CONFIGURATION
// ---------------------------------------------------------
const SUPABASE_URL = 'https://kdxlxwyjhaijdjpbfnir.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeGx4d3lqaGFpamRqcGJmbmlyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzgzMDAwOCwiZXhwIjoyMDg5NDA2MDA4fQ.NdKZPvbr_OXoAtW2686QOpfu3qdmF7ucCzg1lG_vayk';
const DASHBOARD_PASSWORD = 'admin'; 

let supabaseClient = null;
let ordersChartInstance = null;
let statusChartInstance = null;

const globalData = {
    orders: [],
    recordings: [],
    activity: []
};

// Initialize strictly inside a try-catch to prevent file:// protocol crashes
try {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
} catch (e) {
    console.error("Failed to initialize Supabase:", e);
}

// ---------------------------------------------------------
// 2. HELPERS
// ---------------------------------------------------------

/**
 * Parse created_at which can be epoch ms (number/string) or ISO string.
 * Returns a Date object.
 */
function parseDate(val) {
    if (!val) return new Date(0);
    // If it's a number or a numeric string (epoch ms)
    if (typeof val === 'number') return new Date(val);
    if (typeof val === 'string' && /^\d+$/.test(val.trim())) return new Date(parseInt(val, 10));
    // Otherwise treat as ISO string
    return new Date(val);
}

function formatDate(val) {
    const d = parseDate(val);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------
// 3. TAB SWITCHING
// ---------------------------------------------------------
function switchTab(tabId) {
    // Hide all tab content panes
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('block');
    });
    // Show the selected one
    const target = document.getElementById(tabId);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('block');
    }
    // Update tab button styling
    document.querySelectorAll('.tab-link').forEach(btn => {
        btn.classList.remove('text-brand-600', 'border-brand-600');
        btn.classList.add('text-gray-500', 'border-transparent');
    });
    const activeBtn = document.getElementById('nav-' + tabId);
    if (activeBtn) {
        activeBtn.classList.remove('text-gray-500', 'border-transparent');
        activeBtn.classList.add('text-brand-600', 'border-brand-600');
    }
}

// ---------------------------------------------------------
// 4. LIFECYCLE / EVENT LISTENERS
// ---------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    
    // Check if already logged in (session storage)
    if (sessionStorage.getItem('kiko_dashboard_auth') === 'true') {
        showDashboard();
    }

    // Login Form Handler
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const pwd = document.getElementById('password-input').value;
        if (pwd === DASHBOARD_PASSWORD) {
            sessionStorage.setItem('kiko_dashboard_auth', 'true');
            showDashboard();
        } else {
            document.getElementById('login-error').classList.remove('hidden');
        }
    });

    // Refresh Button Handler
    document.getElementById('refresh-btn').addEventListener('click', () => {
        const btn = document.getElementById('refresh-btn');
        btn.classList.add('animate-spin');
        fetchDashboardData().finally(() => {
            setTimeout(() => btn.classList.remove('animate-spin'), 500);
        });
    });
});

function showDashboard() {
    document.getElementById('login-screen').classList.add('fade-out');
    setTimeout(() => {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        document.getElementById('dashboard').classList.add('flex');
        
        // Fetch data once visible
        fetchDashboardData();
    }, 300);
}

// ---------------------------------------------------------
// 5. DATA FETCHING (SUPABASE)
// ---------------------------------------------------------
async function fetchDashboardData() {
    if (!supabaseClient) {
        alert("Database connection is not available.");
        return;
    }
    try {
        const now = new Date();
        document.getElementById('last-updated').innerText = `Last updated: ${now.toLocaleTimeString()}`;

        // Helper to fetch deeply paginated tables
        const fetchAll = async (table) => {
            try {
                let res = [];
                let from = 0; let step = 1000; let hasMore = true;
                while (hasMore) {
                    const { data, error } = await supabaseClient.from(table).select('*').order('created_at', { ascending: false }).range(from, from + step - 1);
                    if (error) { console.error(`Error ${table}:`, error); break; }
                    if (data && data.length > 0) { res = res.concat(data); from += step; if (data.length < step) hasMore = false; } else { hasMore = false; }
                }
                return res;
            } catch(e) { console.error(e); return []; }
        };

        const allOrders = await fetchAll('orders');
        const allRecordings = await fetchAll('recordings');
        
        let allActivity = [];
        try {
            allActivity = await fetchAll('activity_log');
        } catch(e) {
            console.warn('activity_log fetch failed (may have RLS):', e);
        }

        globalData.orders = allOrders || [];
        globalData.recordings = allRecordings || [];
        globalData.activity = allActivity || [];

        console.log(`[Dashboard] Fetched: ${globalData.orders.length} orders, ${globalData.recordings.length} recordings, ${globalData.activity.length} activity logs`);

        let sellersCount = 0;
        try {
            const { count, error } = await supabaseClient.from('users').select('*', { count: 'exact', head: true });
            if (!error) sellersCount = count || 0;
        } catch(e) {}
        
        processMetrics(globalData.orders, sellersCount, globalData.recordings);
        renderCharts(globalData.orders);

        // Render Data Tabs
        renderFullOrders(globalData.orders);
        renderFullTranscripts(globalData.recordings);
        renderFullActivity(globalData.activity);

    } catch (err) {
        console.error('Error fetching dashboard data:', err);
    }
}

// ---------------------------------------------------------
// 6. METRICS PROCESSING
// ---------------------------------------------------------
function processMetrics(orders, totalSellers, recordings = []) {
    const totalOrders = orders.length;
    
    // Calculate total sales
    let totalSalesStr = "₹0";
    try {
        const totalSales = orders.reduce((sum, order) => {
            if (order.total_amount) return sum + parseFloat(order.total_amount);
            return sum;
        }, 0);
        totalSalesStr = `₹${totalSales.toLocaleString('en-IN')}`;
    } catch(e) {}

    const customerPhones = new Set();
    orders.forEach(o => { if (o.customer_phone) customerPhones.add(o.customer_phone); });
    
    document.getElementById('stat-orders').innerText = totalOrders;
    document.getElementById('stat-sales').innerText = totalSalesStr;
    document.getElementById('stat-customers').innerText = customerPhones.size;
    
    if (totalSellers > 0) {
        document.getElementById('stat-sellers').innerText = totalSellers;
    } else {
        const sellersSet = new Set();
        orders.forEach(o => { if (o.store_phone || o.registered_phone) sellersSet.add(o.store_phone || o.registered_phone); });
        document.getElementById('stat-sellers').innerText = sellersSet.size > 0 ? sellersSet.size : totalOrders > 0 ? "1+" : "0";
    }

    // Call Recordings Data
    const successTranscripts = recordings.filter(r => r.transcript && r.transcript.length > 4).length;
    const totalCalls = recordings.length;
    
    if (document.getElementById('total-calls')) {
        document.getElementById('total-calls').innerText = totalCalls;
    }
    if (document.getElementById('total-transcripts')) {
        document.getElementById('total-transcripts').innerText = successTranscripts;
    }
}

// ---------------------------------------------------------
// 7. CHARTS (CHART.JS)
// ---------------------------------------------------------
function renderCharts(orders) {
    if (!orders || orders.length === 0) return;

    // 1. Order Status Distribution (Doughnut)
    const statusCounts = { 'pending': 0, 'completed': 0, 'cancelled': 0 };
    orders.forEach(o => {
        if (o.is_cancelled) {
            statusCounts['cancelled']++;
        } else if (o.delivery_status === 'delivered' || o.payment_status === 'paid') {
            statusCounts['completed']++;
        } else {
            statusCounts['pending']++;
        }
    });

    document.getElementById('pie-center-total').innerText = orders.length;

    const ctxStatus = document.getElementById('statusChart').getContext('2d');
    if (statusChartInstance) statusChartInstance.destroy();
    
    statusChartInstance = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: ['Pending', 'Completed', 'Cancelled'],
            datasets: [{
                data: [statusCounts.pending, statusCounts.completed, statusCounts.cancelled],
                backgroundColor: ['#f59e0b', '#10b981', '#ef4444'],
                borderWidth: 0,
                cutout: '75%',
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } }
            }
        }
    });

    // 2. Orders Over Time (Line Chart) — last 7 days
    const datesMap = {};
    const last7Days = Array.from({length: 7}, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toISOString().split('T')[0];
    });

    last7Days.forEach(d => datesMap[d] = 0);

    orders.forEach(o => {
        if (!o.created_at) return;
        const dateObj = parseDate(o.created_at);
        const dateStr = dateObj.toISOString().split('T')[0];
        if (datesMap[dateStr] !== undefined) {
            datesMap[dateStr]++;
        } else if (dateObj >= new Date(last7Days[0])) {
            datesMap[dateStr] = 1;
        }
    });

    const ctxOrders = document.getElementById('ordersChart').getContext('2d');
    if (ordersChartInstance) ordersChartInstance.destroy();

    ordersChartInstance = new Chart(ctxOrders, {
        type: 'line',
        data: {
            labels: Object.keys(datesMap).map(d => {
                const parts = d.split('-');
                return `${parts[2]}/${parts[1]}`;
            }),
            datasets: [{
                label: 'Orders',
                data: Object.values(datesMap),
                borderColor: '#4f46e5',
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#4f46e5',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, suggestedMax: 5, grid: { borderDash: [4, 4], color: '#f1f5f9' }, border: { display: false } },
                x: { grid: { display: false }, border: { display: false } }
            }
        }
    });
}

// ---------------------------------------------------------
// 8. FULL ORDERS TABLE
// ---------------------------------------------------------
function renderFullOrders(orders) {
    const tbody = document.getElementById('full-orders-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!orders || orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-gray-400">No orders found in database.</td></tr>`;
        return;
    }

    orders.forEach(o => {
        const dateStr = formatDate(o.created_at);
        
        // Determine status
        let statusLabel = 'Pending';
        let statusColor = 'bg-amber-100 text-amber-800';
        if (o.is_cancelled) {
            statusLabel = 'Cancelled';
            statusColor = 'bg-red-100 text-red-800';
        } else if (o.delivery_status === 'delivered') {
            statusLabel = 'Delivered';
            statusColor = 'bg-emerald-100 text-emerald-800';
        } else if (o.payment_status === 'paid') {
            statusLabel = 'Paid';
            statusColor = 'bg-blue-100 text-blue-800';
        } else if (o.whatsapp_sent) {
            statusLabel = 'WA Sent';
            statusColor = 'bg-green-100 text-green-800';
        }

        // Products summary
        let productsSummary = '';
        if (o.products && Array.isArray(o.products)) {
            productsSummary = o.products.map(p => `${p.name || 'Item'} ×${p.quantity || 1}`).join(', ');
            if (productsSummary.length > 80) productsSummary = productsSummary.substring(0, 77) + '...';
        }

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50/50 transition-colors';
        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-semibold text-gray-900 text-sm">${escapeHtml(o.order_id || '—')}</div>
                <div class="text-xs text-gray-400 mt-0.5">${dateStr}</div>
                ${productsSummary ? `<div class="text-xs text-gray-500 mt-1 max-w-xs truncate" title="${escapeHtml(productsSummary)}">${escapeHtml(productsSummary)}</div>` : ''}
            </td>
            <td class="px-6 py-4">
                <div class="font-medium text-gray-900 text-sm">${escapeHtml(o.customer_name || 'Unknown')}</div>
                <div class="text-xs text-gray-500">${escapeHtml(o.customer_phone || 'No phone')}</div>
                ${o.customer_address ? `<div class="text-xs text-gray-400 mt-0.5 max-w-xs truncate">${escapeHtml(o.customer_address)}</div>` : ''}
            </td>
            <td class="px-6 py-4">
                <div class="font-medium text-gray-900 text-sm">${escapeHtml(o.store_name || 'N/A')}</div>
                <div class="text-xs text-gray-500">${escapeHtml(o.store_phone || o.store_number || '')}</div>
            </td>
            <td class="px-6 py-4">
                <div class="font-bold text-gray-900">₹${parseFloat(o.total_amount || 0).toLocaleString('en-IN')}</div>
                <div class="text-xs text-gray-400">${o.item_count || (o.products ? o.products.length : 0)} items</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2.5 py-1 text-xs font-semibold rounded-full ${statusColor}">
                    ${statusLabel}
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ---------------------------------------------------------
// 9. FULL TRANSCRIPTS TABLE
// ---------------------------------------------------------
function renderFullTranscripts(recordings) {
    const tbody = document.getElementById('full-transcripts-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!recordings || recordings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-8 text-center text-gray-400">No recordings found in database.</td></tr>`;
        return;
    }

    recordings.forEach(r => {
        const dateStr = formatDate(r.created_at || r.date_recorded);
        const identifier = r.source_phone || r.contact_name || r.store_phone || r.filename || 'Unknown';
        const classification = r.classification || '';
        const duration = r.duration_ms ? `${Math.round(r.duration_ms / 1000)}s` : '';
        
        let classificationBadge = '';
        if (classification) {
            const isOrder = classification.toUpperCase().includes('ORDER');
            classificationBadge = `<span class="px-2 py-0.5 text-xs font-medium rounded-full ${isOrder ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}">${escapeHtml(classification)}</span>`;
        }

        const transcript = r.transcript || '';
        const hasTranscript = transcript.length > 2;

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50/50 transition-colors';
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-700">${dateStr}</div>
                ${duration ? `<div class="text-xs text-gray-400 mt-0.5">Duration: ${duration}</div>` : ''}
            </td>
            <td class="px-6 py-4">
                <div class="font-medium text-gray-900 text-sm">${escapeHtml(identifier)}</div>
                <div class="flex items-center gap-2 mt-1">
                    ${r.call_direction ? `<span class="text-xs text-gray-400">${escapeHtml(r.call_direction)}</span>` : ''}
                    ${classificationBadge}
                </div>
            </td>
            <td class="px-6 py-4">
                ${hasTranscript 
                    ? `<div class="line-clamp-3 text-sm italic text-gray-700 font-serif border-l-2 border-indigo-200 pl-3">"${escapeHtml(transcript.substring(0, 400))}${transcript.length > 400 ? '...' : ''}"</div>`
                    : `<span class="text-xs text-gray-400 italic">No transcript available</span>`
                }
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ---------------------------------------------------------
// 10. FULL ACTIVITY LOG TABLE
// ---------------------------------------------------------
function renderFullActivity(activity) {
    const tbody = document.getElementById('full-activity-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!activity || activity.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-400">No activity logs found.</td></tr>`;
        return;
    }

    activity.forEach(a => {
        const dateStr = formatDate(a.created_at);
        const action = a.action || '—';
        const userPhone = a.store_phone || a.user_phone || '—';
        const entityInfo = [a.entity_type, a.entity_id].filter(Boolean).join(': ');
        
        // Color-code actions
        let actionColor = 'bg-gray-100 text-gray-700';
        if (action.includes('order')) actionColor = 'bg-blue-100 text-blue-700';
        if (action.includes('auth')) actionColor = 'bg-purple-100 text-purple-700';
        if (action.includes('recording')) actionColor = 'bg-teal-100 text-teal-700';
        if (action.includes('error') || action.includes('fail')) actionColor = 'bg-red-100 text-red-700';

        let metadataStr = '';
        if (a.metadata && typeof a.metadata === 'object') {
            const entries = Object.entries(a.metadata).slice(0, 4);
            metadataStr = entries.map(([k, v]) => `${k}: ${typeof v === 'string' ? v.substring(0, 50) : v}`).join(' · ');
        }

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50/50 transition-colors';
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${dateStr}</td>
            <td class="px-6 py-4">
                <span class="px-2.5 py-1 text-xs font-semibold rounded-full ${actionColor}">${escapeHtml(action)}</span>
            </td>
            <td class="px-6 py-4">
                <div class="font-medium text-gray-900 text-sm">${escapeHtml(userPhone)}</div>
                ${entityInfo ? `<div class="text-xs text-gray-500">${escapeHtml(entityInfo)}</div>` : ''}
            </td>
            <td class="px-6 py-4 text-xs text-gray-500 max-w-md truncate" title="${escapeHtml(metadataStr)}">${escapeHtml(metadataStr) || '—'}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ---------------------------------------------------------
// 11. CSV EXPORT
// ---------------------------------------------------------
function exportCSV(type) {
    let data = [];
    let filename = 'export.csv';
    let headers = [];

    if (type === 'orders') {
        data = globalData.orders;
        filename = `kiko_orders_${new Date().toISOString().split('T')[0]}.csv`;
        headers = ['order_id', 'created_at', 'customer_name', 'customer_phone', 'customer_address', 'store_name', 'store_phone', 'total_amount', 'item_count', 'products', 'payment_status', 'delivery_status', 'whatsapp_sent', 'is_cancelled', 'notes', 'order_source', 'call_direction'];
    } else if (type === 'recordings') {
        data = globalData.recordings;
        filename = `kiko_recordings_${new Date().toISOString().split('T')[0]}.csv`;
        headers = ['id', 'created_at', 'filename', 'source_phone', 'contact_name', 'call_direction', 'classification', 'duration_ms', 'transcript', 'store_phone', 'is_processed'];
    } else if (type === 'activity') {
        data = globalData.activity;
        filename = `kiko_activity_${new Date().toISOString().split('T')[0]}.csv`;
        headers = ['created_at', 'action', 'store_phone', 'user_phone', 'entity_type', 'entity_id', 'ip_address'];
    }

    if (data.length === 0) {
        alert('No data to export.');
        return;
    }

    // Build CSV
    const csvRows = [];
    csvRows.push(headers.join(','));

    data.forEach(row => {
        const values = headers.map(h => {
            let val = row[h];
            if (val === null || val === undefined) return '';
            if (typeof val === 'object') val = JSON.stringify(val);
            // Escape quotes and wrap in quotes
            val = String(val).replace(/"/g, '""');
            return `"${val}"`;
        });
        csvRows.push(values.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
