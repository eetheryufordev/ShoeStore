/**
 * Shoe Store Admin Application
 * Handles Dashboard, Products, Categories, and Orders management.
 */

// API Configuration
const isLocalDirect = window.location.protocol === 'file:' || (window.location.port !== '5173' && window.location.port !== '8000');
const API_BASE = isLocalDirect ? 'http://127.0.0.1:8000' : '/api';
const STORAGE_BASE = isLocalDirect ? 'http://127.0.0.1:8000' : '';
const FALLBACK_IMAGE = 'https://placehold.co/400x400/f1f5f9/64748b?text=Shoe+Store';

// Allowed Order Transitions
const ALLOWED_ORDER_TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPING', 'CANCELLED'],
  SHIPPING: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

// Global State
const state = {
  activeTab: 'dashboard', // 'dashboard' | 'products' | 'categories' | 'orders'
  products: [],
  categories: [],
  orders: [],
  isLoading: false,
  isServiceHealthy: null,
  
  // Filters and search
  productSearch: '',
  productCategoryFilter: '',
  categorySearch: '',
  orderSearch: '',
  orderStatusFilter: 'ALL',

  // Modals & Forms
  productModal: { isOpen: false, isEditing: false, data: null },
  categoryModal: { isOpen: false, isEditing: false, data: null },
  orderDetailModal: { isOpen: false, data: null },
  confirmModal: { isOpen: false, title: '', message: '', onConfirm: null },

  // Toast notifications
  toasts: [],
};

// Helper Formatters
const escapeHtml = (val = '') => String(val ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;',
}[char]));

const formatCurrency = (val) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
}).format(Number(val || 0));

const formatDate = (val) => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return val;
  }
};

