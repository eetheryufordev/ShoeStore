const app = document.querySelector('#app');
const API_BASE = '/api';
const CART_KEY = 'shoe-store-cart';
const FALLBACK_IMAGE = 'https://placehold.co/800x600/e9e7e3/4b4b4b?text=Shoe+Store';

const state = { products: null, categories: null, error: null };

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;',
}[char]));
const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
const imageUrl = (value) => {
  if (!value) return FALLBACK_IMAGE;
  if (/^https?:\/\//i.test(value)) return value;
  return value.startsWith('/') ? value : `/${value}`;
};
const dateLabel = (value) => value ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '';
const route = (path) => `#${path}`;

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
}
function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
function cartCount() { return getCart().reduce((sum, item) => sum + item.quantity, 0); }
function cartTotal() { return getCart().reduce((sum, item) => sum + item.price * item.quantity, 0); }

async function request(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(`Không thể tải dữ liệu (${response.status}).`);
  return response.json();
}
async function ensureCatalog() {
  if (state.products && state.categories) return;
  try {
    const [products, categories] = await Promise.all([request('/products'), request('/categories')]);
    state.products = products;
    state.categories = categories;
  } catch (error) { state.error = error.message; }
}
function categoryName(product) {
  return state.categories?.find((category) => category.id === product.category_id)?.name || 'No Category';
}

function header() {
  return `
    <header class="border-b border-zinc-300">
      <div class="bg-[#f5f5f5] px-5 py-2">
        <div class="container flex items-center justify-between text-sm">
          <a class="font-bold" href="${route('/')}">Shoes store</a>
          <div class="flex items-center gap-4">
            <a href="${route('/register')}">Sign up</a><a href="${route('/login')}">Login</a>
          </div>
        </div>
      </div>
      <nav class="container flex min-h-24 flex-wrap items-center justify-between gap-4 py-3">
        <a class="flex h-[60px] w-28 items-center justify-center text-xl font-bold tracking-tight" href="${route('/')}">SHOE<br>STORE</a>
        <div class="order-3 flex w-full justify-center gap-5 text-sm font-bold lg:order-2 lg:w-auto lg:gap-7">
          <a href="${route('/featured')}">New &amp; Featured</a><a href="${route('/men')}">Men</a><a href="${route('/women')}">Women</a><a href="${route('/kids')}">Kids</a><a href="${route('/sale')}">Sale</a>
        </div>
        <div class="order-2 flex items-center gap-3 lg:order-3">
          <form id="header-search" class="hidden items-center rounded-full bg-[#f5f5f5] sm:flex">
            <button class="px-3" aria-label="Search"><i class="fas fa-search"></i></button>
            <input class="w-32 rounded-full bg-transparent py-2 pr-3 outline-none" name="q" placeholder="Search" />
          </form>
          <a class="relative text-xl" href="${route('/cart')}" aria-label="Shopping cart"><i class="fas fa-shopping-cart"></i><span class="absolute -right-3 -top-3 grid min-w-[1.25rem] place-items-center rounded-full bg-zinc-900 px-1 text-xs text-white">${cartCount()}</span></a>
        </div>
      </nav>
    </header>`;
}
function footer() {
  return `<footer class="mt-auto bg-[#E5E1DA] text-sm"><div class="container grid gap-8 py-8 md:grid-cols-3">
    <section><h2 class="mb-4 text-base font-semibold uppercase">Shoe Store</h2><p class="mb-4 leading-6">At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti.</p><p class="leading-6">Blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias.</p><div class="mt-4 flex gap-5 text-lg"><i class="fab fa-facebook-f"></i><i class="fab fa-dribbble"></i><i class="fab fa-twitter"></i><i class="fab fa-google-plus-g"></i></div></section>
    <section><h2 class="mb-4 text-base font-semibold uppercase">Contact Us</h2><input class="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3" placeholder="Enter your query" /><ul class="mt-5 space-y-3"><li><i class="fas fa-map-marker-alt mr-2"></i>1234 Street Name, City, Country</li><li><i class="fas fa-envelope mr-2"></i>support@yoursite.com</li><li><i class="fas fa-phone mr-2"></i>+123 456 7890</li></ul></section>
    <section><h2 class="mb-4 text-base font-semibold uppercase">Opening hours</h2><table class="footer-table w-full bg-white text-center"><tbody><tr><td>Mon - Thu:</td><td>8am - 9pm</td></tr><tr><td>Fri - Sat:</td><td>8am - 1am</td></tr><tr><td>Sunday:</td><td>9am - 10pm</td></tr></tbody></table></section>
  </div><div class="container border-t border-zinc-700 py-3 text-center">© 2024 Shoe Store - All rights reserved. <span class="ml-3 text-lg"><i class="fab fa-cc-visa"></i> <i class="fab fa-cc-mastercard"></i> <i class="fab fa-cc-paypal"></i></span></div></footer>`;
}
function breadcrumb(current) { return `<nav class="mb-3 pt-3 text-xs"><a class="text-zinc-500" href="${route('/')}">Home</a><span class="mx-2">/</span><span>${escapeHtml(current)}</span></nav>`; }
function productCard(product) {
  return `<article class="product-card overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"><a href="${route(`/products/${product.id}`)}"><img class="product-image" src="${escapeHtml(imageUrl(product.image_url))}" onerror="this.src='${FALLBACK_IMAGE}'" alt="${escapeHtml(product.name)}" /><div class="p-4"><div class="mb-2 flex justify-between gap-2 text-xs text-zinc-500"><span>${escapeHtml(categoryName(product))}</span><span>${dateLabel(product.created_at)}</span></div><h3 class="line-clamp-2 min-h-12 font-semibold">${escapeHtml(product.name)}</h3><p class="mt-2 font-bold text-zinc-600">${money(product.price)}</p></div></a></article>`;
}
function productGrid(products) { return products.length ? `<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">${products.map(productCard).join('')}</div>` : `<p class="py-12 text-center text-zinc-500">No products found.</p>`; }
function catalogError() { return `<div class="container py-14"><div class="rounded border border-red-200 bg-red-50 p-5 text-red-700">${escapeHtml(state.error || 'Không thể tải danh sách sản phẩm.')}</div></div>`; }

