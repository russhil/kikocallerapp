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

// Initialize strictly inside a try-catch to prevent file:// protocol crashes
try {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
} catch (e) {
    console.error("Failed to initialize Supabase:", e);
}

// ---------------------------------------------------------
// 2. LIFECYCLE / EVENT LISTENERS
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

        // Auto-refresh every 30 seconds
        setInterval(() => {
            fetchDashboardData();
        }, 30000);

        // Supabase real-time subscription for instant updates
        if (supabaseClient) {
            try {
                supabaseClient
                    .channel('orders-changes')
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                        console.log('[Realtime] Orders table changed, refreshing...');
                        fetchDashboardData();
                    })
                    .subscribe();
            } catch (e) {
                console.warn('Realtime subscription failed (non-critical):', e);
            }
        }
    }, 300);
}

function scrollToOrders() {
    const el = document.getElementById('orders-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------
// 3. DATA FETCHING (SUPABASE)
// ---------------------------------------------------------
async function fetchDashboardData() {
    if (!supabaseClient) {
        alert("Database connection is not available. Please ensure you are not running this via strict file:// or try a local server.");
        return;
    }
    try {
        // Update stamp
        const now = new Date();
        document.getElementById('last-updated').innerText = `Last updated: ${now.toLocaleTimeString()}`;

        // Fetch Orders table
        // We'll fetch all orders for the dashboard (or paginate/limit as needed)
        const { data: orders, error: ordersError } = await supabaseClient
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (ordersError) throw ordersError;

        // Fetch Sellers (users table, assuming 'users' or 'profiles')
        // We'll use the 'users' table if it exists
        const { count: sellersCount, error: sellersError } = await supabaseClient
            .from('users')
            .select('*', { count: 'exact', head: true });
        
        // Process data
        processMetrics(orders || [], sellersCount || 0);
        renderCharts(orders || []);
        renderTable(orders || []);

    } catch (err) {
        console.error('Error fetching dashboard data:', err);
        alert('Failed to sync data from backend.');
    }
}

// ---------------------------------------------------------
// 4. METRICS PROCESSING
// ---------------------------------------------------------
function processMetrics(orders, totalSellers) {
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

    // Unique Customers by Phone Number
    const customerPhones = new Set();
    orders.forEach(o => {
        if (o.customer_phone) customerPhones.add(o.customer_phone);
    });
    
    // Animate numbers up (simple DOM update)
    document.getElementById('stat-orders').innerText = totalOrders;
    document.getElementById('stat-sales').innerText = totalSalesStr;
    document.getElementById('stat-customers').innerText = customerPhones.size;
    
    // If sellers query failed/denied, fallback to unique shop_names from orders
    if (totalSellers > 0) {
        document.getElementById('stat-sellers').innerText = totalSellers;
    } else {
        const sellersSet = new Set();
        orders.forEach(o => {
            if (o.registered_phone) sellersSet.add(o.registered_phone);
        });
        document.getElementById('stat-sellers').innerText = sellersSet.size > 0 ? sellersSet.size : totalOrders > 0 ? "1+" : "0";
    }
}

// ---------------------------------------------------------
// 5. CHARTS (CHART.JS)
// ---------------------------------------------------------
function renderCharts(orders) {
    if (!orders || orders.length === 0) return;

    // 1. Order Status Distribution (Pie Chart)
    const statusCounts = { 'pending': 0, 'completed': 0, 'cancelled': 0 };
    orders.forEach(o => {
        const status = (o.status || 'pending').toLowerCase();
        if (statusCounts[status] !== undefined) statusCounts[status]++;
        else statusCounts['pending']++; // fallback
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
                backgroundColor: ['#f59e0b', '#10b981', '#ef4444'], // Amber, Emerald, Red
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

    // 2. Orders Over Time (Line Chart)
    // Group orders by date (last 7-14 days ideally, or just raw dates)
    const datesMap = {};
    const last7Days = Array.from({length: 7}, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toISOString().split('T')[0];
    });

    last7Days.forEach(d => datesMap[d] = 0);

    orders.forEach(o => {
        if (!o.created_at) return;
        const dateStr = o.created_at.split('T')[0];
        if (datesMap[dateStr] !== undefined) {
            datesMap[dateStr]++;
        } else if (new Date(dateStr) >= new Date(last7Days[0])) {
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
                borderColor: '#4f46e5', // Brand 600
                backgroundColor: 'rgba(79, 70, 229, 0.1)', // Brand transparent
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
// 6. TABLE RENDERING
// ---------------------------------------------------------
function renderTable(orders) {
    const tbody = document.getElementById('orders-table-body');
    tbody.innerHTML = '';

    if (orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500">No orders found.</td></tr>`;
        return;
    }

    // Show ALL orders (no limit)
    const recentOrders = orders;

    recentOrders.forEach(o => {
        const dateObj = new Date(o.created_at);
        const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        let statusColor = 'bg-gray-100 text-gray-800';
        const st = (o.status || '').toLowerCase();
        if (st === 'pending') statusColor = 'bg-amber-100 text-amber-800';
        if (st === 'completed') statusColor = 'bg-emerald-100 text-emerald-800';
        if (st === 'cancelled') statusColor = 'bg-red-100 text-red-800';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50/50 transition-colors group';
        
        // WhatsApp link
        const phone = o.customer_phone ? o.customer_phone.replace(/[^0-9]/g, '') : '';
        const waLink = phone ? `https://wa.me/${phone}?text=Hello%20regarding%20your%20order%20${o.order_id}` : '#';

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-medium text-gray-900">#${(o.order_id || '----').substring(0, 8)}</div>
                <div class="text-xs text-gray-400">Seller: ${o.shop_name || 'N/A'}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">${dateStr}</td>
            <td class="px-6 py-4">
                <div class="font-medium text-gray-900">${o.customer_name || 'Unknown'}</div>
                <div class="text-xs text-gray-500">${o.customer_phone || 'No phone'}</div>
            </td>
            <td class="px-6 py-4 font-semibold text-gray-900">₹${o.total_amount || '0'}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2.5 py-1 text-xs font-semibold rounded-full ${statusColor} capitalize">
                    ${o.status || 'Pending'}
                </span>
            </td>
            <td class="px-6 py-4 text-right whitespace-nowrap">
                ${phone ? `
                <a href="${waLink}" target="_blank" class="inline-flex items-center gap-1 px-3 py-1.5 bg-[#25D366]/10 text-[#075E54] rounded-lg hover:bg-[#25D366]/20 transition-colors text-sm font-medium">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.161.453-.834.815-1.161.882-.259.053-.578.114-1.61-.223-1.685-.548-2.775-2.261-2.859-2.373-.083-.112-.681-.906-.681-1.728 0-.822.428-1.226.582-1.391.155-.164.335-.205.449-.205.113 0 .227.001.325.005.112.006.262-.043.4.29.141.338.482 1.173.528 1.272.043.099.071.215.014.33-.057.114-.085.185-.17.29-.085.105-.181.23-.255.325-.085.105-.183.219-.066.421.117.202.523.864 1.121 1.398.773.688 1.417.899 1.62.999.202.099.32.085.44-.055.12-.14.512-.601.651-.806.14-.206.278-.172.46-.103.181.069 1.146.541 1.343.64.197.099.329.148.378.232.049.083.049.48-.112.933z"></path></svg>
                    Chat
                </a>
                ` : '<span class="text-xs text-gray-400">No Contact</span>'}
            </td>
        `;
        tbody.appendChild(tr);
    });
}
