// kikocall-dashboard/app.js

// ---------------------------------------------------------
// 1. CONFIGURATION
// ---------------------------------------------------------
const SUPABASE_URL = 'https://kdxlxwyjhaijdjpbfnir.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkeGx4d3lqaGFpamRqcGJmbmlyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzgzMDAwOCwiZXhwIjoyMDg5NDA2MDA4fQ.NdKZPvbr_OXoAtW2686QOpfu3qdmF7ucCzg1lG_vayk';
const DASHBOARD_PASSWORD = 'admin';

let supabaseClient = null;
let ordersChartInstance = null;
let statusChartInstance = null;

const globalData = {
  orders: [],
  recordings: [],
  activity: [],
};

// Initialize strictly inside a try-catch to prevent file:// protocol crashes
try {
  if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
} catch (e) {
  console.error('Failed to initialize Supabase:', e);
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
  }, 300);
}

// ---------------------------------------------------------
// 3. DATA FETCHING (SUPABASE)
// ---------------------------------------------------------
async function fetchDashboardData() {
  if (!supabaseClient) {
    alert('Database connection is not available.');
    return;
  }
  try {
    const now = new Date();
    document.getElementById('last-updated').innerText =
      `Last updated: ${now.toLocaleTimeString()}`;

    // Helper to fetch deeply paginated tables
    const fetchAll = async (table) => {
      try {
        let res = [];
        let from = 0;
        let step = 1000;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabaseClient
            .from(table)
            .select('*')
            .order('created_at', { ascending: false })
            .range(from, from + step - 1);
          if (error) {
            console.error(`Error ${table}:`, error);
            break;
          }
          if (data && data.length > 0) {
            res = res.concat(data);
            from += step;
            if (data.length < step) hasMore = false;
          } else {
            hasMore = false;
          }
        }
        return res;
      } catch (e) {
        console.error(e);
        return [];
      }
    };

    const allOrders = await fetchAll('orders');
    const allRecordings = await fetchAll('recordings');
    const allActivity = await fetchAll('activity_log');

    globalData.orders = allOrders || [];
    globalData.recordings = allRecordings || [];
    globalData.activity = allActivity || [];

    let sellersCount = 0;
    try {
      const { count, error } = await supabaseClient
        .from('users')
        .select('*', { count: 'exact', head: true });
      if (!error) sellersCount = count || 0;
    } catch (e) {}

    processMetrics(globalData.orders, sellersCount, globalData.recordings);
    renderCharts(globalData.orders);

    // Render Overview Tab
    renderOverviewOrders(globalData.orders);
    renderOverviewTranscripts(globalData.recordings);

    // Render Data Tabs
    // renderFullOrders(globalData.orders);
    // renderFullTranscripts(globalData.recordings);
    console.log('globalData.activity', globalData);

    renderFullActivity(globalData.activity);
  } catch (err) {
    console.error('Error fetching dashboard data:', err);
  }
}

// ---------------------------------------------------------
// 4. METRICS PROCESSING
// ---------------------------------------------------------
function processMetrics(orders, totalSellers, recordings = []) {
  const totalOrders = orders.length;

  // Calculate total sales
  let totalSalesStr = '₹0';
  try {
    const totalSales = orders.reduce((sum, order) => {
      if (order.total_amount) return sum + parseFloat(order.total_amount);
      return sum;
    }, 0);
    totalSalesStr = `₹${totalSales.toLocaleString('en-IN')}`;
  } catch (e) {}

  const customerPhones = new Set();
  orders.forEach((o) => {
    if (o.customer_phone) customerPhones.add(o.customer_phone);
  });

  document.getElementById('stat-orders').innerText = totalOrders;
  document.getElementById('stat-sales').innerText = totalSalesStr;
  document.getElementById('stat-customers').innerText = customerPhones.size;

  if (totalSellers > 0) {
    document.getElementById('stat-sellers').innerText = totalSellers;
  } else {
    const sellersSet = new Set();
    orders.forEach((o) => {
      if (o.store_phone || o.registered_phone)
        sellersSet.add(o.store_phone || o.registered_phone);
    });
    document.getElementById('stat-sellers').innerText =
      sellersSet.size > 0 ? sellersSet.size : totalOrders > 0 ? '1+' : '0';
  }

  // Call Recordings Data
  const successTranscripts = recordings.filter(
    (r) => r.transcript && r.transcript.length > 4,
  ).length;
  const totalCalls = recordings.length;

  if (document.getElementById('total-calls')) {
    document.getElementById('total-calls').innerText = totalCalls;
  }
  if (document.getElementById('total-transcripts')) {
    document.getElementById('total-transcripts').innerText = successTranscripts;
  }
}

