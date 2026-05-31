import { db, collection, getDocs, query, orderBy, limit } from './firebase.js';
import { addToCart, ensureSeedData, getCachedProducts, getWishlist, saveWishlist, setCachedProducts } from './storage.js';
import { initAdminEditDelegation, renderCarouselSkeleton, renderProductCard, renderSkeleton, showToast, updateCartBadge } from './ui.js';
import { applyTranslations, initLangSwitcher, t } from './i18n.js';
import { initAutoCarousel } from './slider.js';

// ====== INIT ======
ensureSeedData();
applyTranslations();
initLangSwitcher();
updateCartBadge();

const productList = document.querySelector('#product-list');
const loader = document.querySelector('#loader');
const sentinel = document.querySelector('#sentinel');
const searchInput = document.querySelector('#searchInputIndex') || document.querySelector('#searchInput');
const categoryFilter = document.querySelector('#categoryFilter');
const priceSort = document.querySelector('#priceSort');
const recommendedList = document.querySelector('#recommended-list');
const errorBox = document.querySelector('#error-box');
const categoryChips = document.querySelectorAll('.category-chip');
const newDropsRow = document.querySelector('#new-drops-row');
const newDropsDots = document.querySelector('#new-drops-dots');
const promoTrack = document.querySelector('#promo-track');
const promoDots = document.querySelector('#promo-dots');

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

let allProducts = [];
let filteredProducts = [];
let currentIndex = 0;
const batchSize = 4;

// ====== PROMO SLIDER ======
const initPromoSlider = () => {
  if (!promoTrack || !promoDots) return;

  const slides = Array.from(promoTrack.querySelectorAll('.promo-slide'));
  if (!slides.length) return;

  let index = 0;
  let timer = null;
  let startX = 0;

  promoTrack.style.transition = 'transform 0.45s ease';
  promoTrack.style.transform = 'translate3d(0, 0, 0)';

  promoDots.innerHTML = slides
    .map((_, i) => `<button type="button" class="dot ${i === 0 ? 'active' : ''}"></button>`)
    .join('');

  const dots = Array.from(promoDots.querySelectorAll('.dot'));

  const setSlide = (nextIndex) => {
    index = (nextIndex + slides.length) % slides.length;
    promoTrack.style.transform = `translate3d(-${index * 100}%, 0, 0)`;

    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });
  };

  const startAuto = () => {
    clearInterval(timer);
    timer = setInterval(() => {
      setSlide(index + 1);
    }, 3500);
  };

  promoTrack.addEventListener(
    'touchstart',
    (e) => {
      clearInterval(timer);
      startX = e.touches[0].clientX;
    },
    { passive: true }
  );

  promoTrack.addEventListener(
    'touchend',
    (e) => {
      const diff = e.changedTouches[0].clientX - startX;

      if (Math.abs(diff) > 50) {
        if (diff < 0) {
          setSlide(index + 1);
        } else {
          setSlide(index - 1);
        }
      }

      startAuto();
    },
    { passive: true }
  );

  promoDots.addEventListener('click', (e) => {
    const dot = e.target.closest('.dot');
    if (!dot) return;

    const dotIndex = dots.indexOf(dot);
    if (dotIndex >= 0) {
      setSlide(dotIndex);
      startAuto();
    }
  });

  setSlide(0);
  startAuto();
};

// ====== HELPERS ======
const shuffle = (items) => [...items].sort(() => Math.random() - 0.5);

const mapDocToProduct = (docSnap) => {
  const data = docSnap.data() || {};
  const images = Array.isArray(data.images)
    ? data.images.slice(0, 10)
    : data.img
      ? [data.img]
      : [];
  return {
    docId: docSnap.id,
    id: docSnap.id,
    title: data.title || '',
    category: data.category || '',
    price: Number(data.price || 0),
    oldPrice: Number(data.oldPrice || 0) || null,
    rating: data.rating ?? null,
    desc: data.desc || '',
    images,
    img: images[0] || '',
    createdAt: data.createdAt || null,
  };
};

