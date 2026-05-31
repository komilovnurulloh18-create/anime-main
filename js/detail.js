import { db, collection, getDocs, query, orderBy, doc, getDoc } from './firebase.js';
import {
  addToCart as addCartLine,
  ensureSeedData,
  getWishlist,
  saveWishlist,
  getCurrentUser,
  getProductComments,
  saveProductComments,
  getCachedProducts,
  setCachedProducts,
} from './storage.js';
import { isAdminUser, renderProductCard, showToast, updateCartBadge, syncAdminState } from './ui.js';
import { applyTranslations, initLangSwitcher, t, getLang } from './i18n.js';
import { fetchProducts } from './api.js';

// ====== INIT ======
ensureSeedData();
applyTranslations();
initLangSwitcher();
updateCartBadge();

const detailWrapper = document.querySelector('#detail-wrapper');
const similarList = document.querySelector('#similar-list');
const moreList = document.querySelector('#more-list');
const errorBox = document.querySelector('#error-box');
const commentForm = document.querySelector('#comment-form');
const commentText = document.querySelector('#comment-text');
const commentRating = document.querySelector('#comment-rating');
const commentsList = document.querySelector('#comments-list');
const commentsEmpty = document.querySelector('#comments-empty');
const commentsLoginNote = document.querySelector('#comments-login-note');
const commentsToggle = document.querySelector('#comments-toggle');
const commentsModal = document.querySelector('#comments-modal');
const commentsModalList = document.querySelector('#comments-modal-list');
const variantBlock = document.querySelector('#variant-block');
const variantSelect = document.querySelector('#variantSelect');

const COMMENTS_VISIBLE_COUNT = 3;

const params = new URLSearchParams(window.location.search);
const productId = params.get('id');

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

let selectedVariant = null;
let selectedImage = '';
let selectedImageIndex = 0;
let galleryImages = [];

const syncSafeBottomSpace = () => {
  const main = document.querySelector('main');
  const actionBar = document.querySelector('#detail-action-bar');
  const bottomNav = document.querySelector('.bottom-nav, nav.bottom-nav, nav.fixed.bottom-0');

  if (!main) return;

  const isMobile = window.innerWidth < 768;
  const actionBarHeight = actionBar ? actionBar.offsetHeight : 0;
  const bottomNavHeight = isMobile && bottomNav ? bottomNav.offsetHeight : 0;

  const safeSpace = isMobile
    ? actionBarHeight + bottomNavHeight + 28
    : actionBarHeight + 24;

  main.style.paddingBottom = `${safeSpace}px`;

  if (similarList) {
    similarList.style.paddingBottom = '0px';
    similarList.style.marginBottom = '0px';
  }

  if (moreList) {
    moreList.style.paddingBottom = '0px';
    moreList.style.marginBottom = '0px';
  }
};

const formatLocalPrice = (value) =>
  `${Number(value || 0).toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'uz-UZ')} so'm`;

const getProductVariants = (product) => {
  if (!Array.isArray(product?.variants)) return [];
  return product.variants
    .map((variant) => ({
      name: String(variant?.name || '').trim(),
      price: Number(variant?.price),
    }))
    .filter((variant) => variant.name && Number.isFinite(variant.price) && variant.price > 0);
};

const getActiveUnitPrice = (product) => {
  if (selectedVariant && Number.isFinite(Number(selectedVariant.price))) {
    return Number(selectedVariant.price);
  }
  return Number(product?.price || 0);
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

    const products = snapshot.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      const images = Array.isArray(data.images)
        ? data.images.slice(0, 10)
        : data.img
          ? [data.img]
          : [];
      return {
        docId: docSnap.id,
        id: docSnap.id,
        ...data,
        images,
        img: data.img || images[0] || '',
      };
    });

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