// ---------------------------------------------------------
// 5. CHARTS (CHART.JS)
// ---------------------------------------------------------
function renderCharts(orders) {
  if (!orders || orders.length === 0) return;

  // 1. Order Status Distribution (Pie Chart)
  const statusCounts = { pending: 0, completed: 0, cancelled: 0 };
  orders.forEach((o) => {
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
      datasets: [
        {
          data: [
            statusCounts.pending,
            statusCounts.completed,
            statusCounts.cancelled,
          ],
          backgroundColor: ['#f59e0b', '#10b981', '#ef4444'], // Amber, Emerald, Red
          borderWidth: 0,
          cutout: '75%',
          hoverOffset: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, padding: 20 },
        },
      },
    },
  });

  // 2. Orders Over Time (Line Chart)
  // Group orders by date (last 7-14 days ideally, or just raw dates)
  const datesMap = {};
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

  last7Days.forEach((d) => (datesMap[d] = 0));
  console.log('orders', orders);

  orders.forEach((o) => {
    if (!o.created_at) return;

    let dateStr;

    if (typeof o.created_at === 'number') {
      const d = new Date(o.created_at);
      dateStr = d.toISOString().split('T')[0];
    } else if (typeof o.created_at === 'string') {
      dateStr = o.created_at.split('T')[0];
    } else {
      return;
    }

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
      labels: Object.keys(datesMap).map((d) => {
        const parts = d.split('-');
        return `${parts[2]}/${parts[1]}`;
      }),
      datasets: [
        {
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
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 5,
          grid: { borderDash: [4, 4], color: '#f1f5f9' },
          border: { display: false },
        },
        x: { grid: { display: false }, border: { display: false } },
      },
    },
  });
}

