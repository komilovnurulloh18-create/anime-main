import { db, collection, getDocs, query, orderBy } from './firebase.js';
import {
  ensureSeedData,
  getCachedProducts,
  getCart,
  removeCartItem,
  setCachedProducts,
  updateQty,
} from './storage.js';
import { formatPrice, showToast, updateCartBadge } from './ui.js';
import { applyTranslations, initLangSwitcher, t } from './i18n.js';

// ====== INIT ======
ensureSeedData();
applyTranslations();
initLangSwitcher();
updateCartBadge();

const cartList = document.querySelector('#cart-list') || document.querySelector('#cart-items');
const summaryBox = document.querySelector('#summary-box');
const emptyState = document.querySelector('#empty-state');
const promoInput = document.querySelector('#promo-code');
const promoButton = document.querySelector('#apply-promo');

let productsMap = new Map();
let discountPercent = 0;

const fetchProductsFromFirestore = async () => {
  const cached = getCachedProducts();
  if (cached?.length) return cached;
  try {
    let snapshot;
    try {
      snapshot = await getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc')));
      if (!snapshot.docs.length) snapshot = await getDocs(collection(db, 'products'));
    } catch (error) {
      snapshot = await getDocs(collection(db, 'products'));
    }

    const products = snapshot.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      const images = Array.isArray(data.images) ? data.images : data.img ? [data.img] : [];
      return {
        id: docSnap.id,
        ...data,
        images,
        img: data.img || images[0] || '',
      };
    });
    setCachedProducts(products);
    return products;
  } catch (error) {
    console.error('Failed to fetch products for cart:', error);
    return [];
  }
};

const calculateTotals = () => {
  const cart = getCart();
  const subtotal = cart.reduce((sum, item) => {
    const product = productsMap.get(String(item.productId || item.id));
    const unitPrice = Number(item.variantPrice ?? product?.price ?? item.price ?? 0);
    return sum + unitPrice * (Number(item.qty) || 1);
  }, 0);
  const discount = (subtotal * discountPercent) / 100;
  const total = subtotal - discount;

  summaryBox.innerHTML = `
    <div class="space-y-2 text-sm text-slate-300">
      <div class="flex justify-between"><span>${t('subtotal')}</span><span>${formatPrice(subtotal)} so'm</span></div>
      <div class="flex justify-between"><span>${t('discount')}</span><span>-${formatPrice(discount)} so'm</span></div>
    </div>
    <div class="mt-4 flex justify-between text-lg font-bold text-white">
      <span>${t('total')}</span><span>${formatPrice(total)} so'm</span>
    </div>
    <a href="checkout.html" class="mt-4 block rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-slate-900 hover:bg-slate-100">${t(
      'checkout'
    )}</a>
  `;
};

const renderCart = () => {
  const cart = getCart();
  if (!cart.length) {
    emptyState?.classList.remove('hidden');
    if (cartList) cartList.innerHTML = '<p class="text-sm text-slate-300">Savatingiz bo‘sh. Katalogga qayting.</p>';
    if (summaryBox) summaryBox.innerHTML = '';
    return;
  }

  emptyState?.classList.add('hidden');
  cartList.innerHTML = cart
    .map((item) => {
      const product = productsMap.get(String(item.productId || item.id));
      const title = item.title || product?.title || 'Mahsulot';
      const category = product?.category || item.category || '';
      const price = Number(item.variantPrice ?? item.price ?? product?.price ?? 0);
      const image =
        item.image ||
        item.selectedImageUrl ||
        item.selectedImage ||
        product?.images?.[0] ||
        product?.img ||
        item.img ||
        '';

      if (!product && item.productId == null && item.id == null) return '';

      return `
  <div class="flex flex-col gap-4 rounded-2xl glass p-4 shadow-sm md:flex-row md:items-center cart-item">
    <div class="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur-sm">
      <img
        src="${image}"
        alt="${title}"
        class="h-full w-full rounded-xl object-contain"
        width="112"
        height="112"
        loading="lazy"
      />
    </div>

    <div class="flex-1">
      <h3 class="text-sm font-semibold text-white">${title}</h3>
      <p class="text-xs text-slate-300">${category}</p>

      ${
        (item.variantName ||
        item.variant ||
        item.size ||
        item.selectedVariant ||
        item.selectedOption ||
        item.option)
        ? `<p class="mt-1 text-xs text-white/60">
            Variant: ${
              item.variantName ||
              item.variant ||
              item.size ||
              item.selectedVariant ||
              item.selectedOption ||
              item.option
            }
          </p>`
        : ''
      }

    </div>

    <div class="text-sm font-semibold text-white">${formatPrice(price)} so'm</div>

    <div class="flex items-center gap-2">
      <button class="qty-btn h-8 w-8 rounded-lg border border-slate-700 text-slate-200" data-qty-minus="${item.cartItemId}">-</button>
      <span class="min-w-[24px] text-center">${item.qty || 1}</span>
      <button class="qty-btn h-8 w-8 rounded-lg border border-slate-700 text-slate-200" data-qty-plus="${item.cartItemId}">+</button>
    </div>

    <button class="remove-btn text-sm text-rose-400" data-remove-cart="${item.cartItemId}">
      ${t('delete')}
    </button>
  </div>
`;
    })
    .join('');

  calculateTotals();
};

const updateQuantity = (cartItemId, action) => {
  const line = getCart().find((entry) => String(entry.cartItemId) === String(cartItemId));
  if (!line) return;
  const nextQty = action === 'inc' ? Number(line.qty || 1) + 1 : Math.max(1, Number(line.qty || 1) - 1);
  updateQty(cartItemId, nextQty);
  renderCart();
  updateCartBadge();
};

const removeItem = (cartItemId) => {
  removeCartItem(cartItemId);
  renderCart();
  updateCartBadge();
  showToast(t('removed'));
};

const init = async () => {
  const products = await fetchProductsFromFirestore();
  productsMap = new Map(products.map((product) => [String(product.id), product]));
  renderCart();
};

cartList?.addEventListener('click', (event) => {
  const minusBtn = event.target.closest('[data-qty-minus]');
  const plusBtn = event.target.closest('[data-qty-plus]');
  const removeBtn = event.target.closest('[data-remove-cart]');
  if (minusBtn) updateQuantity(minusBtn.dataset.qtyMinus, 'dec');
  if (plusBtn) updateQuantity(plusBtn.dataset.qtyPlus, 'inc');
  if (removeBtn) removeItem(removeBtn.dataset.removeCart);
});

promoButton?.addEventListener('click', () => {
  const code = promoInput.value.trim().toUpperCase();
  if (code === 'Anime10') {
    discountPercent = 10;
    showToast(t('promo_success'));
  } else {
    discountPercent = 0;
    showToast(t('promo_error'), 'error');
  }
  calculateTotals();
});

init();

window.addEventListener('langChanged', () => {
  renderCart();
});