const detailSkeletonHTML = `
  <div class="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
    <div class="min-w-0">
      <div class="detail-skeleton shimmer aspect-square w-full rounded-[22px]"></div>
      <div class="mt-3 flex gap-2 overflow-x-auto">
        <div class="detail-skeleton shimmer h-14 w-14 rounded-[14px] flex-shrink-0"></div>
        <div class="detail-skeleton shimmer h-14 w-14 rounded-[14px] flex-shrink-0"></div>
        <div class="detail-skeleton shimmer h-14 w-14 rounded-[14px] flex-shrink-0"></div>
        <div class="detail-skeleton shimmer h-14 w-14 rounded-[14px] flex-shrink-0"></div>
      </div>
    </div>
    <div class="section min-w-0 space-y-3">
      <div class="detail-skeleton shimmer h-5 w-1/3 rounded"></div>
      <div class="detail-skeleton shimmer h-8 w-4/5 rounded"></div>
      <div class="detail-skeleton shimmer h-4 w-1/2 rounded"></div>
      <div class="detail-skeleton shimmer h-20 w-full rounded"></div>
      <div class="detail-skeleton shimmer h-10 w-2/3 rounded"></div>
    </div>
  </div>
`;

// ====== GALLERY ======
const renderGallery = (images, title) => {
  const unique = images.length
    ? [...new Set(images.filter(Boolean))]
    : ['https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=800&q=80'];

  const thumbnails = unique.slice(0, 10);
  const firstImage = thumbnails[0];

  return `
    <div class="detail-gallery-wrap min-w-0 w-full">
      <div class="detail-main-media">
        <img
          id="main-image"
          src="${firstImage}"
          alt="${title}"
          loading="eager"
          decoding="async"
        />
      </div>

      <div id="thumbs" class="detail-thumbs">
        ${thumbnails
          .map(
            (image, index) => `
          <button
            class="detail-thumb ${index === 0 ? 'active' : ''}"
            type="button"
            data-gallery-thumb
            data-idx="${index}"
            data-image="${image}"
            aria-label="${title} thumbnail ${index + 1}"
          >
            <img
              src="${image}"
              alt="${title} thumbnail ${index + 1}"
              loading="lazy"
              decoding="async"
            />
          </button>
        `
          )
          .join('')}
      </div>
    </div>
  `;
};

// ====== WISHLIST ======
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

// ====== CART ACTIONS ======
const addToCart = (product) => {
  const user = requireAuthOrRedirect();
  if (!user) return;

  const selectedImageUrl =
    selectedImage || galleryImages[selectedImageIndex] || product.images?.[0] || product.img || '';

    console.log("VARIANT TEST:", selectedVariant);

  addCartLine({
    productId: String(product.id),
    id: String(product.id),
    title: product.title || '',
    price: Number(selectedVariant?.price ?? product.price ?? 0),
    image: selectedImageUrl,
    img: selectedImageUrl,
    selectedImage: selectedImageUrl,
    selectedImageUrl: selectedImageUrl,
    qty: 1,
    ...(selectedVariant
  ? {
      variant: selectedVariant.name,   // 🔥 ENG MUHIM
      variantPrice: Number(selectedVariant.price),
    }
  : {}),
  });

  updateCartBadge();
  showToast('Savatga qo‘shildi');
};

// ====== CARD ACTIONS ======
const initCardActions = (container, products = []) => {
  if (!container) return;

  container.addEventListener('click', (event) => {
    const editBtn = event.target.closest('.edit-btn');
    const cartBtn = event.target.closest('.add-cart-btn');
    const wishlistBtn = event.target.closest('.wishlist-btn');

    if (editBtn) {
      event.preventDefault();
      event.stopPropagation();
      const nextProductId = editBtn.dataset.editId;
      if (nextProductId) {
        window.location.href = `admin.html?editId=${nextProductId}`;
      }
      return;
    }

    if (cartBtn) {
      event.preventDefault();
      event.stopPropagation();

      const foundProduct =
        products.find((item) => String(item.id) === String(cartBtn.dataset.id)) || {
          id: cartBtn.dataset.id,
          productId: cartBtn.dataset.id,
          title: cartBtn.dataset.title || '',
          price: Number(cartBtn.dataset.price || 0),
          img: cartBtn.dataset.image || '',
          image: cartBtn.dataset.image || '',
          images: cartBtn.dataset.image ? [cartBtn.dataset.image] : [],
        };

      addToCart(foundProduct);
      return;
    }

    if (wishlistBtn) {
      event.preventDefault();
      event.stopPropagation();
      handleWishlist(wishlistBtn.dataset.id);
    }
  });
};