function filters() {
  return `<aside class="filter-panel hidden w-52 shrink-0 md:block"><details class="border-t py-3"><summary class="flex justify-between font-bold">Color <i class="fa-solid fa-chevron-down"></i></summary><div class="mt-3 space-y-2 text-sm text-zinc-600">White<br>Black<br>Grey<br>Blue<br>Purple<br>Green</div></details><details class="border-t py-3"><summary class="flex justify-between font-bold">Size <i class="fa-solid fa-chevron-down"></i></summary><div class="mt-3 space-y-2 text-sm text-zinc-600">35<br>36<br>36.5<br>37<br>38<br>39<br>40<br>41<br>42<br>43<br>44</div></details><details class="border-y py-3"><summary class="flex justify-between font-bold">Price <i class="fa-solid fa-chevron-down"></i></summary><div class="mt-3 space-y-2 text-sm text-zinc-600">Under $300<br>$300 - $1,000<br>$1,000 - $5,000<br>Over $5,000</div></details></aside>`;
}
function collectionPage(label, image) {
  if (state.error) return catalogError();
  return `<main class="container pb-12">${breadcrumb(label)}<img class="collection-banner" src="${image}" onerror="this.style.display='none'" alt="${label}" /><div class="mt-6 flex gap-6">${filters()}<section class="min-w-0 flex-1"><div class="mb-4 flex justify-end gap-2 text-sm">Sort By: <select class="border px-2 py-1"><option>Default</option><option>Price</option><option>Name</option></select><i class="fas fa-arrow-down self-center"></i></div>${productGrid(state.products || [])}</section></div></main>`;
}
function homePage() {
  if (state.error) return catalogError();
  const products = state.products || [];
  return `<main><section class="hero-home flex items-center"><div class="container"><div class="ml-auto max-w-xl text-right"><h1 class="text-4xl font-light leading-tight md:text-5xl">Discount 20% For All Orders Over $2000</h1><p class="mt-4 text-sm">Use coupon code <b>DISCOUNT20</b></p></div></div></section><section class="container mt-3 grid gap-6 md:grid-cols-3">${[['Men Shoes Collection','/images/men-shoes.png','/men'],['Women Shoes Collection','/images/women-shoes.png','/women'],['Kids Shoes Collection','/images/kids-shoes.jpg','/kids']].map(([title, image, link]) => `<article><img class="category-image" src="${image}" onerror="this.src='${FALLBACK_IMAGE}'" alt="${title}" /><div class="py-4"><h2 class="text-lg font-semibold">${title}</h2><p class="mt-3 text-sm leading-5">Constructed from luxury nylons, leathers, and custom hardware, featuring sport details such as hidden breathing vents, waterproof + antimicrobial linings, and more.</p><a class="mt-4 inline-block bg-zinc-900 px-4 py-2 text-sm text-white" href="${route(link)}">Shop Now</a></div></article>`).join('')}</section><section class="container my-14"><h2 class="mb-7 text-center text-2xl font-semibold">Featured Products</h2>${productGrid(products.slice(0, 3))}</section></main>`;
}
function featuredPage() {
  if (state.error) return catalogError();
  const products = state.products || [];
  return `<main><section class="hero-featured"><div class="container pt-12"><div class="ml-auto max-w-sm text-right"><h1 class="text-4xl font-light md:text-5xl">Summer<br>Hot Items</h1><p class="mt-4 text-sm">Use coupon code <b>DISCOUNT20</b></p></div></div></section><section class="container my-12">${productGrid(products.slice(0, 6))}</section><section class="container mb-12"><h2 class="mb-7 text-center text-2xl font-semibold">Featured</h2><div class="grid gap-6 md:grid-cols-3">${['Men Shoes Collection','Women Shoes Collection','Kids Shoes Collection'].map((name) => `<div><div class="category-image bg-zinc-200"></div><h3 class="mt-4 font-semibold">${name}</h3><p class="mt-3 text-sm">Constructed from luxury nylons, leathers, and custom hardware, featuring sport details such as hidden breathing vents, waterproof + antimicrobial linings, and more.</p></div>`).join('')}</div></section></main>`;
}
function salePage() { return collectionPage('Sale', '/images/banner/sale-banner.jpg'); }
function searchPage(query) {
  if (state.error) return catalogError();
  const found = (state.products || []).filter((product) => product.name.toLowerCase().includes(query.toLowerCase()));
  return `<main class="container min-h-[450px] pb-12"><h1 class="mt-7 text-2xl font-semibold">Search results for “${escapeHtml(query)}”</h1><div class="mt-6">${productGrid(found)}</div></main>`;
}
function detailPage(id) {
  if (state.error) return catalogError();
  const product = (state.products || []).find((item) => item.id === Number(id));
  if (!product) return `<main class="container min-h-[400px] py-12"><p>Product not found.</p></main>`;
  return `<main class="container pb-12">${breadcrumb(product.name)}<div class="grid gap-8 md:grid-cols-2 md:px-8"><img class="w-full bg-zinc-100 shadow-sm" src="${escapeHtml(imageUrl(product.image_url))}" onerror="this.src='${FALLBACK_IMAGE}'" alt="${escapeHtml(product.name)}" /><section class="md:px-6"><h1 class="text-3xl font-semibold">${escapeHtml(product.name)}</h1><p class="mt-4 text-lg"><b>Price:</b> ${money(product.price)}</p><p class="mt-3 text-sm font-bold text-zinc-500">CODE: <span>${product.id}</span></p><p class="mt-5"><b>Stock:</b> ${product.stock}</p><label class="mt-5 block w-28"><b>Quantity:</b><input id="product-quantity" class="mt-2 w-full border p-2" type="number" min="1" max="${product.stock || 1}" value="1" /></label><button data-add-cart="${product.id}" class="mt-5 w-full bg-zinc-600 py-3 font-medium text-white">Add to Cart</button><p class="mt-5 leading-6 text-zinc-600">${escapeHtml(product.description || 'No product description.')}</p></section></div></main>`;
}
function cartPage() {
  const cart = getCart();
  if (!cart.length) return `<main class="container min-h-[430px] py-8 text-center"><p class="pt-12 text-2xl">Your cart is empty</p><a class="mt-5 inline-block bg-zinc-900 px-4 py-2 text-white" href="${route('/')}">Go shop here</a></main>`;
  return `<main class="container mb-12">${breadcrumb('Cart')}<div class="grid gap-10 md:grid-cols-[2fr_1fr]"><section><table class="w-full text-sm"><thead class="border-b text-left"><tr><th class="pb-3">Product</th><th class="pb-3 text-center">Price</th><th class="pb-3 text-center">Quantity</th><th class="pb-3 text-center">Total</th></tr></thead><tbody>${cart.map((item) => `<tr class="border-b"><td class="py-4"><div class="flex gap-3"><img class="h-20 w-20 object-cover" src="${escapeHtml(imageUrl(item.image_url))}" alt="" /><div><b>${escapeHtml(item.name)}</b><button class="mt-3 block text-zinc-500" data-remove-cart="${item.id}"><i class="far fa-trash-alt"></i></button></div></div></td><td class="text-center">${money(item.price)}</td><td class="text-center"><input class="w-14 border p-1 text-center" data-quantity="${item.id}" type="number" min="1" value="${item.quantity}" /></td><td class="text-center">${money(item.price * item.quantity)}</td></tr>`).join('')}</tbody></table><p class="mt-10 font-bold">Promotion code?</p><div class="mt-2 flex gap-3"><input class="border p-2" placeholder="Enter coupon code" /><button class="bg-zinc-600 px-4 text-white">Apply</button></div></section><aside><h2 class="text-xl font-semibold">Order summary</h2><hr class="my-4"><p>Sub total: <span class="float-right">${money(cartTotal())}</span></p><p class="mt-3 font-semibold">Total: <span class="float-right">${money(cartTotal())}</span></p><a class="mt-5 block bg-zinc-600 py-3 text-center text-white" href="${route('/checkout')}">CHECKOUT</a></aside></div></main>`;
}
function checkoutPage() {
  const cart = getCart();
  if (!cart.length) return `<main class="container min-h-[400px] py-12">Your cart is empty.</main>`;
  return `<main class="container mb-12">${breadcrumb('Checkout')}<div class="grid gap-8 md:grid-cols-2"><section class="bg-zinc-50 p-5"><h1 class="text-xl font-semibold">Contact Information</h1><form id="checkout-form" class="mt-4 space-y-3"><input class="w-full border p-3" type="email" name="email" placeholder="Enter your email" required><h2 class="pt-4 text-xl font-semibold">Shipping Address</h2><div class="grid gap-3 sm:grid-cols-2"><input class="border p-3" name="customer_name" placeholder="Full Name" required><input class="border p-3" name="phone" placeholder="Telephone" required></div><input class="w-full border p-3" name="shipping_address" placeholder="Address" required><h2 class="pt-4 text-xl font-semibold">Payment Method</h2><label class="block"><input type="radio" checked> Cash on delivery</label><button class="w-full bg-zinc-600 py-3 text-white" type="submit">Place Order</button><p id="checkout-message" class="hidden rounded border p-3 text-sm"></p></form></section><aside class="bg-zinc-50 p-5"><h2 class="text-xl font-semibold">Your Order</h2>${cart.map((item) => `<div class="mt-5 flex gap-3 border-b pb-4"><img class="h-16 w-16 object-cover" src="${escapeHtml(imageUrl(item.image_url))}" alt=""><div class="flex-1"><b>${escapeHtml(item.name)}</b><p class="text-sm">Quantity: ${item.quantity}</p></div><b>${money(item.price * item.quantity)}</b></div>`).join('')}<hr class="my-5"><h3>Total <span class="float-right">${money(cartTotal())}</span></h3></aside></div></main>`;
}
function unavailablePage(title) { return `<main class="container min-h-[400px] py-12"><h1 class="text-2xl font-semibold">${title}</h1><p class="mt-3 text-zinc-600">This feature is not available in the current services.</p></main>`; }