// ---------------------------------------------------------
// 6. TABLE RENDERING
// ---------------------------------------------------------
function renderOverviewOrders(orders) {
  const tbody = document.getElementById('full-orders-table-body');
  tbody.innerHTML = '';

  if (orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500">No orders found.</td></tr>`;
    return;
  }

  // Show top 10 recent orders
  const recentOrders = orders.slice(0, 10);

  recentOrders.forEach((o) => {
    const dateObj = new Date(o.created_at);
    const dateStr =
      dateObj.toLocaleDateString() +
      ' ' +
      dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let statusColor = 'bg-gray-100 text-gray-800';
    const st = (o.status || '').toLowerCase();
    if (st === 'pending') statusColor = 'bg-amber-100 text-amber-800';
    if (st === 'completed') statusColor = 'bg-emerald-100 text-emerald-800';
    if (st === 'cancelled') statusColor = 'bg-red-100 text-red-800';

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-50/50 transition-colors group';

    // WhatsApp link
    const phone = o.customer_phone
      ? o.customer_phone.replace(/[^0-9]/g, '')
      : '';
    const waLink = phone
      ? `https://wa.me/${phone}?text=Hello%20regarding%20your%20order%20${o.order_id}`
      : '#';

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
                ${
                  phone
                    ? `
                <a href="${waLink}" target="_blank" class="inline-flex items-center gap-1 px-3 py-1.5 bg-[#25D366]/10 text-[#075E54] rounded-lg hover:bg-[#25D366]/20 transition-colors text-sm font-medium">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.161.453-.834.815-1.161.882-.259.053-.578.114-1.61-.223-1.685-.548-2.775-2.261-2.859-2.373-.083-.112-.681-.906-.681-1.728 0-.822.428-1.226.582-1.391.155-.164.335-.205.449-.205.113 0 .227.001.325.005.112.006.262-.043.4.29.141.338.482 1.173.528 1.272.043.099.071.215.014.33-.057.114-.085.185-.17.29-.085.105-.181.23-.255.325-.085.105-.183.219-.066.421.117.202.523.864 1.121 1.398.773.688 1.417.899 1.62.999.202.099.32.085.44-.055.12-.14.512-.601.651-.806.14-.206.278-.172.46-.103.181.069 1.146.541 1.343.64.197.099.329.148.378.232.049.083.049.48-.112.933z"></path></svg>
                    Chat
                </a>
                `
                    : '<span class="text-xs text-gray-400">No Contact</span>'
                }
            </td>
        `;
    tbody.appendChild(tr);
  });
}
// ---------------------------------------------------------
// 7. TRANSCRIPTS RENDERING
// ---------------------------------------------------------
function renderOverviewTranscripts(recordings) {
  const tbody = document.getElementById('full-transcripts-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!recordings || recordings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-8 text-center text-gray-500">No transcripts available.</td></tr>`;
    return;
  }

  // Only show ones with actual transcripts
  const textRecs = recordings
    .filter((r) => r.transcript && r.transcript.length > 2)
    .slice(0, 15);

  if (textRecs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-8 text-center text-gray-500">No text transcripts available, only raw calls.</td></tr>`;
    return;
  }
  console.log('textRecs', textRecs);

  textRecs.forEach((r) => {
    const dateObj = new Date(r.created_at || Date.now());
    const dateStr =
      dateObj.toLocaleDateString() +
      ' ' +
      dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-50/50 transition-colors';

    // Grab either receiver_phone, store_phone, session_id, or phone
    const identifier =
      r.receiver_phone ||
      r.store_phone ||
      r.phone_number ||
      r.caller_phone ||
      'Unknown';
    const shop = r.shop_number || r.shop_name || r.store_name || '';

    let receiverInfo = `<div class="font-medium text-gray-900">${identifier}</div>`;
    if (shop)
      receiverInfo += `<div class="text-xs text-gray-500">Shop: ${shop}</div>`;

    tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-xs text-gray-500">${dateStr}</td>
            <td class="px-6 py-4">${receiverInfo}</td>
            <td class="px-6 py-4">
                <div class="line-clamp-3 text-sm italic text-gray-700 font-serif border-l-2 border-indigo-200 pl-3">
                    "${r.transcript.substring(0, 300)}${r.transcript.length > 300 ? '...' : ''}"
                </div>
            </td>
        `;
    tbody.appendChild(tr);
  });
}
// ---------------------------------------------------------
// 8. Activity Logs
// ---------------------------------------------------------
function renderFullActivity(activity) {
  console.log('activity', activity);

  const tbody = document.getElementById('full-activity-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  // Empty state
  if (!activity || activity.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="px-6 py-8 text-center text-gray-500">
          No activity logs found.
        </td>
      </tr>
    `;
    return;
  }

  activity.forEach((a) => {
    const tr = document.createElement('tr');

    // Handle timestamp (same issue you had before)
    const date = new Date(a.created_at || Date.now());
    const dateStr =
      date.toLocaleDateString() +
      ' ' +
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    tr.className = 'hover:bg-gray-50/50 transition-colors';

    tr.innerHTML = `
      <td class="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
        ${dateStr}
      </td>
      <td class="px-6 py-4">
        ${a.action_type || 'N/A'}
      </td>
      <td class="px-6 py-4">
        ${a.user_phone || a.user_id || 'Unknown'}
      </td>
      <td class="px-6 py-4">
        ${a.notes || a.description || '-'}
      </td>
    `;

    tbody.appendChild(tr);
  });
}

function switchTab(tabId) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach((tab) => {
    tab.classList.add('hidden');
    tab.classList.remove('block');
  });

  // Reset all tab buttons
  document.querySelectorAll('.tab-link').forEach((btn) => {
    btn.classList.remove('text-brand-600', 'border-brand-600');
    btn.classList.add('text-gray-500', 'border-transparent');
  });

  // Show selected tab
  const activeTab = document.getElementById(tabId);
  if (activeTab) {
    activeTab.classList.remove('hidden');
    activeTab.classList.add('block');
  }

  // Activate selected button
  const activeBtn = document.getElementById('nav-' + tabId);
  if (activeBtn) {
    activeBtn.classList.add('text-brand-600', 'border-brand-600');
    activeBtn.classList.remove('text-gray-500', 'border-transparent');
  }
}
