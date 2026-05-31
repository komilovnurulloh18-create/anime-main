import { getCart, getWishlist } from './storage.js';
import { t, getLang } from './i18n.js';

const ADMIN_EMAIL = 'nurullohkomilov163@gmail.com';

const parseCurrentUser = () => {
  const raw = localStorage.getItem('currentUser');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
};

export const syncAdminState = (user = null) => {
  const currentUser = user || parseCurrentUser();
  const email = (currentUser?.email || '').trim().toLowerCase();
  const isAdmin = email === ADMIN_EMAIL;
  localStorage.setItem('isAdmin', isAdmin ? 'true' : 'false');

  if (currentUser) {
    const nextUser = {
      ...currentUser,
      isAdmin,
      role: isAdmin ? 'admin' : currentUser.role || 'user',
    };
    localStorage.setItem('currentUser', JSON.stringify(nextUser));
    return nextUser;
  }
  return null;
};

export const isAdminUser = (user = null) => {
  const currentUser = user || parseCurrentUser();
  const email = (currentUser?.email || '').trim().toLowerCase();
  if (email) {
    const isAdmin = email === ADMIN_EMAIL;
    localStorage.setItem('isAdmin', isAdmin ? 'true' : 'false');
    return isAdmin;
  }
  return localStorage.getItem('isAdmin') === 'true';
};

// ====== FORMATTERS ======
export const formatPrice = (value) => {
  const number = Number(value) || 0;
  return number.toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'uz-UZ');
};

