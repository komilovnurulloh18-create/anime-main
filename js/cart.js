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
const cartCountBadge = document.querySelector('#cart-count-badge');

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

// ====== SUMMARY ======
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
    <div class="summary-row">
      <span>${t('subtotal') || 'Mahsulotlar narxi'}</span>
      <span class="val">${formatPrice(subtotal)} so'm</span>
    </div>
    ${
      discountPercent > 0
        ? `<div class="summary-row discount">
             <span>${t('discount') || 'Chegirma'} (${discountPercent}%)</span>
             <span class="val">-${formatPrice(discount)} so'm</span>
           </div>`
        : ''
    }
    <div class="summary-divider"></div>
    <div class="summary-total">
      <span class="lbl">${t('total') || 'Jami'}</span>
      <span class="val">${formatPrice(total)} so'm</span>
    </div>
    <a href="checkout.html" class="checkout-btn">
      ${t('checkout') || 'Buyurtma berish'}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    </a>
  `;
};

// ====== RENDER ======
const renderCart = () => {
  const cart = getCart();

  // Update badge near heading
  const totalQty = cart.reduce((sum, item) => sum + (Number(item.qty) || 1), 0);
  if (cartCountBadge) cartCountBadge.textContent = totalQty;

  if (!cart.length) {
    emptyState?.classList.remove('hidden');
    if (cartList) cartList.innerHTML = '';
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
      const qty = Number(item.qty) || 1;
      const image =
        item.image ||
        item.selectedImageUrl ||
        item.selectedImage ||
        product?.images?.[0] ||
        product?.img ||
        item.img ||
        '';

      if (!product && item.productId == null && item.id == null) return '';

      const variant =
        item.variantName ||
        item.variant ||
        item.size ||
        item.selectedVariant ||
        item.selectedOption ||
        item.option ||
        '';

      return `
  <div class="cart-item">
    <div class="cart-item-img">
      <img src="${image}" alt="${title}" loading="lazy" onerror="this.style.opacity='0.2'" />
    </div>

    <div class="cart-item-info">
      <h3 class="cart-item-title">${title}</h3>
      ${category ? `<p class="cart-item-cat">${category}</p>` : ''}
      ${variant ? `<span class="cart-item-variant">${variant}</span>` : ''}
      <div class="cart-item-price">${formatPrice(price)} so'm</div>
    </div>

    <div class="cart-item-right">
      <div class="qty-stepper">
        <button class="qty-btn" data-qty-minus="${item.cartItemId}">−</button>
        <span class="qty-val">${qty}</span>
        <button class="qty-btn" data-qty-plus="${item.cartItemId}">+</button>
      </div>
      <button class="remove-btn" data-remove-cart="${item.cartItemId}">
        🗑️ ${t('delete') || "O'chirish"}
      </button>
    </div>
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
  showToast(t('removed') || "O'chirildi");
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
  if (code === 'ANIME10') {
    discountPercent = 10;
    showToast(t('promo_success') || "Promo kod qo'llandi!");
  } else {
    discountPercent = 0;
    showToast(t('promo_error') || "Promo kod noto'g'ri", 'error');
  }
  calculateTotals();
});

init();

window.addEventListener('langChanged', () => {
  renderCart();
});