// ====== COMMENTS ======
const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const getStrictUserId = () => {
  const currentUser = getCurrentUserStrict();
  return getUserId(currentUser);
};

const getCommentsForProduct = () => {
  const comments = getProductComments();
  return comments[productId] || [];
};

const buildCommentCard = (comment, currentUserId) => {
  const isOwner = String(comment.userId || '') === String(currentUserId || '');

  return `
    <article class="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-200">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-white">${escapeHtml(comment.userName)} (${escapeHtml(comment.userPhone || 'Telefon: N/A')})</p>
          <span class="mt-1 block text-xs text-slate-400">${new Date(comment.createdAt).toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'uz-UZ')}</span>
        </div>

        ${
          isOwner
            ? `
          <button
            type="button"
            class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
            data-comment-delete="${comment.id}"
          >
            O‘chirish
          </button>
        `
            : ''
        }
      </div>

      ${comment.rating ? `<p class="mt-2 text-xs text-amber-400">Reyting: ${comment.rating}/5</p>` : ''}

      <p class="mt-2 whitespace-pre-line break-words text-slate-300">${escapeHtml(comment.text)}</p>

      ${
        comment.replies?.length
          ? `
        <div class="mt-3 space-y-2 border-t border-slate-800 pt-3">
          ${comment.replies
            .map(
              (reply) => `
            <div class="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200">
              <p class="font-semibold text-white">${escapeHtml(reply.adminName)}</p>
              <p class="mt-1 whitespace-pre-line break-words text-slate-300">${escapeHtml(reply.text)}</p>
              <span class="mt-2 block text-[10px] text-slate-400">${new Date(reply.createdAt).toLocaleString(
                getLang() === 'ru' ? 'ru-RU' : 'uz-UZ'
              )}</span>
            </div>
          `
            )
            .join('')}
        </div>
      `
          : ''
      }
    </article>
  `;
};

const renderComments = () => {
  const currentUserId = getStrictUserId();

  const comments = getCommentsForProduct().sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  if (!comments.length) {
    commentsEmpty.classList.remove('hidden');
    commentsList.innerHTML = '';
    if (commentsModalList) commentsModalList.innerHTML = '';
    commentsToggle?.classList.add('hidden');
    return;
  }

  commentsEmpty.classList.add('hidden');

  const previewComments = comments.slice(0, COMMENTS_VISIBLE_COUNT);

  commentsList.innerHTML = previewComments
    .map((comment) => buildCommentCard(comment, currentUserId))
    .join('');

  if (commentsModalList) {
    commentsModalList.innerHTML = comments
      .map((comment) => buildCommentCard(comment, currentUserId))
      .join('');
  }

  if (commentsToggle) {
    if (comments.length > COMMENTS_VISIBLE_COUNT) {
      commentsToggle.classList.remove('hidden');
      commentsToggle.textContent = `Barcha izohlarni ko‘rish (${comments.length})`;
    } else {
      commentsToggle.classList.add('hidden');
    }
  }
};

const openCommentsModal = () => {
  if (!commentsModal) return;
  commentsModal.classList.remove('hidden');
  commentsModal.setAttribute('aria-hidden', 'false');
  document.body.dataset.commentsPrevOverflow = document.body.style.overflow || '';
  document.body.style.overflow = 'hidden';
};

const closeCommentsModal = () => {
  if (!commentsModal) return;
  commentsModal.classList.add('hidden');
  commentsModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = document.body.dataset.commentsPrevOverflow || '';
  delete document.body.dataset.commentsPrevOverflow;
};

