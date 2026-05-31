import { ensureSeedData, getCurrentUser, readStorage, writeStorage, getOrders, saveOrders } from './storage.js';
import { formatPrice, updateCartBadge, showToast, isAdminUser, syncAdminState } from './ui.js';
import { applyTranslations, initLangSwitcher, t, getLang } from './i18n.js';

// ====== INIT ======
ensureSeedData();
applyTranslations();
initLangSwitcher();
updateCartBadge();

const accessDenied = document.querySelector('#access-denied');
const sellerPanel = document.querySelector('#seller-panel');
const productForm = document.querySelector('#product-form');
const productList = document.querySelector('#seller-products');
const ordersList = document.querySelector('#seller-orders');
const pendingList = document.querySelector('#seller-pending');
const receiptModal = document.querySelector('#receipt-modal');
const receiptImage = document.querySelector('#receipt-image');
const receiptClose = document.querySelector('#receipt-close');

// ====== PRODUCTS ======
const renderProducts = () => {
  const products = readStorage('sellerProducts', []);
  if (!products.length) {
    productList.innerHTML = `<p class="text-sm text-slate-300">${t('empty_products')}</p>`;
    return;
  }
  productList.innerHTML = products
    .map(
      (product) => `
      <div class="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-semibold text-white">${product.title}</p>
            <p class="text-xs text-slate-300">${product.category}</p>
          </div>
          <div class="text-sm font-semibold text-white">${formatPrice(product.price)} so'm</div>
        </div>
        <div class="mt-3 flex gap-2">
          <button class="edit-btn rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-200" data-id="${
            product.id
          }">${t('edit')}</button>
          <button class="delete-btn rounded-lg border border-rose-500/40 px-3 py-1 text-xs text-rose-300" data-id="${
            product.id
          }">${t('delete')}</button>
        </div>
      </div>
    `
    )
    .join('');
};

// ====== ORDERS ======
const renderOrders = () => {
  const orders = getOrders();
  ordersList.innerHTML = orders
    .slice(0, 5)
    .map(
      (order) => `
      <div class="rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm shadow-sm">
        <p class="font-semibold text-white">${order.id}</p>
        <p class="text-xs text-slate-400">${new Date(order.date).toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'uz-UZ')}</p>
        <p class="text-xs text-slate-400">${t('order_status')}: ${t(order.status)}</p>
      </div>
    `
    )
    .join('');
};

// ====== PENDING PAYMENTS ======
const renderPendingPayments = () => {
  const orders = getOrders().filter((order) => order.status === 'pending_verification');
  if (!orders.length) {
    pendingList.innerHTML = `<p class="text-sm text-slate-300">${t('orders_empty')}</p>`;
    return;
  }
  pendingList.innerHTML = orders
    .map(
      (order) => `
      <div class="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-semibold text-white">${order.id}</p>
            <p class="text-xs text-slate-400">${t('order_status')}: ${t('pending_verification')}</p>
          </div>
          <button class="receipt-btn text-xs text-slate-200 underline" data-id="${order.id}">${t(
            'receipt_preview'
          )}</button>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <button class="confirm-btn rounded-lg bg-emerald-500/20 px-3 py-1 text-xs text-emerald-200" data-id="${
            order.id
          }">${t('confirm')}</button>
          <button class="reject-btn rounded-lg bg-rose-500/20 px-3 py-1 text-xs text-rose-200" data-id="${
            order.id
          }">${t('reject')}</button>
        </div>
      </div>
    `
    )
    .join('');
};

// ====== ACCESS ======
const init = () => {
  const currentUser = syncAdminState(getCurrentUser()) || getCurrentUser();
  if (!currentUser || !isAdminUser(currentUser)) {
    accessDenied.classList.remove('hidden');
    sellerPanel.classList.add('hidden');
    return;
  }
  accessDenied.classList.add('hidden');
  sellerPanel.classList.remove('hidden');
  renderProducts();
  renderOrders();
  renderPendingPayments();
};

// ====== STATUS ACTIONS ======
const updateOrderStatus = (orderId, status) => {
  const orders = getOrders();
  const index = orders.findIndex((order) => order.id === orderId);
  if (index === -1) return;
  orders[index].status = status;
  saveOrders(orders);
  renderOrders();
  renderPendingPayments();
};

// ====== PRODUCT CRUD ======
productForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(productForm);
  const products = readStorage('sellerProducts', []);
  const editId = productForm.dataset.editId;
  const payload = {
    id: editId ? Number(editId) : Date.now(),
    title: formData.get('title'),
    price: Number(formData.get('price')),
    oldPrice: Number(formData.get('price')) + 100000,
    img: formData.get('img'),
    desc: formData.get('desc'),
    category: formData.get('category'),
    rating: (Math.random() * 1 + 4).toFixed(1),
  };

  if (editId) {
    const index = products.findIndex((product) => product.id === Number(editId));
    products[index] = payload;
    showToast(t('saved'));
  } else {
    products.unshift(payload);
    showToast(t('saved'));
  }

  writeStorage('sellerProducts', products);
  productForm.reset();
  productForm.dataset.editId = '';
  renderProducts();
});

productList.addEventListener('click', (event) => {
  const editBtn = event.target.closest('.edit-btn');
  const deleteBtn = event.target.closest('.delete-btn');
  const products = readStorage('sellerProducts', []);
  if (editBtn) {
    const product = products.find((item) => item.id === Number(editBtn.dataset.id));
    if (!product) return;
    productForm.title.value = product.title;
    productForm.price.value = product.price;
    productForm.img.value = product.img;
    productForm.desc.value = product.desc;
    productForm.category.value = product.category;
    productForm.dataset.editId = product.id;
    showToast(t('edit'));
  }
  if (deleteBtn) {
    const updated = products.filter((item) => item.id !== Number(deleteBtn.dataset.id));
    writeStorage('sellerProducts', updated);
    renderProducts();
    showToast(t('removed'));
  }
});

// ====== RECEIPT REVIEW ======
pendingList.addEventListener('click', (event) => {
  const receiptBtn = event.target.closest('.receipt-btn');
  const confirmBtn = event.target.closest('.confirm-btn');
  const rejectBtn = event.target.closest('.reject-btn');
  if (receiptBtn) {
    const order = getOrders().find((item) => item.id === receiptBtn.dataset.id);
    if (order?.receipt?.dataUrl) {
      receiptImage.src = order.receipt.dataUrl;
      receiptModal.classList.remove('hidden');
    }
  }
  if (confirmBtn) {
    updateOrderStatus(confirmBtn.dataset.id, 'confirmed');
    showToast(t('confirmed'));
  }
  if (rejectBtn) {
    updateOrderStatus(rejectBtn.dataset.id, 'rejected');
    showToast(t('rejected'));
  }
});

receiptClose.addEventListener('click', () => receiptModal.classList.add('hidden'));
receiptModal.addEventListener('click', (event) => {
  if (event.target === receiptModal) {
    receiptModal.classList.add('hidden');
  }
});

init();

window.addEventListener('langChanged', () => {
  renderProducts();
  renderOrders();
  renderPendingPayments();
});