function pageFor(path) {
  const [pathname, query = ''] = path.split('?');
  if (pathname === '/' || !pathname) return homePage();
  if (pathname === '/featured') return featuredPage();
  if (pathname === '/men') return collectionPage('Men Collection', '/images/banner/men-banner.jpg');
  if (pathname === '/women') return collectionPage('Women Collection', '/images/banner/women-banner.jpg');
  if (pathname === '/kids') return collectionPage('Kids Collection', '/images/banner/kids-banner.jpg');
  if (pathname === '/sale') return salePage();
  if (pathname === '/cart') return cartPage();
  if (pathname === '/checkout') return checkoutPage();
  if (pathname === '/login' || pathname === '/register') return unavailablePage(pathname.slice(1));
  if (pathname.startsWith('/products/')) return detailPage(pathname.split('/').pop());
  if (pathname === '/search') return searchPage(new URLSearchParams(query).get('q') || '');
  return unavailablePage('Page not found');
}

function bindEvents() {
  document.querySelector('#header-search')?.addEventListener('submit', (event) => { event.preventDefault(); const q = new FormData(event.currentTarget).get('q').trim(); if (q) location.hash = `/search?q=${encodeURIComponent(q)}`; });
  document.querySelectorAll('[data-add-cart]').forEach((button) => button.addEventListener('click', () => {
    const product = state.products.find((item) => item.id === Number(button.dataset.addCart));
    const quantity = Math.max(1, Number(document.querySelector('#product-quantity')?.value || 1));
    const cart = getCart(); const existing = cart.find((item) => item.id === product.id);
    if (existing) existing.quantity += quantity; else cart.push({ ...product, quantity });
    saveCart(cart); location.hash = '/cart';
  }));
  document.querySelectorAll('[data-remove-cart]').forEach((button) => button.addEventListener('click', () => { saveCart(getCart().filter((item) => item.id !== Number(button.dataset.removeCart))); render(); }));
  document.querySelectorAll('[data-quantity]').forEach((input) => input.addEventListener('change', () => { const cart = getCart(); const item = cart.find((entry) => entry.id === Number(input.dataset.quantity)); if (item) item.quantity = Math.max(1, Number(input.value) || 1); saveCart(cart); render(); }));
  document.querySelector('#checkout-form')?.addEventListener('submit', (event) => { event.preventDefault(); const message = document.querySelector('#checkout-message'); message.className = 'rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800'; message.textContent = 'Đặt hàng chưa khả dụng vì các service hiện tại không cung cấp variant_id (size) cần thiết cho đơn hàng.'; });
}
async function render() {
  await ensureCatalog();
  const path = location.hash.slice(1) || '/';
  app.innerHTML = `${header()}${pageFor(path)}${footer()}`;
  bindEvents();
}
window.addEventListener('hashchange', render);
render();