// ====== DATA BOOTSTRAP ======
const init = async () => {
  detailWrapper.innerHTML = detailSkeletonHTML;

  if (!productId) {
    errorBox.textContent = t('not_found');
    errorBox.classList.remove('hidden');
    detailWrapper.innerHTML = `<div class="section text-center"><p>${t('not_found')}</p></div>`;
    return;
  }

  let product = null;

  try {
    const snap = await getDoc(doc(db, 'products', productId));
    if (snap.exists()) {
      const data = snap.data() || {};
      const imgs = Array.isArray(data.images)
        ? data.images.slice(0, 10)
        : data.img
          ? [data.img]
          : [];

      product = {
        id: snap.id,
        docId: snap.id,
        ...data,
        images: imgs,
        img: data.img || imgs[0] || '',
      };
    }
  } catch (error) {
    console.error('Failed to load detail product:', error);
  }

  const { products: firestoreProducts } = await fetchProductsFromFirestore();

  if (!product) {
    const firestoreMatch = firestoreProducts.find(
      (item) => String(item.id) === String(productId) || String(item.docId || '') === String(productId)
    );
    if (firestoreMatch) {
      product = firestoreMatch;
    }
  }

  if (!product) {
    const { products: jsonProducts = [] } = await fetchProducts();
    const jsonMatch = jsonProducts.find((item) => String(item.id) === String(productId));
    if (jsonMatch) {
      product = {
        ...jsonMatch,
        id: String(jsonMatch.id),
        images: Array.isArray(jsonMatch.images) ? jsonMatch.images : jsonMatch.img ? [jsonMatch.img] : [],
      };
    }
  }

  if (!product) {
    errorBox.textContent = t('not_found');
    errorBox.classList.remove('hidden');
    detailWrapper.innerHTML = `<div class="section text-center"><h3 class="text-lg font-semibold">${t('not_found')}</h3><p class="mt-2 text-sm text-white/70">Mahsulot topilmadi yoki o‘chirib yuborilgan.</p></div>`;
    return;
  }

  const products = firestoreProducts;
  const images = product.images?.length ? product.images.slice(0, 10) : [product.img].filter(Boolean);
  galleryImages = images;
  selectedImage = images[0] || product.img || '';
  selectedImageIndex = 0;

  const oldPrice = Number(product.oldPrice);
  const hasOldPrice = Number.isFinite(oldPrice) && oldPrice > Number(product.price);
  const discount = Number(product.discount ?? product.discountPercent);
  const hasDiscount = Number.isFinite(discount) && discount > 0;
  const description = product.desc || product.description || '';
  const descriptionMarkup = description
    ? `<p id="dDesc" class="text-white/70">${description}</p>`
    : `<p id="dDesc" class="hidden"></p>`;

  const currentUser = syncAdminState(getCurrentUser()) || getCurrentUser();
  const isAdmin = isAdminUser(currentUser);
  const adminEditMarkup = isAdmin
    ? `<button id="detail-edit" class="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80">✏️ Edit</button>`
    : '';

  detailWrapper.innerHTML = `
    <div class="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
      ${renderGallery(images, product.title)}

      <div class="section min-w-0 flex flex-col gap-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm text-white/70">${product.category || ''}</p>
            <h1 class="font-bold text-white">${product.title || ''}</h1>
          </div>
          ${adminEditMarkup}
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span><span style="color:#facc15;">★</span> ${product.rating ?? 4.8}</span>
          <span class="text-white/60">(stock: ${product.stock ?? '—'})</span>
        </div>

        ${descriptionMarkup}

        <div class="price-row flex items-center gap-3">
          <span id="detail-main-price" class="product-price font-bold text-white">${formatLocalPrice(product.price || 0)}</span>
          ${
            hasOldPrice
              ? `<span class="text-sm text-slate-400 line-through">${oldPrice.toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'uz-UZ')} so'm</span>`
              : ''
          }
          ${
            hasDiscount
              ? `<span class="rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-200">-${discount}%</span>`
              : ''
          }
        </div>

        <div class="rounded-2xl bg-white/5 p-4 text-sm text-white/70">
          <p>${t('delivery_note')}</p>
          <p>${t('warranty_note')}</p>
        </div>
      </div>
    </div>
  `;

  setTimeout(syncSafeBottomSpace, 0);

  const isSaved = getWishlist().some((item) => item.id === product.id);
  const wishlistBtn = document.querySelector('[data-wishlist-toggle]');
  if (wishlistBtn) {
    wishlistBtn.textContent = isSaved ? `❤️ ${t('wishlist')}` : `🤍 ${t('wishlist')}`;
  }

const actionPrice = document.querySelector('#detail-action-price');
const actionCart = document.querySelector('#detail-action-cart');
const actionBuy = document.querySelector('#detail-action-buy');
const mainPrice = document.querySelector('#detail-main-price');

const variants = getProductVariants(product);

// ✅ DEFAULT VARIANT
selectedVariant = variants.length ? variants[0] : null;

// ✅ PRICE UPDATE
const syncDisplayedPrice = () => {
  const unitPrice = getActiveUnitPrice(product);
  if (mainPrice) mainPrice.textContent = formatLocalPrice(unitPrice);
  if (actionPrice) actionPrice.textContent = formatLocalPrice(unitPrice);
};

// ✅ VARIANT SELECT
if (variantBlock && variantSelect) {
  if (variants.length) {
    variantBlock.classList.remove('hidden');

    variantSelect.innerHTML = variants
      .map((variant, index) => `
        <option value="${index}">
          ${variant.name} — ${formatLocalPrice(variant.price)}
        </option>
      `)
      .join('');

    variantSelect.value = '0';

    // 🔥 ENG MUHIM JOY
    variantSelect.addEventListener('change', () => {
      const index = Number(variantSelect.value) || 0;
      selectedVariant = variants[index] || null;

      console.log("SELECTED VARIANT:", selectedVariant); // test
      syncDisplayedPrice();
    });

  } else {
    variantBlock.classList.add('hidden');
    variantSelect.innerHTML = '';
  }
}

// ✅ INITIAL PRICE
syncDisplayedPrice();

  if (actionCart) {
    actionCart.setAttribute('type', 'button');
    actionCart.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      addToCart(product);
    });
  }

  if (actionBuy) {
    actionBuy.setAttribute('type', 'button');
    actionBuy.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      addToCart(product);
    });
  }

  if (wishlistBtn) {
    wishlistBtn.addEventListener('click', () => handleWishlist(product.id));
  }

  const similar = products.filter((item) => item.category === product.category && String(item.id) !== String(product.id));
  similarList.innerHTML = similar.slice(0, 8).map(renderProductCard).join('');
  moreList.innerHTML = products
    .filter((item) => String(item.id) !== String(product.id))
    .sort(() => Math.random() - 0.5)
    .slice(0, 8)
    .map(renderProductCard)
    .join('');

  initCardActions(similarList, similar);
  initCardActions(
    moreList,
    products.filter((item) => String(item.id) !== String(product.id))
  );

  renderComments();

  if (!currentUser) {
    commentForm.classList.add('hidden');
    commentsLoginNote.classList.remove('hidden');
  } else {
    commentForm.classList.remove('hidden');
    commentsLoginNote.classList.add('hidden');
  }

  const detailEdit = document.querySelector('#detail-edit');
  if (detailEdit) {
    detailEdit.addEventListener('click', () => {
      window.location.href = `admin.html?editId=${product.id}`;
    });
  }

  setTimeout(syncSafeBottomSpace, 50);
};

init();

window.addEventListener('resize', syncSafeBottomSpace);
window.addEventListener('orientationchange', syncSafeBottomSpace);

window.addEventListener('langChanged', () => {
  init();
  setTimeout(syncSafeBottomSpace, 50);
});

commentForm?.addEventListener('submit', (event) => {
  event.preventDefault();

  const currentUser = getCurrentUser();
  if (!currentUser) {
    commentsLoginNote.classList.remove('hidden');
    return;
  }

  const text = commentText.value.trim();
  if (!text) return;

  const rating = commentRating.value ? Number(commentRating.value) : null;
  const comments = getProductComments();

  const newComment = {
    id: `c-${Date.now()}`,
    productId,
    userId: currentUser.id,
    userName: currentUser.name,
    userPhone: currentUser.phone,
    text,
    rating,
    createdAt: new Date().toISOString(),
    replies: [],
  };

  const list = comments[productId] || [];
  comments[productId] = [newComment, ...list];
  saveProductComments(comments);
  commentText.value = '';
  commentRating.value = '';
  renderComments();
});

commentsToggle?.addEventListener('click', () => {
  openCommentsModal();
});

commentsList?.addEventListener('click', handleCommentDelete);
commentsModalList?.addEventListener('click', handleCommentDelete);

function handleCommentDelete(event) {
  const deleteBtn = event.target.closest('[data-comment-delete]');
  if (!deleteBtn) return;

  const commentId = deleteBtn.dataset.commentDelete;
  const currentUserId = getStrictUserId();
  if (!currentUserId) return;

  const comments = getProductComments();
  const list = comments[productId] || [];
  const targetComment = list.find((item) => String(item.id) === String(commentId));

  if (!targetComment) return;
  if (String(targetComment.userId || '') !== String(currentUserId)) return;

  comments[productId] = list.filter((item) => String(item.id) !== String(commentId));
  saveProductComments(comments);

  renderComments();
  showToast('Izoh o‘chirildi');
}

commentsModal?.addEventListener('click', (event) => {
  const closeTarget = event.target.closest('[data-comments-close]');
  if (closeTarget) {
    closeCommentsModal();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && commentsModal && !commentsModal.classList.contains('hidden')) {
    closeCommentsModal();
  }
});

(() => {
  const viewer = document.querySelector('#img-viewer');
  const viewerImg = document.querySelector('#img-viewer-img');
  const btnPrev = document.querySelector('.img-viewer__nav--prev');
  const btnNext = document.querySelector('.img-viewer__nav--next');
  if (!viewer || !viewerImg || !btnPrev || !btnNext) return;

  const getMainImg = () =>
    document.querySelector('#main-image') ||
    document.querySelector('#main-img') ||
    document.querySelector('.detail-main-media img') ||
    document.querySelector('#detail-wrapper img');

  const getThumbButtons = () =>
    Array.from(document.querySelectorAll('#thumbs [data-idx], [data-gallery-thumb][data-idx]'));

  const getThumbSource = (thumbBtn) => {
    const img = thumbBtn?.querySelector('img');
    return String(
      thumbBtn?.dataset?.image ||
      thumbBtn?.dataset?.img ||
      thumbBtn?.dataset?.src ||
      thumbBtn?.getAttribute('data-image') ||
      thumbBtn?.getAttribute('data-img') ||
      thumbBtn?.getAttribute('data-src') ||
      img?.dataset?.img ||
      img?.dataset?.src ||
      img?.getAttribute('src') ||
      ''
    ).trim();
  };

  let images = [];
  let restoreScrollY = 0;
  let lastFocused = null;

  const rebuildImages = () => {
    const thumbUrls = getThumbButtons().map(getThumbSource).filter(Boolean);
    const mainSrc = String(getMainImg()?.getAttribute('src') || '').trim();
    images = [...new Set(thumbUrls.length ? thumbUrls : mainSrc ? [mainSrc] : [])];
    if (!images.length && galleryImages.length) images = [...galleryImages];
  };

  const setActiveImage = (index) => {
    if (!images.length) return;

    selectedImageIndex = ((index % images.length) + images.length) % images.length;
    selectedImage = images[selectedImageIndex];

    const main = getMainImg();
    if (main) {
      main.src = selectedImage;
      main.style.cursor = 'zoom-in';
    }

    getThumbButtons().forEach((btn) => {
      const isActive = Number(btn.dataset.idx) === selectedImageIndex;
      btn.classList.toggle('active', isActive);
    });
  };

  function openViewer(index) {
    rebuildImages();
    if (!images.length) return;

    setActiveImage(index);
    viewerImg.src = images[selectedImageIndex];

    const wasHidden = viewer.classList.contains('hidden');
    viewer.classList.remove('hidden');
    viewer.removeAttribute('aria-hidden');

    if (wasHidden) {
      lastFocused = document.activeElement;
      restoreScrollY = window.scrollY || window.pageYOffset || 0;
      document.body.dataset.prevOverflow = document.body.style.overflow || '';
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${restoreScrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      btnNext.focus({ preventScroll: true });
    }
  }

  function closeViewer() {
    if (document.activeElement) {
      document.activeElement.blur();
    }

    viewer.classList.add('hidden');
    viewer.setAttribute('aria-hidden', 'true');
    viewerImg.src = '';

    const y = Math.abs(parseInt(document.body.style.top || '0', 10)) || restoreScrollY || 0;
    document.body.style.overflow = document.body.dataset.prevOverflow || '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    delete document.body.dataset.prevOverflow;
    window.scrollTo(0, y);

    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus({ preventScroll: true });
    }
  }

  const showPrev = () => openViewer(selectedImageIndex - 1);
  const showNext = () => openViewer(selectedImageIndex + 1);

  viewer.addEventListener('click', (e) => {
    if (e.target === viewer || e.target.dataset.close) {
      closeViewer();
    }
  });

  viewerImg.addEventListener('click', (e) => e.stopPropagation());

  btnPrev.addEventListener('click', (e) => {
    e.stopPropagation();
    showPrev();
  });

  btnNext.addEventListener('click', (e) => {
    e.stopPropagation();
    showNext();
  });

  document.addEventListener('keydown', (e) => {
    if (viewer.classList.contains('hidden')) return;
    if (e.key === 'Escape') closeViewer();
    if (e.key === 'ArrowLeft') showPrev();
    if (e.key === 'ArrowRight') showNext();
  });

  let startX = 0;
  let startY = 0;

  viewer.addEventListener(
    'touchstart',
    (e) => {
      if (viewer.classList.contains('hidden')) return;
      const touch = e.touches?.[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
    },
    { passive: true }
  );

  viewer.addEventListener(
    'touchend',
    (e) => {
      if (viewer.classList.contains('hidden')) return;
      const touch = e.changedTouches?.[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dy) > Math.abs(dx)) return;
      if (dx < -40) showNext();
      if (dx > 40) showPrev();
    },
    { passive: true }
  );

  const attachHandlers = () => {
    rebuildImages();
    if (!images.length) return;

    const main = getMainImg();
    if (main && main.dataset.viewerBound !== '1') {
      main.dataset.viewerBound = '1';
      main.style.cursor = 'zoom-in';
      main.addEventListener('click', () => openViewer(selectedImageIndex));
    }

    getThumbButtons().forEach((btn, idx) => {
      if (btn.dataset.thumbBound === '1') return;
      btn.dataset.thumbBound = '1';
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        rebuildImages();
        const dataIdx = Number(btn.dataset.idx);
        const src = getThumbSource(btn);
        const srcIdx = images.indexOf(src);
        const nextIndex = Number.isFinite(dataIdx) ? dataIdx : srcIdx >= 0 ? srcIdx : idx;
        setActiveImage(nextIndex);
      });
    });

    setActiveImage(selectedImageIndex || 0);
  };

  attachHandlers();
  window.addEventListener('langChanged', () => setTimeout(attachHandlers, 0));

  const root = document.querySelector('#detail-wrapper');
  if (root) {
    const observer = new MutationObserver(() => {
      attachHandlers();
      setTimeout(syncSafeBottomSpace, 0);
    });
    observer.observe(root, { childList: true, subtree: true });
  }
})();