const resolveImageUrl = (path) => {
  if (!path) return FALLBACK_IMAGE;
  if (/^https?:\/\//i.test(path)) return path;
  let clean = path.replace(/^\.\//, '');
  if (!clean.startsWith('/')) clean = '/' + clean;
  return `${STORAGE_BASE}${clean}`;
};

// Toast Notifications
function showToast(message, type = 'success') {
  const id = Date.now() + Math.random();
  state.toasts.push({ id, message, type });
  renderToasts();
  setTimeout(() => {
    state.toasts = state.toasts.filter(t => t.id !== id);
    renderToasts();
  }, 4000);
}

function renderToasts() {
  const container = document.getElementById('toast-container');
  if (!container) return;
  container.innerHTML = state.toasts.map(t => {
    let bg = 'bg-zinc-900 text-white';
    let icon = '<i class="fas fa-info-circle text-blue-400"></i>';
    if (t.type === 'success') {
      bg = 'bg-emerald-800 text-white';
      icon = '<i class="fas fa-check-circle text-emerald-300"></i>';
    } else if (t.type === 'error') {
      bg = 'bg-rose-800 text-white';
      icon = '<i class="fas fa-exclamation-circle text-rose-300"></i>';
    } else if (t.type === 'warning') {
      bg = 'bg-amber-800 text-white';
      icon = '<i class="fas fa-exclamation-triangle text-amber-300"></i>';
    }
    return `
      <div class="toast flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl ${bg} text-sm mb-2 max-w-sm pointer-events-auto">
        <span class="text-lg">${icon}</span>
        <span class="flex-1 leading-snug">${escapeHtml(t.message)}</span>
      </div>
    `;
  }).join('');
}

// API Client
async function apiRequest(endpoint, options = {}) {
  try {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const res = await fetch(url, options);
    if (!res.ok) {
      let errText = `Lỗi máy chủ (${res.status})`;
      try {
        const json = await res.json();
        if (json.detail) errText = typeof json.detail === 'string' ? json.detail : JSON.stringify(json.detail);
      } catch {
        errText = await res.text() || errText;
      }
      throw new Error(errText);
    }
    return await res.json();
  } catch (error) {
    console.error(`API Error on ${endpoint}:`, error);
    throw error;
  }
}

// Fetch All Initial Data
async function loadAllData() {
  state.isLoading = true;
  renderApp();
  try {
    const [products, categories, orders, health] = await Promise.allSettled([
      apiRequest('/products?limit=500'),
      apiRequest('/categories?limit=500'),
      apiRequest('/orders?limit=500'),
      apiRequest('/health'),
    ]);

    if (products.status === 'fulfilled') state.products = products.value;
    if (categories.status === 'fulfilled') state.categories = categories.value;
    if (orders.status === 'fulfilled') state.orders = orders.value;
    state.isServiceHealthy = health.status === 'fulfilled' && health.value?.status === 'ok';

  } catch (err) {
    showToast('Lỗi khi tải dữ liệu từ máy chủ', 'error');
  } finally {
    state.isLoading = false;
    renderApp();
  }
}

// Order Status Badge Component
function getStatusBadge(status) {
  const map = {
    PENDING: { label: 'Chờ duyệt', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    CONFIRMED: { label: 'Đã xác nhận', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    PROCESSING: { label: 'Đang xử lý', color: 'bg-sky-50 text-sky-700 border-sky-200' },
    SHIPPING: { label: 'Đang giao hàng', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    DELIVERED: { label: 'Đã hoàn thành', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    CANCELLED: { label: 'Đã hủy', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  };
  const s = map[status] || { label: status, color: 'bg-zinc-100 text-zinc-700 border-zinc-200' };
  return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${s.color}">${s.label} (${status})</span>`;
}

// Category Lookup Helper
function getCategoryName(categoryId) {
  const cat = state.categories.find(c => c.id === categoryId);
  return cat ? cat.name : 'Chưa phân loại';
}

// --- VIEWS ---

// 1. Dashboard View
function renderDashboardView() {
  const totalProducts = state.products.length;
  const totalCategories = state.categories.length;
  const totalOrders = state.orders.length;
  
  // Calculate revenue from non-cancelled orders
  const validOrders = state.orders.filter(o => o.status !== 'CANCELLED');
  const totalRevenue = validOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  
  const pendingOrders = state.orders.filter(o => o.status === 'PENDING').length;
  const lowStockProducts = state.products.filter(p => Number(p.stock) <= 10);
  const outOfStockCount = state.products.filter(p => Number(p.stock) === 0).length;

  // Status distribution
  const statusCounts = {
    PENDING: 0, CONFIRMED: 0, PROCESSING: 0, SHIPPING: 0, DELIVERED: 0, CANCELLED: 0
  };
  state.orders.forEach(o => {
    if (statusCounts[o.status] !== undefined) statusCounts[o.status]++;
  });

  return `
    <div class="space-y-6">
      <!-- Welcome Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-zinc-900">Tổng quan quản trị</h1>
          <p class="text-sm text-zinc-500 mt-1">Hệ thống quản lý sản phẩm, danh mục và xử lý đơn hàng Shoe Store</p>
        </div>
        <div class="flex items-center gap-3">
          <button onclick="loadAllData()" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-sm font-medium text-zinc-700 transition">
            <i class="fas fa-sync-alt ${state.isLoading ? 'fa-spin' : ''}"></i> Làm mới
          </button>
          <button onclick="openProductModal()" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium shadow-sm transition">
            <i class="fas fa-plus"></i> Thêm sản phẩm
          </button>
        </div>
      </div>

      <!-- Key Metrics -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div class="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Doanh thu</p>
            <h3 class="text-2xl font-bold text-zinc-900 mt-1">${formatCurrency(totalRevenue)}</h3>
            <p class="text-xs text-emerald-600 font-medium mt-1"><i class="fas fa-check-circle"></i> ${validOrders.length} đơn hàng hợp lệ</p>
          </div>
          <div class="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center text-xl">
            <i class="fas fa-dollar-sign"></i>
          </div>
        </div>

        <div class="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Đơn hàng</p>
            <h3 class="text-2xl font-bold text-zinc-900 mt-1">${totalOrders}</h3>
            <p class="text-xs ${pendingOrders > 0 ? 'text-amber-600 font-bold' : 'text-zinc-500'} mt-1">
              <i class="fas fa-clock"></i> ${pendingOrders} đơn chờ duyệt
            </p>
          </div>
          <div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 grid place-items-center text-xl">
            <i class="fas fa-shopping-bag"></i>
          </div>
        </div>

        <div class="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Sản phẩm</p>
            <h3 class="text-2xl font-bold text-zinc-900 mt-1">${totalProducts}</h3>
            <p class="text-xs ${lowStockProducts.length > 0 ? 'text-rose-600 font-bold' : 'text-zinc-500'} mt-1">
              <i class="fas fa-exclamation-triangle"></i> ${lowStockProducts.length} sắp/hết hàng
            </p>
          </div>
          <div class="w-12 h-12 rounded-xl bg-zinc-100 text-zinc-800 grid place-items-center text-xl">
            <i class="fas fa-box"></i>
          </div>
        </div>

        <div class="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Danh mục</p>
            <h3 class="text-2xl font-bold text-zinc-900 mt-1">${totalCategories}</h3>
            <p class="text-xs text-zinc-500 mt-1"><i class="fas fa-tags"></i> Phân loại cửa hàng</p>
          </div>
          <div class="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 grid place-items-center text-xl">
            <i class="fas fa-folder"></i>
          </div>
        </div>
      </div>

      <!-- Two column section -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Order Status Progress -->
        <div class="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-zinc-900">Trạng thái đơn hàng</h3>
            <span class="text-xs text-zinc-500">${totalOrders} tổng cộng</span>
          </div>
          <div class="space-y-3 pt-2">
            ${[
              ['PENDING', 'Chờ xác nhận', 'bg-amber-500', statusCounts.PENDING],
              ['CONFIRMED', 'Đã xác nhận', 'bg-blue-500', statusCounts.CONFIRMED],
              ['PROCESSING', 'Đang xử lý', 'bg-sky-500', statusCounts.PROCESSING],
              ['SHIPPING', 'Đang giao hàng', 'bg-purple-500', statusCounts.SHIPPING],
              ['DELIVERED', 'Đã hoàn thành', 'bg-emerald-500', statusCounts.DELIVERED],
              ['CANCELLED', 'Đã hủy', 'bg-rose-500', statusCounts.CANCELLED],
            ].map(([st, label, bg, cnt]) => {
              const percent = totalOrders ? Math.round((cnt / totalOrders) * 100) : 0;
              return `
                <div>
                  <div class="flex justify-between text-xs mb-1">
                    <span class="font-medium text-zinc-700">${label} (${st})</span>
                    <span class="text-zinc-500 font-semibold">${cnt} (${percent}%)</span>
                  </div>
                  <div class="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                    <div class="h-full ${bg} rounded-full transition-all duration-500" style="width: ${percent}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          <div class="pt-4 border-t border-zinc-100">
            <button onclick="switchTab('orders')" class="w-full text-center py-2 text-xs font-semibold text-zinc-700 hover:text-black">
              Xem toàn bộ đơn hàng <i class="fas fa-arrow-right ml-1"></i>
            </button>
          </div>
        </div>

        <!-- Recent Orders (2 cols on lg) -->
        <div class="lg:col-span-2 bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-zinc-900">Đơn hàng mới nhất</h3>
            <button onclick="switchTab('orders')" class="text-xs font-semibold text-blue-600 hover:underline">
              Xem tất cả
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Khách hàng</th>
                  <th>Tổng tiền</th>
                  <th>Trạng thái</th>
                  <th>Thời gian</th>
                  <th class="text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                ${state.orders.slice(0, 5).map(o => `
                  <tr>
                    <td class="font-bold text-zinc-900">#${o.id}</td>
                    <td>
                      <div class="font-medium text-zinc-900">${escapeHtml(o.customer_name)}</div>
                      <div class="text-xs text-zinc-400">${escapeHtml(o.phone)}</div>
                    </td>
                    <td class="font-semibold text-zinc-900">${formatCurrency(o.total_amount)}</td>
                    <td>${getStatusBadge(o.status)}</td>
                    <td class="text-xs text-zinc-500">${formatDate(o.created_at)}</td>
                    <td class="text-right">
                      <button onclick="openOrderDetail(${o.id})" class="px-2.5 py-1 text-xs rounded-lg border border-zinc-200 hover:bg-zinc-100 font-medium text-zinc-700 transition">
                        Xem
                      </button>
                    </td>
                  </tr>
                `).join('') || `<tr><td colspan="6" class="text-center py-8 text-zinc-400 text-sm">Chưa có đơn hàng nào</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Low Stock Alerts -->
      <div class="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-bold text-zinc-900">Cảnh báo tồn kho</h3>
            <p class="text-xs text-zinc-500">Các sản phẩm có lượng tồn kho thấp (≤ 10 đôi) cần bổ sung</p>
          </div>
          <button onclick="switchTab('products')" class="text-xs font-semibold text-blue-600 hover:underline">
            Quản lý sản phẩm
          </button>
        </div>
        ${lowStockProducts.length > 0 ? `
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            ${lowStockProducts.slice(0, 6).map(p => `
              <div class="flex items-center gap-3 p-3 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-white transition">
                <img src="${escapeHtml(resolveImageUrl(p.image_url))}" onerror="this.src='${FALLBACK_IMAGE}'" class="admin-thumb shrink-0" alt="">
                <div class="min-w-0 flex-1">
                  <h4 class="text-sm font-semibold text-zinc-900 truncate">${escapeHtml(p.name)}</h4>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-xs font-bold ${p.stock === 0 ? 'text-rose-600' : 'text-amber-600'}">
                      ${p.stock === 0 ? 'Hết hàng (0)' : `Còn ${p.stock} đôi`}
                    </span>
                    <span class="text-xs text-zinc-400">•</span>
                    <span class="text-xs text-zinc-500">${formatCurrency(p.price)}</span>
                  </div>
                </div>
                <button onclick="editProduct(${p.id})" class="p-2 text-zinc-500 hover:text-black rounded-lg hover:bg-zinc-200 text-sm" title="Chỉnh sửa tồn kho">
                  <i class="fas fa-edit"></i>
                </button>
              </div>
            `).join('')}
          </div>
        ` : `
          <p class="text-sm text-emerald-600 py-3"><i class="fas fa-check-circle"></i> Tất cả sản phẩm đều có lượng tồn kho dồi dào (> 10 đôi).</p>
        `}
      </div>
    </div>
  `;
}

// 2. Products View
function renderProductsView() {
  const filtered = state.products.filter(p => {
    const matchesSearch = !state.productSearch || 
      p.name.toLowerCase().includes(state.productSearch.toLowerCase()) || 
      String(p.id) === state.productSearch.trim();
    const matchesCategory = !state.productCategoryFilter || 
      String(p.category_id) === String(state.productCategoryFilter);
    return matchesSearch && matchesCategory;
  });

  return `
    <div class="space-y-6">
      <!-- Toolbar -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
        <div class="flex flex-wrap items-center gap-3 flex-1">
          <div class="relative min-w-[240px] flex-1 max-w-md">
            <i class="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm"></i>
            <input 
              type="text" 
              placeholder="Tìm theo tên sản phẩm hoặc mã ID..." 
              value="${escapeHtml(state.productSearch)}"
              oninput="handleProductSearch(this.value)"
              class="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 transition"
            >
          </div>
          <select 
            onchange="handleProductCategoryFilter(this.value)"
            class="px-3 py-2 text-sm rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 transition"
          >
            <option value="">Tất cả danh mục</option>
            ${state.categories.map(c => `
              <option value="${c.id}" ${String(state.productCategoryFilter) === String(c.id) ? 'selected' : ''}>
                ${escapeHtml(c.name)}
              </option>
            `).join('')}
          </select>
        </div>

        <button 
          onclick="openProductModal()"
          class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold shadow-sm transition"
        >
          <i class="fas fa-plus"></i> Thêm sản phẩm
        </button>
      </div>

      <!-- Products Table -->
      <div class="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div class="p-4 border-b border-zinc-100 flex items-center justify-between">
          <h3 class="font-bold text-zinc-900 text-sm">
            Danh sách sản phẩm <span class="text-zinc-400 font-normal">(${filtered.length} / ${state.products.length})</span>
          </h3>
        </div>
        <div class="overflow-x-auto">
          <table class="admin-table">
            <thead>
              <tr>
                <th class="w-16">Ảnh</th>
                <th>Tên sản phẩm</th>
                <th>Danh mục</th>
                <th>Giá bán</th>
                <th>Tồn kho</th>
                <th>Mô tả</th>
                <th class="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(p => {
                let stockClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                if (p.stock === 0) stockClass = 'bg-rose-50 text-rose-700 border-rose-200';
                else if (p.stock <= 10) stockClass = 'bg-amber-50 text-amber-700 border-amber-200';

                return `
                  <tr>
                    <td>
                      <img 
                        src="${escapeHtml(resolveImageUrl(p.image_url))}" 
                        onerror="this.src='${FALLBACK_IMAGE}'" 
                        class="admin-thumb" 
                        alt="${escapeHtml(p.name)}"
                      >
                    </td>
                    <td>
                      <div class="font-semibold text-zinc-900">${escapeHtml(p.name)}</div>
                      <div class="text-xs text-zinc-400">ID: #${p.id}</div>
                    </td>
                    <td>
                      <span class="inline-block px-2.5 py-0.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700">
                        ${escapeHtml(getCategoryName(p.category_id))}
                      </span>
                    </td>
                    <td class="font-bold text-zinc-900">${formatCurrency(p.price)}</td>
                    <td>
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${stockClass}">
                        ${p.stock} đôi
                      </span>
                    </td>
                    <td class="max-w-xs">
                      <p class="text-xs text-zinc-500 line-clamp-2">${escapeHtml(p.description || 'Chưa có mô tả')}</p>
                    </td>
                    <td class="text-right whitespace-nowrap">
                      <button 
                        onclick="editProduct(${p.id})" 
                        class="p-2 text-zinc-600 hover:text-black rounded-lg hover:bg-zinc-100 text-sm transition" 
                        title="Chỉnh sửa"
                      >
                        <i class="fas fa-edit"></i>
                      </button>
                      <button 
                        onclick="confirmDeleteProduct(${p.id}, '${escapeHtml(p.name)}')" 
                        class="p-2 text-rose-600 hover:text-rose-800 rounded-lg hover:bg-rose-50 text-sm transition ml-1" 
                        title="Xóa sản phẩm"
                      >
                        <i class="fas fa-trash-alt"></i>
                      </button>
                    </td>
                  </tr>
                `;
              }).join('') || `
                <tr>
                  <td colspan="7" class="text-center py-12 text-zinc-400 text-sm">
                    <i class="fas fa-box-open text-3xl mb-2 text-zinc-300 block"></i>
                    Không tìm thấy sản phẩm nào phù hợp
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// 3. Categories View
function renderCategoriesView() {
  const filtered = state.categories.filter(c => {
    return !state.categorySearch || 
      c.name.toLowerCase().includes(state.categorySearch.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(state.categorySearch.toLowerCase()));
  });

  return `
    <div class="space-y-6">
      <!-- Toolbar -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
        <div class="relative min-w-[240px] flex-1 max-w-md">
          <i class="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm"></i>
          <input 
            type="text" 
            placeholder="Tìm theo tên hoặc mô tả danh mục..." 
            value="${escapeHtml(state.categorySearch)}"
            oninput="handleCategorySearch(this.value)"
            class="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 transition"
          >
        </div>

        <button 
          onclick="openCategoryModal()"
          class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold shadow-sm transition"
        >
          <i class="fas fa-plus"></i> Thêm danh mục
        </button>
      </div>

      <!-- Categories Grid / Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        ${filtered.map(cat => {
          const productCount = state.products.filter(p => p.category_id === cat.id).length;
          return `
            <div class="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex flex-col justify-between hover:border-zinc-300 transition">
              <div>
                <div class="flex items-start justify-between gap-3 mb-2">
                  <div class="w-10 h-10 rounded-xl bg-zinc-100 text-zinc-800 grid place-items-center text-lg">
                    <i class="fas fa-folder"></i>
                  </div>
                  <div class="flex items-center gap-1">
                    <button onclick="editCategory(${cat.id})" class="p-1.5 text-zinc-500 hover:text-black rounded-lg hover:bg-zinc-100 text-sm" title="Chỉnh sửa">
                      <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="confirmDeleteCategory(${cat.id}, '${escapeHtml(cat.name)}', ${productCount})" class="p-1.5 text-rose-600 hover:text-rose-800 rounded-lg hover:bg-rose-50 text-sm" title="Xóa">
                      <i class="fas fa-trash-alt"></i>
                    </button>
                  </div>
                </div>
                <h4 class="font-bold text-base text-zinc-900">${escapeHtml(cat.name)}</h4>
                <p class="text-xs text-zinc-500 mt-2 line-clamp-3 leading-relaxed">
                  ${escapeHtml(cat.description || 'Chưa có mô tả cho danh mục này.')}
                </p>
              </div>

              <div class="pt-4 mt-4 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500">
                <span>Mã danh mục: <b>#${cat.id}</b></span>
                <span class="inline-flex items-center px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 font-semibold">
                  ${productCount} sản phẩm
                </span>
              </div>
            </div>
          `;
        }).join('') || `
          <div class="col-span-full bg-white p-12 text-center rounded-2xl border border-zinc-200 text-zinc-400 text-sm">
            <i class="fas fa-folder-open text-3xl mb-2 text-zinc-300 block"></i>
            Chưa có danh mục nào phù hợp
          </div>
        `}
      </div>
    </div>
  `;
}

// 4. Orders View
function renderOrdersView() {
  const statuses = ['ALL', 'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPING', 'DELIVERED', 'CANCELLED'];
  
  const filtered = state.orders.filter(o => {
    const matchesStatus = state.orderStatusFilter === 'ALL' || o.status === state.orderStatusFilter;
    const matchesSearch = !state.orderSearch ||
      String(o.id) === state.orderSearch.trim() ||
      o.customer_name.toLowerCase().includes(state.orderSearch.toLowerCase()) ||
      o.phone.toLowerCase().includes(state.orderSearch.toLowerCase()) ||
      o.email.toLowerCase().includes(state.orderSearch.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return `
    <div class="space-y-6">
      <!-- Toolbar & Status Tabs -->
      <div class="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div class="relative min-w-[280px] flex-1 max-w-md">
            <i class="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm"></i>
            <input 
              type="text" 
              placeholder="Tìm theo mã đơn (#ID), tên khách, SĐT, email..." 
              value="${escapeHtml(state.orderSearch)}"
              oninput="handleOrderSearch(this.value)"
              class="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 transition"
            >
          </div>
          <button onclick="loadAllData()" class="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 transition">
            <i class="fas fa-sync-alt"></i> Đồng bộ đơn hàng
          </button>
        </div>

        <!-- Filter pills -->
        <div class="flex flex-wrap gap-2 pt-2 border-t border-zinc-100">
          ${statuses.map(st => {
            const count = st === 'ALL' ? state.orders.length : state.orders.filter(o => o.status === st).length;
            const isActive = state.orderStatusFilter === st;
            return `
              <button 
                onclick="handleOrderStatusFilter('${st}')"
                class="px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                  isActive 
                    ? 'bg-zinc-900 text-white shadow-sm' 
                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                }"
              >
                <span>${st === 'ALL' ? 'Tất cả' : st}</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] ${isActive ? 'bg-zinc-700 text-white' : 'bg-white text-zinc-600'}">
                  ${count}
                </span>
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Orders Table -->
      <div class="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Khách hàng</th>
                <th>Địa chỉ giao hàng</th>
                <th>Tổng tiền</th>
                <th>Trạng thái</th>
                <th>Thời gian</th>
                <th class="text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(o => `
                <tr>
                  <td class="font-bold text-zinc-900">#${o.id}</td>
                  <td>
                    <div class="font-semibold text-zinc-900">${escapeHtml(o.customer_name)}</div>
                    <div class="text-xs text-zinc-500">${escapeHtml(o.phone)} • ${escapeHtml(o.email)}</div>
                  </td>
                  <td class="max-w-xs">
                    <p class="text-xs text-zinc-600 line-clamp-1">${escapeHtml(o.shipping_address)}</p>
                  </td>
                  <td class="font-bold text-zinc-900">${formatCurrency(o.total_amount)}</td>
                  <td>${getStatusBadge(o.status)}</td>
                  <td class="text-xs text-zinc-500">${formatDate(o.created_at)}</td>
                  <td class="text-right whitespace-nowrap">
                    <button 
                      onclick="openOrderDetail(${o.id})"
                      class="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold shadow-sm transition"
                    >
                      Chi tiết <i class="fas fa-chevron-right ml-1"></i>
                    </button>
                  </td>
                </tr>
              `).join('') || `
                <tr>
                  <td colspan="7" class="text-center py-12 text-zinc-400 text-sm">
                    <i class="fas fa-receipt text-3xl mb-2 text-zinc-300 block"></i>
                    Không có đơn hàng nào phù hợp với bộ lọc
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// 5. Main App Render
function renderApp() {
  const appContainer = document.getElementById('app');
  if (!appContainer) return;

  appContainer.innerHTML = `
    <div class="min-h-screen flex flex-col md:flex-row bg-[#f8f9fa]">
      <!-- Left Sidebar -->
      <aside class="w-full md:w-64 bg-white border-r border-zinc-200 shrink-0 flex flex-col">
        <!-- Brand Header -->
        <div class="p-6 border-b border-zinc-100 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-zinc-900 text-white grid place-items-center font-bold text-lg">
              <i class="fas fa-shoe-prints"></i>
            </div>
            <div>
              <h2 class="font-bold text-base tracking-tight text-zinc-900 leading-none">SHOE STORE</h2>
              <span class="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Admin Console</span>
            </div>
          </div>
        </div>

        <!-- Navigation Menu -->
        <nav class="p-4 space-y-1.5 flex-1">
          <button 
            onclick="switchTab('dashboard')"
            class="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
              state.activeTab === 'dashboard'
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'text-zinc-600 hover:bg-zinc-100 hover:text-black'
            }"
          >
            <i class="fas fa-chart-pie w-5 text-center"></i>
            <span>Dashboard</span>
          </button>

          <button 
            onclick="switchTab('products')"
            class="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
              state.activeTab === 'products'
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'text-zinc-600 hover:bg-zinc-100 hover:text-black'
            }"
          >
            <i class="fas fa-boxes-stacked w-5 text-center"></i>
            <span>Sản phẩm</span>
            <span class="ml-auto text-xs px-2 py-0.5 rounded-full ${
              state.activeTab === 'products' ? 'bg-zinc-700 text-white' : 'bg-zinc-100 text-zinc-600'
            }">${state.products.length}</span>
          </button>

          <button 
            onclick="switchTab('categories')"
            class="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
              state.activeTab === 'categories'
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'text-zinc-600 hover:bg-zinc-100 hover:text-black'
            }"
          >
            <i class="fas fa-tags w-5 text-center"></i>
            <span>Danh mục</span>
            <span class="ml-auto text-xs px-2 py-0.5 rounded-full ${
              state.activeTab === 'categories' ? 'bg-zinc-700 text-white' : 'bg-zinc-100 text-zinc-600'
            }">${state.categories.length}</span>
          </button>

          <button 
            onclick="switchTab('orders')"
            class="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
              state.activeTab === 'orders'
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'text-zinc-600 hover:bg-zinc-100 hover:text-black'
            }"
          >
            <i class="fas fa-shopping-cart w-5 text-center"></i>
            <span>Đơn hàng</span>
            <span class="ml-auto text-xs px-2 py-0.5 rounded-full ${
              state.activeTab === 'orders' ? 'bg-zinc-700 text-white' : 'bg-zinc-100 text-zinc-600'
            }">${state.orders.length}</span>
          </button>
        </nav>

        <!-- Service Status & Admin Info -->
        <div class="p-4 border-t border-zinc-100 space-y-3">
          <div class="flex items-center gap-3 p-2">
            <img 
              src="" 
              onerror="this.src='https://ui-avatars.com/api/?name=Admin+Store&background=18181b&color=fff'" 
              class="w-9 h-9 rounded-full object-cover border border-zinc-200" 
              alt="Avatar"
            >
            <div class="min-w-0 flex-1">
              <div class="font-bold text-xs text-zinc-900 truncate">Admin</div>
              <div class="text-[11px] text-zinc-400">Administrator</div>
            </div>
          </div>
        </div>
      </aside>

      <!-- Main Content Area -->
      <main class="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        ${state.activeTab === 'dashboard' ? renderDashboardView() : ''}
        ${state.activeTab === 'products' ? renderProductsView() : ''}
        ${state.activeTab === 'categories' ? renderCategoriesView() : ''}
        ${state.activeTab === 'orders' ? renderOrdersView() : ''}
      </main>
    </div>

    <!-- Modals Container -->
    <div id="modal-container">
      ${renderProductModal()}
      ${renderCategoryModal()}
      ${renderOrderDetailModal()}
      ${renderConfirmModal()}
    </div>

    <!-- Toast Container -->
    <div id="toast-container" class="fixed top-5 right-5 z-50 pointer-events-none flex flex-col items-end"></div>
  `;

  renderToasts();
}

// Tab Switching
window.switchTab = function(tab) {
  state.activeTab = tab;
  renderApp();
};

// Search & Filter Handlers
window.handleProductSearch = function(val) {
  state.productSearch = val;
  const tbody = document.querySelector('tbody');
  if (state.activeTab === 'products') renderApp();
};

window.handleProductCategoryFilter = function(val) {
  state.productCategoryFilter = val;
  if (state.activeTab === 'products') renderApp();
};

window.handleCategorySearch = function(val) {
  state.categorySearch = val;
  if (state.activeTab === 'categories') renderApp();
};

window.handleOrderSearch = function(val) {
  state.orderSearch = val;
  if (state.activeTab === 'orders') renderApp();
};

window.handleOrderStatusFilter = function(st) {
  state.orderStatusFilter = st;
  if (state.activeTab === 'orders') renderApp();
};

// --- PRODUCT MODAL ---
window.openProductModal = function() {
  state.productModal = {
    isOpen: true,
    isEditing: false,
    data: { name: '', price: '', stock: 10, category_id: state.categories[0]?.id || '', description: '', image_url: '' }
  };
  renderApp();
};

window.editProduct = function(productId) {
  const p = state.products.find(item => item.id === productId);
  if (!p) return;
  state.productModal = {
    isOpen: true,
    isEditing: true,
    data: { ...p }
  };
  renderApp();
};

window.closeProductModal = function() {
  state.productModal.isOpen = false;
  renderApp();
};

function renderProductModal() {
  const { isOpen, isEditing, data } = state.productModal;
  if (!isOpen || !data) return '';

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop">
      <div class="bg-white rounded-2xl border border-zinc-200 shadow-2xl w-full max-w-xl overflow-hidden modal-content max-h-[90vh] flex flex-col">
        <!-- Header -->
        <div class="p-5 border-b border-zinc-100 flex items-center justify-between">
          <h3 class="font-bold text-lg text-zinc-900">
            ${isEditing ? 'Chỉnh sửa sản phẩm #' + data.id : 'Thêm sản phẩm mới'}
          </h3>
          <button onclick="closeProductModal()" class="w-8 h-8 rounded-lg text-zinc-400 hover:text-black hover:bg-zinc-100 grid place-items-center">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <!-- Form Body -->
        <form id="product-form" onsubmit="handleProductSubmit(event)" class="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label class="block text-xs font-bold text-zinc-700 uppercase mb-1">Tên sản phẩm *</label>
            <input 
              type="text" 
              name="name" 
              required 
              value="${escapeHtml(data.name)}"
              placeholder="Ví dụ: Nike Air Force 1"
              class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-bold text-zinc-700 uppercase mb-1">Danh mục *</label>
              <select 
                name="category_id" 
                required 
                class="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              >
                ${state.categories.map(c => `
                  <option value="${c.id}" ${Number(data.category_id) === c.id ? 'selected' : ''}>
                    ${escapeHtml(c.name)}
                  </option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold text-zinc-700 uppercase mb-1">Giá bán ($) *</label>
              <input 
                type="number" 
                name="price" 
                step="0.01" 
                min="0" 
                required 
                value="${escapeHtml(data.price)}"
                placeholder="0.00"
                class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              >
            </div>

            <div>
              <label class="block text-xs font-bold text-zinc-700 uppercase mb-1">Tồn kho *</label>
              <input 
                type="number" 
                name="stock" 
                min="0" 
                required 
                value="${escapeHtml(data.stock)}"
                placeholder="10"
                class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              >
            </div>
          </div>

          <!-- Image Selection -->
          <div class="space-y-2">
            <label class="block text-xs font-bold text-zinc-700 uppercase">Hình ảnh sản phẩm</label>
            <div class="flex items-center gap-4 p-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50">
              <img 
                id="modal-image-preview" 
                src="${escapeHtml(resolveImageUrl(data.image_url))}" 
                onerror="this.src='${FALLBACK_IMAGE}'" 
                class="w-20 h-20 rounded-lg object-cover border border-zinc-200 bg-white shrink-0" 
                alt=""
              >
              <div class="space-y-2 flex-1">
                <div>
                  <label class="inline-block px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold cursor-pointer text-zinc-700 transition">
                    <i class="fas fa-upload mr-1"></i> Tải ảnh từ máy tính
                    <input type="file" name="image" accept="image/*" class="hidden" onchange="previewImageFile(event)">
                  </label>
                  <span id="file-name-label" class="text-xs text-zinc-500 ml-2"></span>
                </div>
                <input 
                  type="text" 
                  name="image_url" 
                  value="${escapeHtml(data.image_url || '')}" 
                  placeholder="Hoặc nhập đường dẫn URL ảnh (VD: ./storage/images/...)"
                  oninput="previewImageUrl(this.value)"
                  class="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                >
              </div>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-zinc-700 uppercase mb-1">Mô tả sản phẩm</label>
            <textarea 
              name="description" 
              rows="3" 
              placeholder="Mô tả chất liệu, thiết kế, công năng của giày..."
              class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >${escapeHtml(data.description || '')}</textarea>
          </div>

          <!-- Footer Actions -->
          <div class="pt-4 border-t border-zinc-100 flex items-center justify-end gap-3">
            <button 
              type="button" 
              onclick="closeProductModal()"
              class="px-4 py-2 text-sm font-semibold text-zinc-600 hover:text-black rounded-xl hover:bg-zinc-100 transition"
            >
              Hủy
            </button>
            <button 
              type="submit" 
              id="product-submit-btn"
              class="px-5 py-2.5 text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl shadow-sm transition inline-flex items-center gap-2"
            >
              <i class="fas fa-save"></i> ${isEditing ? 'Lưu thay đổi' : 'Tạo sản phẩm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

window.previewImageFile = function(e) {
  const file = e.target.files[0];
  if (file) {
    document.getElementById('file-name-label').textContent = file.name;
    const reader = new FileReader();
    reader.onload = (evt) => {
      document.getElementById('modal-image-preview').src = evt.target.result;
    };
    reader.readAsDataURL(file);
  }
};

window.previewImageUrl = function(val) {
  document.getElementById('modal-image-preview').src = resolveImageUrl(val);
};

window.handleProductSubmit = async function(event) {
  event.preventDefault();
  const form = event.target;
  const submitBtn = document.getElementById('product-submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';

  try {
    const formData = new FormData(form);
    const file = formData.get('image');
    const isEditing = state.productModal.isEditing;
    const productId = state.productModal.data?.id;

    // Use FormData if file is selected, else plain JSON
    let body;
    let headers = {};
    if (file && file.size > 0) {
      body = formData;
    } else {
      const payload = {
        name: formData.get('name'),
        price: parseFloat(formData.get('price')),
        stock: parseInt(formData.get('stock')),
        category_id: parseInt(formData.get('category_id')),
        description: formData.get('description'),
        image_url: formData.get('image_url') || null,
      };
      body = JSON.stringify(payload);
      headers['Content-Type'] = 'application/json';
    }

    const endpoint = isEditing ? `/products/${productId}` : '/products';
    const method = isEditing ? 'PUT' : 'POST';

    await apiRequest(endpoint, { method, headers, body });
    showToast(isEditing ? 'Cập nhật sản phẩm thành công!' : 'Tạo sản phẩm mới thành công!', 'success');
    closeProductModal();
    await loadAllData();
  } catch (error) {
    showToast(error.message || 'Lỗi khi lưu sản phẩm', 'error');
  } finally {
    submitBtn.disabled = false;
  }
};

window.confirmDeleteProduct = function(productId, productName) {
  state.confirmModal = {
    isOpen: true,
    title: 'Xóa sản phẩm',
    message: `Bạn có chắc chắn muốn xóa vĩnh viễn sản phẩm <b>"${escapeHtml(productName)}"</b> (ID #${productId}) không?`,
    onConfirm: async () => {
      try {
        await apiRequest(`/products/${productId}`, { method: 'DELETE' });
        showToast('Đã xóa sản phẩm thành công!', 'success');
        await loadAllData();
      } catch (err) {
        showToast(err.message || 'Không thể xóa sản phẩm', 'error');
      }
    }
  };
  renderApp();
};

// --- CATEGORY MODAL ---
window.openCategoryModal = function() {
  state.categoryModal = {
    isOpen: true,
    isEditing: false,
    data: { name: '', description: '' }
  };
  renderApp();
};

window.editCategory = function(catId) {
  const cat = state.categories.find(c => c.id === catId);
  if (!cat) return;
  state.categoryModal = {
    isOpen: true,
    isEditing: true,
    data: { ...cat }
  };
  renderApp();
};

window.closeCategoryModal = function() {
  state.categoryModal.isOpen = false;
  renderApp();
};

function renderCategoryModal() {
  const { isOpen, isEditing, data } = state.categoryModal;
  if (!isOpen || !data) return '';

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop">
      <div class="bg-white rounded-2xl border border-zinc-200 shadow-2xl w-full max-w-md overflow-hidden modal-content">
        <div class="p-5 border-b border-zinc-100 flex items-center justify-between">
          <h3 class="font-bold text-lg text-zinc-900">
            ${isEditing ? 'Chỉnh sửa danh mục #' + data.id : 'Thêm danh mục mới'}
          </h3>
          <button onclick="closeCategoryModal()" class="w-8 h-8 rounded-lg text-zinc-400 hover:text-black hover:bg-zinc-100 grid place-items-center">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <form onsubmit="handleCategorySubmit(event)" class="p-6 space-y-4">
          <div>
            <label class="block text-xs font-bold text-zinc-700 uppercase mb-1">Tên danh mục *</label>
            <input 
              type="text" 
              name="name" 
              required 
              value="${escapeHtml(data.name)}"
              placeholder="Ví dụ: Lifestyle, Basketball, Running..."
              class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
          </div>

          <div>
            <label class="block text-xs font-bold text-zinc-700 uppercase mb-1">Mô tả</label>
            <textarea 
              name="description" 
              rows="3" 
              placeholder="Mô tả thông tin danh mục..."
              class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >${escapeHtml(data.description || '')}</textarea>
          </div>

          <div class="pt-4 border-t border-zinc-100 flex items-center justify-end gap-3">
            <button 
              type="button" 
              onclick="closeCategoryModal()"
              class="px-4 py-2 text-sm font-semibold text-zinc-600 hover:text-black rounded-xl hover:bg-zinc-100 transition"
            >
              Hủy
            </button>
            <button 
              type="submit" 
              id="cat-submit-btn"
              class="px-5 py-2.5 text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl shadow-sm transition inline-flex items-center gap-2"
            >
              <i class="fas fa-save"></i> ${isEditing ? 'Lưu thay đổi' : 'Tạo danh mục'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

window.handleCategorySubmit = async function(event) {
  event.preventDefault();
  const form = event.target;
  const submitBtn = document.getElementById('cat-submit-btn');
  submitBtn.disabled = true;

  try {
    const isEditing = state.categoryModal.isEditing;
    const catId = state.categoryModal.data?.id;
    const payload = {
      name: form.name.value.trim(),
      description: form.description.value.trim() || null,
    };

    const endpoint = isEditing ? `/categories/${catId}` : '/categories';
    const method = isEditing ? 'PUT' : 'POST';

    await apiRequest(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    showToast(isEditing ? 'Cập nhật danh mục thành công!' : 'Tạo danh mục thành công!', 'success');
    closeCategoryModal();
    await loadAllData();
  } catch (error) {
    showToast(error.message || 'Lỗi khi lưu danh mục', 'error');
  } finally {
    submitBtn.disabled = false;
  }
};

window.confirmDeleteCategory = function(catId, catName, productCount) {
  const warning = productCount > 0 
    ? `<div class="p-3 my-2 rounded-xl bg-amber-50 text-amber-800 text-xs border border-amber-200">
         <i class="fas fa-exclamation-triangle"></i> <b>Cảnh báo:</b> Danh mục này hiện đang có <b>${productCount}</b> sản phẩm. Xóa danh mục có thể gây ảnh hưởng đến dữ liệu sản phẩm.
       </div>` 
    : '';

  state.confirmModal = {
    isOpen: true,
    title: 'Xóa danh mục',
    message: `Bạn có chắc muốn xóa danh mục <b>"${escapeHtml(catName)}"</b> (ID #${catId}) không? ${warning}`,
    onConfirm: async () => {
      try {
        await apiRequest(`/categories/${catId}`, { method: 'DELETE' });
        showToast('Đã xóa danh mục thành công!', 'success');
        await loadAllData();
      } catch (err) {
        showToast(err.message || 'Không thể xóa danh mục', 'error');
      }
    }
  };
  renderApp();
};

// --- ORDER DETAIL MODAL & STATUS UPDATE ---
window.openOrderDetail = async function(orderId) {
  try {
    const order = await apiRequest(`/orders/${orderId}`);
    state.orderDetailModal = {
      isOpen: true,
      data: order,
    };
    renderApp();
  } catch (err) {
    showToast('Không thể tải chi tiết đơn hàng #' + orderId, 'error');
  }
};

window.closeOrderDetail = function() {
  state.orderDetailModal.isOpen = false;
  renderApp();
};

function renderOrderDetailModal() {
  const { isOpen, data } = state.orderDetailModal;
  if (!isOpen || !data) return '';

  const allowedTransitions = ALLOWED_ORDER_TRANSITIONS[data.status] || [];

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop">
      <div class="bg-white rounded-2xl border border-zinc-200 shadow-2xl w-full max-w-2xl overflow-hidden modal-content max-h-[92vh] flex flex-col">
        <!-- Header -->
        <div class="p-5 border-b border-zinc-100 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <h3 class="font-bold text-lg text-zinc-900">Chi tiết đơn hàng #${data.id}</h3>
            ${getStatusBadge(data.status)}
          </div>
          <button onclick="closeOrderDetail()" class="w-8 h-8 rounded-lg text-zinc-400 hover:text-black hover:bg-zinc-100 grid place-items-center">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          <!-- Customer & Shipping info -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-zinc-50 border border-zinc-200">
            <div>
              <p class="text-xs font-semibold text-zinc-400 uppercase">Khách hàng</p>
              <h4 class="font-bold text-zinc-900 mt-1">${escapeHtml(data.customer_name)}</h4>
              <p class="text-xs text-zinc-600 mt-0.5"><i class="fas fa-phone mr-1"></i> ${escapeHtml(data.phone)}</p>
              <p class="text-xs text-zinc-600 mt-0.5"><i class="fas fa-envelope mr-1"></i> ${escapeHtml(data.email)}</p>
            </div>
            <div>
              <p class="text-xs font-semibold text-zinc-400 uppercase">Địa chỉ giao hàng</p>
              <p class="font-medium text-zinc-800 mt-1">${escapeHtml(data.shipping_address)}</p>
              <p class="text-xs text-zinc-400 mt-2">Ngày đặt: ${formatDate(data.created_at)}</p>
            </div>
          </div>

          <!-- Items Table -->
          <div>
            <h4 class="font-bold text-zinc-900 mb-2">Sản phẩm đã đặt (${(data.items || []).length})</h4>
            <div class="border border-zinc-200 rounded-xl overflow-hidden">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>Size</th>
                    <th class="text-center">Số lượng</th>
                    <th class="text-right">Đơn giá</th>
                    <th class="text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  ${(data.items || []).map(item => `
                    <tr>
                      <td class="font-medium text-zinc-900">${escapeHtml(item.product_name)}</td>
                      <td><span class="px-2 py-0.5 rounded bg-zinc-100 text-xs font-semibold">${escapeHtml(item.size)}</span></td>
                      <td class="text-center">${item.quantity}</td>
                      <td class="text-right">${formatCurrency(item.unit_price)}</td>
                      <td class="text-right font-bold">${formatCurrency(item.subtotal)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            <div class="flex justify-end pt-3">
              <div class="text-right">
                <span class="text-xs text-zinc-500 uppercase font-semibold">Tổng thanh toán:</span>
                <span class="text-xl font-bold text-zinc-900 ml-2">${formatCurrency(data.total_amount)}</span>
              </div>
            </div>
          </div>

          <!-- Status Transitions Controller -->
          <div class="p-4 rounded-xl border border-zinc-200 bg-white space-y-3">
            <h4 class="font-bold text-zinc-900">Cập nhật trạng thái đơn hàng</h4>
            ${allowedTransitions.length > 0 ? `
              <form onsubmit="handleOrderStatusUpdate(event, ${data.id})" class="flex flex-wrap items-center gap-3">
                <select name="status" class="px-3.5 py-2 text-sm rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 font-semibold">
                  ${allowedTransitions.map(st => `
                    <option value="${st}">Chuyển sang: ${st}</option>
                  `).join('')}
                </select>
                <button type="submit" id="update-status-btn" class="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold shadow-sm transition">
                  Cập nhật trạng thái
                </button>
              </form>
            ` : `
              <p class="text-xs text-zinc-500 italic">
                <i class="fas fa-lock mr-1"></i> Đơn hàng đã ở trạng thái kết thúc (<b>${data.status}</b>) và không thể chuyển trạng thái tiếp theo.
              </p>
            `}
          </div>

          <!-- Status History Timeline -->
          ${data.status_history && data.status_history.length > 0 ? `
            <div>
              <h4 class="font-bold text-zinc-900 mb-2">Lịch sử thay đổi trạng thái</h4>
              <div class="space-y-2 border-l-2 border-zinc-200 pl-4 ml-2">
                ${data.status_history.map(hist => `
                  <div class="relative text-xs">
                    <span class="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-zinc-400"></span>
                    <span class="font-bold text-zinc-800">${hist.new_status}</span>
                    ${hist.previous_status ? `<span class="text-zinc-400">(từ ${hist.previous_status})</span>` : ''}
                    <span class="text-zinc-500 ml-2">${formatDate(hist.changed_at)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

window.handleOrderStatusUpdate = async function(event, orderId) {
  event.preventDefault();
  const btn = document.getElementById('update-status-btn');
  btn.disabled = true;
  const status = event.target.status.value;

  try {
    await apiRequest(`/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    showToast(`Đã chuyển đơn hàng #${orderId} sang "${status}"`, 'success');
    // Refresh modal
    const updatedOrder = await apiRequest(`/orders/${orderId}`);
    state.orderDetailModal.data = updatedOrder;
    await loadAllData();
  } catch (error) {
    showToast(error.message || 'Không thể cập nhật trạng thái đơn hàng', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
};

// --- CONFIRM MODAL ---
window.closeConfirmModal = function() {
  state.confirmModal.isOpen = false;
  renderApp();
};

function renderConfirmModal() {
  const { isOpen, title, message, onConfirm } = state.confirmModal;
  if (!isOpen) return '';

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop">
      <div class="bg-white rounded-2xl border border-zinc-200 shadow-2xl w-full max-w-sm overflow-hidden modal-content">
        <div class="p-5 text-center space-y-3">
          <div class="w-12 h-12 rounded-full bg-rose-50 text-rose-600 grid place-items-center text-xl mx-auto">
            <i class="fas fa-trash-alt"></i>
          </div>
          <h3 class="font-bold text-base text-zinc-900">${escapeHtml(title)}</h3>
          <p class="text-xs text-zinc-600 leading-relaxed">${message}</p>
        </div>

        <div class="p-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end gap-2">
          <button 
            onclick="closeConfirmModal()" 
            class="px-4 py-2 text-xs font-semibold text-zinc-600 hover:text-black rounded-xl hover:bg-zinc-200 transition"
          >
            Hủy bỏ
          </button>
          <button 
            id="confirm-action-btn"
            class="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm transition"
          >
            Xác nhận xóa
          </button>
        </div>
      </div>
    </div>
  `;
}

// Bind Confirm Click
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'confirm-action-btn') {
    if (state.confirmModal.onConfirm) {
      state.confirmModal.onConfirm();
    }
    closeConfirmModal();
  }
});

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  renderApp();
  loadAllData();
});

// If loaded after DOMContentLoaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  renderApp();
  loadAllData();
}
