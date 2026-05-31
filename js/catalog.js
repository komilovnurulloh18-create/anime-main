import { fetchProducts } from './api.js';
import { addToCart, ensureSeedData, getWishlist, saveWishlist } from './storage.js';
import { initAdminEditDelegation, renderProductCard, renderSkeleton, showToast, updateCartBadge } from './ui.js';
import { applyTranslations, initLangSwitcher, t } from './i18n.js';

// ====== INIT ======
ensureSeedData();
applyTranslations();
initLangSwitcher();
updateCartBadge();

const productList = document.querySelector('#product-list');
const loader = document.querySelector('#loader');
const sentinel = document.querySelector('#sentinel');
const searchInput = document.querySelector('#searchInputCatalog');
const searchClearBtn = document.querySelector('#searchClearCatalog');
const errorBox = document.querySelector('#error-box');
const categoryChips = document.querySelectorAll('.category-chip');

function getCurrentUserStrict() {
  const keys = ['currentUser', 'CURRENT_USER', 'user', 'USER', 'authUser', 'AUTH_USER'];
  for (const k of keys) {
    const raw = localStorage.getItem(k);
    if (!raw) continue;
    try {
      const u = JSON.parse(raw);
      if (u && typeof u === 'object' && (u.id || u.uid || u.phone || u.email)) {
        if (k !== 'currentUser') {
          localStorage.setItem('currentUser', JSON.stringify(u));
        }
        return u;
      }
    } catch (_) {}
  }
  return null;
}

function getUserId(u) {
  return String(u?.id || u?.uid || u?.phone || u?.email || '');
}

function getCartKey() {
  const u = getCurrentUserStrict();
  if (!u) return null;
  return `CART_${getUserId(u)}`;
}

function readUserCart() {
  const key = getCartKey();
  if (!key) return [];
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch (_) {
    return [];
  }
}

function writeUserCart(items) {
  const key = getCartKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(items || []));
}

function requireAuthOrRedirect() {
  const u = getCurrentUserStrict();
  if (!u) {
    alert('Avval accountga kiring');
    window.location.href = 'account.html';
    return null;
  }
  return u;
}

let ALL_PRODUCTS = [];
let filteredProducts = [];
let currentIndex = 0;
let activeCategory = 'all';
const batchSize = 4;

const setActiveChip = (category) => {
  categoryChips.forEach((chip) => {
    const isActive = chip.dataset.category === category;
    chip.classList.toggle('is-active', isActive);
    chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
};

const renderNextBatch = () => {
  const nextItems = filteredProducts.slice(currentIndex, currentIndex + batchSize);
  if (!nextItems.length) {
    loader?.classList.add('hidden');
    return;
  }
  loader?.classList.remove('hidden');
  productList.insertAdjacentHTML('beforeend', nextItems.map(renderProductCard).join(''));
  currentIndex += batchSize;
};

const resetList = () => {
  currentIndex = 0;
  productList.innerHTML = '';
  renderNextBatch();
};

const applyFilters = () => {
  const queryText = (searchInput?.value || '').trim().toLowerCase();

  filteredProducts = ALL_PRODUCTS.filter((product) => {
    const titleText = String(product.title || '').toLowerCase();
    const matchesQuery = titleText.includes(queryText);
    const matchesCategory = activeCategory === 'all' || product.category === activeCategory;
    return matchesQuery && matchesCategory;
  });

  if (!filteredProducts.length) {
    errorBox.textContent = 'No products found';
    errorBox.classList.remove('hidden');
    productList.innerHTML = '';
    loader?.classList.add('hidden');
    return;
  }

  errorBox.classList.add('hidden');
  resetList();
};

const clearSearch = () => {
  searchInput.value = '';
  applyFilters();
};

const initFilters = () => {
  searchInput?.addEventListener('input', applyFilters);
  searchClearBtn?.addEventListener('click', clearSearch);
};

const initCategoryChips = () => {
  categoryChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const clicked = chip.dataset.category;
      activeCategory = clicked === activeCategory ? 'all' : clicked;
      setActiveChip(activeCategory === 'all' ? null : activeCategory);
      applyFilters();
    });
  });
};

const handleAddToCart = (productId) => {
  const user = requireAuthOrRedirect();
  if (!user) return;

  const source = ALL_PRODUCTS.find((item) => String(item.id) === String(productId)) || {};
  const selectedImage = source.images?.[0] || source.img || '';

addToCart({
  productId: product.id,
  title: product.title,
  price: selectedVariant?.price || product.price,
  image: selectedImage,
  qty: 1,
  variant: selectedVariant?.name || "", // shu qatorda chiqadi
});

  updateCartBadge();
  showToast('Savatga qo‘shildi');
};

const handleWishlist = (productId) => {
  const wishlist = getWishlist();
  const index = wishlist.findIndex((item) => String(item.id) === String(productId));

  if (index >= 0) {
    wishlist.splice(index, 1);
    showToast(t('wishlist_removed'));
  } else {
    wishlist.push({ id: String(productId) });
    showToast(t('wishlist_added'));
  }

  saveWishlist(wishlist);

  document.querySelectorAll(`[data-id="${CSS.escape(String(productId))}"]`).forEach((button) => {
    if (button.classList.contains('wishlist-btn')) {
      button.textContent = index >= 0 ? '🤍' : '❤️';
    }
  });
};

const initListActions = () => {
  productList.addEventListener('click', (event) => {
    const cartBtn = event.target.closest('.add-cart-btn');
    const wishlistBtn = event.target.closest('.wishlist-btn');

    if (cartBtn) {
      event.preventDefault();
      event.stopPropagation();
      handleAddToCart(cartBtn.dataset.id);
    }

    if (wishlistBtn) {
      event.preventDefault();
      event.stopPropagation();
      handleWishlist(wishlistBtn.dataset.id);
    }
  });
};

const initInfiniteScroll = () => {
  if (!sentinel) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) renderNextBatch();
    });
  });
  observer.observe(sentinel);
};

const dedupeProducts = (products = []) => {
  const map = new Map();
  products.forEach((product) => {
    const key = String(product.id ?? product.docId ?? '').trim();
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        ...product,
        id: key,
      });
    }
  });
  return [...map.values()];
};

const init = async () => {
  if (!productList) return;

  productList.innerHTML = renderSkeleton(4);

  const { products, error } = await fetchProducts();
  if (error) {
    errorBox.textContent = error;
    errorBox.classList.remove('hidden');
    productList.innerHTML = '';
    return;
  }

  ALL_PRODUCTS = dedupeProducts(products);
  filteredProducts = [...ALL_PRODUCTS];

  productList.innerHTML = '';
  productList.classList.add('pb-28', 'md:pb-0');

  setActiveChip(null);
  applyFilters();
  initFilters();
  initCategoryChips();
  initListActions();
  initAdminEditDelegation();
  initInfiniteScroll();
};

init();

window.addEventListener('langChanged', () => {
  applyFilters();
});