const fetchProductsFromFirestore = async () => {
  const cached = getCachedProducts();
  if (cached?.length) {
    return { products: cached, error: null };
  }

  try {
    let snapshot;
    try {
      snapshot = await getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc')));
      if (!snapshot.docs.length) {
        snapshot = await getDocs(collection(db, 'products'));
      }
    } catch (orderError) {
      snapshot = await getDocs(collection(db, 'products'));
    }

    const products = snapshot.docs.map(mapDocToProduct);
    setCachedProducts(products);
    return { products, error: null };
  } catch (error) {
    console.error('Failed to load Firestore products:', error);
    return {
      products: [],
      error: 'Mahsulotlarni yuklashda xatolik yuz berdi. Keyinroq qayta urinib ko‘ring.',
    };
  }
};

const fetchNewestProducts = async (count = 8) => {
  try {
    const snap = await getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(count)));
    if (!snap.docs.length) return [];
    return snap.docs.map(mapDocToProduct);
  } catch (error) {
    return [];
  }
};

const fetchPopularProducts = async (count = 48) => {
  try {
    const snap = await getDocs(query(collection(db, 'products'), orderBy('rating', 'desc'), limit(count)));
    if (!snap.docs.length) return [];
    return snap.docs.map(mapDocToProduct);
  } catch (error) {
    return [];
  }
};

const offlineBlockHTML = (title, desc) => `
  <div class="section text-center">
    <div class="text-3xl">📡</div>
    <h3 class="mt-2 text-lg font-bold">${title}</h3>
    <p class="mt-1 text-sm text-white/70">${desc}</p>
    <button onclick="location.reload()" class="mt-4 pill-btn text-sm">Qayta yuklash</button>
  </div>
`;

// ====== INFINITE SCROLL ======
const renderNextBatch = () => {
  if (!productList) return;
  const nextItems = filteredProducts.slice(currentIndex, currentIndex + batchSize);
  if (!nextItems.length) {
    loader?.classList.add('hidden');
    return;
  }
  productList.insertAdjacentHTML('beforeend', nextItems.map(renderProductCard).join(''));
  currentIndex += batchSize;
};

const resetList = () => {
  currentIndex = 0;
  productList.innerHTML = '';
  renderNextBatch();
};

// ====== FILTERS ======
const applyFilters = () => {
  const queryText = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const category = categoryFilter ? categoryFilter.value : 'all';
  const sort = priceSort ? priceSort.value : 'default';

  filteredProducts = allProducts.filter((product) => {
    const titleText = (product.title || '').toLowerCase();
    const descText = (product.desc || '').toLowerCase();
    const matchesQuery = titleText.includes(queryText) || descText.includes(queryText);
    const matchesCategory = category === 'all' || product.category === category;
    return matchesQuery && matchesCategory;
  });

  if (sort === 'asc') {
    filteredProducts.sort((a, b) => a.price - b.price);
  }

  if (sort === 'desc') {
    filteredProducts.sort((a, b) => b.price - a.price);
  }

  resetList();
};

const initFilters = () => {
  [searchInput, categoryFilter, priceSort].forEach((element) => {
    if (!element) return;
    element.addEventListener('input', applyFilters);
    element.addEventListener('change', applyFilters);
  });

  if (categoryFilter) {
    categoryFilter.addEventListener('change', () => updateQueryCategory(categoryFilter.value));
  }
};

const syncCategoryFromQuery = () => {
  const params = new URLSearchParams(window.location.search);
  const category = params.get('category');
  if (category && categoryFilter) {
    categoryFilter.value = category;
  }
};

const updateQueryCategory = (category) => {
  const params = new URLSearchParams(window.location.search);
  if (category === 'all') {
    params.delete('category');
  } else {
    params.set('category', category);
  }
  const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
  window.history.replaceState({}, '', newUrl);
};