// ====== PRODUCT CARDS ======
export const renderProductCard = (product) => {
  const image =
    product.images?.[0] ||
    product.img ||
    'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=800&q=80';

  const oldPrice = product.oldPrice && product.oldPrice > product.price ? product.oldPrice : null;
  const adminMode = isAdminUser();

  return `
    <article
      class="product-card group relative h-auto min-h-0 overflow-hidden rounded-[28px] border border-cyan-400/20 bg-[#070b2a] p-[10px] shadow-[0_10px_35px_rgba(0,0,0,0.35)] transition duration-300 hover:-translate-y-1 hover:border-cyan-300/35 hover:shadow-[0_0_0_1px_rgba(103,232,249,0.14),0_20px_50px_rgba(34,211,238,0.12)] cursor-pointer align-top"
      onclick="if(event.target.closest('.pc-actions')) return; window.location.href='detail.html?id=${product.id}'"
    >
      <div class="relative block overflow-hidden rounded-[22px]">
        <div class="absolute inset-0 rounded-[22px] bg-gradient-to-br from-cyan-400/10 via-transparent to-fuchsia-400/10 pointer-events-none z-10"></div>

        <div class="relative z-[1] flex h-[165px] w-full items-center justify-center overflow-hidden rounded-[22px] border border-cyan-400/20 bg-[#0b1028] sm:h-[185px]">
          <div class="img-skeleton absolute inset-0"></div>
          <img
            src="${image}"
            alt="${product.title}"
            loading="lazy"
            decoding="async"
            onload="this.previousElementSibling.style.display='none'"
            class="relative z-[1] block max-h-full max-w-full object-contain transition duration-300 group-hover:scale-[1.04]"
          />
        </div>
      </div>

      <div class="pc-body px-1 pb-1 pt-3">
        <p class="pc-cat mb-2 text-[13px] text-slate-300">${product.category || ''}</p>

        <h3 class="pc-title min-h-[54px] text-[15px] font-extrabold leading-[1.35] text-white">
          ${product.title}
        </h3>

        <div class="pc-priceRow mt-2 flex flex-col gap-1">
          <span class="pc-price text-[18px] font-extrabold tracking-tight text-white">${formatPrice(product.price)} so'm</span>
          ${oldPrice ? `<span class="pc-old text-[13px] text-slate-400 line-through">${formatPrice(oldPrice)} so'm</span>` : ''}
        </div>

        <div class="pc-actions mt-3 grid grid-cols-2 gap-2.5">
          <button
            class="add-cart-btn pc-btn primary rounded-[16px] bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-300 px-3 py-3 text-[15px] font-bold text-slate-950 shadow-[0_10px_24px_rgba(56,189,248,0.25)] transition hover:brightness-105"
            data-id="${product.id}"
            type="button"
          >
            ${t('add_to_cart')}
          </button>

          ${
            adminMode
              ? `<button
                   type="button"
                   class="pc-btn edit-btn rounded-[16px] border border-cyan-300/30 bg-white/5 px-3 py-3 text-[15px] font-bold text-white transition hover:bg-white/10"
                   data-edit-id="${product.id}"
                 >✏️ Edit</button>`
              : `<a
                   href="detail.html?id=${product.id}"
                   class="pc-btn rounded-[16px] border border-cyan-300/30 bg-white/5 px-3 py-3 text-center text-[15px] font-bold text-white transition hover:bg-white/10"
                 >${t('details')}</a>`
          }
        </div>
      </div>
    </article>
  `;
};

export const createProductCard = (product) => renderProductCard(product);

// ====== SKELETONS ======
export const renderSkeleton = (count = 8) =>
  Array.from({ length: count })
    .map(
      () => `
      <div class="product-card skeleton">
        <div class="product-media skeleton"></div>
        <div class="mt-3 h-4 w-3/4 rounded bg-white/10"></div>
        <div class="mt-2 h-3 w-1/2 rounded bg-white/10"></div>
        <div class="mt-3 h-8 rounded bg-white/10"></div>
      </div>
    `
    )
    .join('');

export const renderCarouselSkeleton = (count = 6) =>
  Array.from({ length: count })
    .map(
      () => `
      <div class="slide">
        <div class="product-card skeleton">
          <div class="product-media skeleton"></div>
          <div class="mt-3 h-4 w-3/4 rounded bg-white/10"></div>
          <div class="mt-2 h-3 w-1/2 rounded bg-white/10"></div>
          <div class="mt-3 h-8 rounded bg-white/10"></div>
        </div>
      </div>
    `
    )
    .join('');

// ====== TOASTS ======
export const showToast = (message, tone = 'success') => {
  const toast = document.createElement('div');
  toast.className = `fixed right-6 top-6 z-50 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg transition ${
    tone === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'
  }`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('opacity-0');
    setTimeout(() => toast.remove(), 400);
  }, 2000);
};

// ====== BADGES ======
export const updateCartBadge = () => {
  const badge = document.querySelectorAll('[data-cart-count]');
  const cart = getCart();
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  badge.forEach((node) => {
    node.textContent = count;
  });
};

// ====== THEME HELPERS ======
export const statusLabel = (status) => {
  if (status === 'pending_verification' || status === 'pending') {
    return { text: "Ko'rib chiqilyapti", cls: 'status-badge badge-pending' };
  }
  if (status === 'approved' || status === 'accepted') {
    return { text: 'Qabul qilindi', cls: 'status-badge badge-approved' };
  }
  if (status === 'rejected') {
    return { text: 'Rad etildi', cls: 'status-badge badge-rejected' };
  }
  if (status === 'processing') {
    return { text: 'Jarayonda', cls: 'status-badge badge-pending' };
  }
  return { text: status || "Noma'lum", cls: 'status-badge' };
};

export const productCardHTML = (p) => renderProductCard(p);

export const productCardSkeletonHTML = () => `
  <div class="skeleton rounded-2xl p-3 w-[165px] sm:w-[210px]">
    <div class="skeleton rounded-xl h-36 sm:h-44 w-full"></div>
    <div class="mt-3 skeleton rounded-lg h-4 w-4/5"></div>
    <div class="mt-2 skeleton rounded-lg h-3 w-2/3"></div>
    <div class="mt-3 flex justify-between gap-2">
      <div class="skeleton rounded-lg h-4 w-2/5"></div>
      <div class="skeleton rounded-xl h-9 w-1/3"></div>
    </div>
  </div>
`;

export const offlineBlockHTML = (
  title = "Internet yo‘q",
  desc = 'Ulanishni tekshirib qayta urinib ko‘ring.'
) => `
  <div class="glass rounded-2xl p-6 text-center">
    <div class="text-3xl">📡</div>
    <h3 class="mt-2 text-lg font-bold">${title}</h3>
    <p class="mt-1 text-sm text-white/70">${desc}</p>
    <button onclick="location.reload()" class="mt-4 neon-btn rounded-xl px-4 py-2 text-sm font-bold">Qayta yuklash</button>
  </div>
`;

export const ordersSkeletonListHTML = (count = 3) =>
  Array.from({ length: count })
    .map(
      () => `
    <div class="glass rounded-2xl p-4">
      <div class="flex justify-between">
        <div class="skeleton rounded-lg h-4 w-1/3"></div>
        <div class="skeleton rounded-lg h-4 w-1/4"></div>
      </div>
      <div class="mt-3 skeleton rounded-lg h-8 w-1/2"></div>
      <div class="mt-4 flex justify-between">
        <div class="skeleton rounded-lg h-4 w-1/4"></div>
        <div class="skeleton rounded-xl h-9 w-24"></div>
      </div>
    </div>
  `
    )
    .join('');

export const initAdminEditDelegation = (root = document) => {
  root.addEventListener('click', (event) => {
    const editBtn = event.target.closest('.edit-btn');
    if (!editBtn) return;
    if (!isAdminUser()) return;

    event.preventDefault();
    event.stopPropagation();

    const editId = editBtn.dataset.editId;
    if (editId) {
      window.location.href = `admin.html?editId=${editId}`;
    }
  });
};