const initCategoryChips = () => {
  if (!categoryChips.length) return;
  categoryChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const category = chip.dataset.category;
      if (categoryFilter) {
        categoryFilter.value = category;
      }
      updateQueryCategory(category);
      applyFilters();
    });
  });
};

// ====== CART ACTIONS ======
const handleAddToCart = (productId) => {
  const user = requireAuthOrRedirect();
  if (!user) return;

  const source = allProducts.find((item) => String(item.id) === String(productId)) || {};
  const selectedImage = source.images?.[0] || source.img || '';

const variantSelect = document.querySelector('#variantSelect'); // yoki select iding

const selectedVariant = variantSelect ? variantSelect.value : "";

addToCart({
  productId: String(productId),
  title: source.title || '',
  price: Number(source.price || 0),
  image: selectedImage,
  selectedImage,
  qty: 1,

  // 🔥 TO‘G‘RI
  variant: selectedVariant || "",
  variantName: selectedVariant || "",
  variantText: selectedVariant || "",
});

  updateCartBadge();
  showToast('Savatga qo‘shildi');
};

const handleWishlist = (productId) => {
  const wishlist = getWishlist();
  const index = wishlist.findIndex((item) => item.id === productId);

  if (index >= 0) {
    wishlist.splice(index, 1);
    showToast(t('wishlist_removed'));
  } else {
    wishlist.push({ id: productId });
    showToast(t('wishlist_added'));
  }

  saveWishlist(wishlist);

  document.querySelectorAll(`[data-id="${productId}"]`).forEach((button) => {
    button.textContent = index >= 0 ? '🤍' : '❤️';
  });
};

const initListActions = (container) => {
  if (!container) return;

  container.addEventListener('click', (event) => {
    const cartBtn = event.target.closest('.add-cart-btn');
    const wishlistBtn = event.target.closest('.wishlist-btn');

    if (cartBtn) {
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
      if (entry.isIntersecting) {
        renderNextBatch();
      }
    });
  });

  observer.observe(sentinel);
};

// ====== RECOMMENDED ======
const renderRecommended = () => {
  if (!recommendedList) return;
  const items = shuffle(allProducts).slice(0, 8);
  recommendedList.innerHTML = items.map(renderProductCard).join('');
  initListActions(recommendedList);
};

const renderNewDropsRow = (items) => {
  if (!newDropsRow) return;
  newDropsRow.innerHTML = items.map((item) => `<div class="slide">${renderProductCard(item)}</div>`).join('');
  initListActions(newDropsRow);
  if (newDropsDots) initAutoCarousel(newDropsRow, newDropsDots, 14);
};

// ====== DATA BOOTSTRAP ======
const init = async () => {
  if (!productList) return;

  productList.innerHTML = renderSkeleton(4);

  if (newDropsRow) {
    newDropsRow.innerHTML = renderCarouselSkeleton(4);
  }

  const [{ products, error }, newestProducts, popularProducts] = await Promise.all([
    fetchProductsFromFirestore(),
    fetchNewestProducts(8),
    fetchPopularProducts(48),
  ]);

  if (error) {
    errorBox.textContent = error;
    errorBox.classList.remove('hidden');
    productList.innerHTML = '';

    if (newDropsRow) {
      newDropsRow.innerHTML = offlineBlockHTML('Internet yo‘q', 'Yangi mahsulotlar yuklanmadi.');
    }

    return;
  }

  allProducts = popularProducts.length ? popularProducts : products;
  filteredProducts = [...allProducts];
  productList.innerHTML = '';

  syncCategoryFromQuery();
  applyFilters();
  initFilters();
  initCategoryChips();
  initListActions(productList);
  initAdminEditDelegation();
  initInfiniteScroll();
  renderRecommended();
  renderNewDropsRow(newestProducts.length ? newestProducts : shuffle(products).slice(0, 8));
  initPromoSlider();
};

init();

window.addEventListener('langChanged', () => {
  applyFilters();
  renderRecommended();
  renderNewDropsRow(shuffle(allProducts).slice(0, 8));
  initPromoSlider();
});