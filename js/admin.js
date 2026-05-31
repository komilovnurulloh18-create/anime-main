import {
  ensureSeedData,
  getProductComments,
  saveProductComments,
} from "./storage.js";

import { showToast, statusLabel } from "./ui.js";
import { IMGBB_API_KEY } from "./config.js";
import { imgbbUpload } from "./imgbb.js";

import {
  db,
  auth,
  onAuthStateChanged,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  getDoc,
  serverTimestamp,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "./firebase.js";

import {
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

// ====== INIT ======
ensureSeedData();

// ====== DOM ======
const accessDenied = document.querySelector("#access-denied");
const adminPanel = document.querySelector("#admin-panel");

const loginBox = document.querySelector("#admin-login-box");
const loginBtn = document.querySelector("#admin-login-btn");
const loginEmail = document.querySelector("#admin-email");
const loginPassword = document.querySelector("#admin-password");
const loginError = document.querySelector("#admin-login-error");

const logoutDesktopBtn = document.querySelector("#admin-logout-desktop");
const logoutMobileBtn = document.querySelector("#admin-logout-mobile");

const adminEmailView = document.querySelector("#admin-email-view");
const adminNameView = document.querySelector("#admin-name-view");

const pendingOrdersList = document.querySelector("#pending-orders");
const pendingEmpty = document.querySelector("#pending-empty");

const receiptModal = document.querySelector("#receipt-modal");
const receiptImage = document.querySelector("#receipt-image");
const receiptClose = document.querySelector("#receipt-close");

const productForm = document.querySelector("#admin-product-form");
const productTitle = document.querySelector("#product-title");
const productCategory = document.querySelector("#product-category");
const productPrice = document.querySelector("#product-price");
const productStock = document.querySelector("#product-stock");
const productOldPrice = document.querySelector("#product-old-price");
const productDiscount = document.querySelector("#product-discount");
const productDescription = document.querySelector("#pDesc");
const productRating = document.querySelector("#product-rating");
const productVariantName = document.querySelector("#variant-name");
const productVariantPrice = document.querySelector("#variant-price");
const addVariantBtn = document.querySelector("#add-variant-btn");
const variantList = document.querySelector("#variant-list");
const productImages = document.querySelector("#pImages");
const imageLimitError = document.querySelector("#image-limit-error");
const imagePreview = document.querySelector("#image-preview");
const adminProductsEmpty = document.querySelector("#admin-products-empty");
const adminProductsList = document.querySelector("#adminProducts");
const saveButton = document.querySelector("#btnSave");

const commentsEmpty = document.querySelector("#comments-empty");
const adminComments = document.querySelector("#admin-comments");

// ====== PAYMENTS (OPTIONAL DOM) ======
const payOwner = document.querySelector("#pay-owner");
const payCard = document.querySelector("#pay-card");
const payBank = document.querySelector("#pay-bank");
const paySaveBtn = document.querySelector("#pay-save");
const payStatus = document.querySelector("#pay-status");

// ====== ADMIN CHECK ======
const readLocalUser = () => {
  const raw = localStorage.getItem("currentUser");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

let currentUser = readLocalUser();
let isAdmin = false;
let hasInitialized = false;

const showLogin = () => {
  loginBox?.classList.remove("hidden");
  if (loginBox) loginBox.style.display = "block";

  accessDenied?.classList.add("hidden");
  if (accessDenied) accessDenied.style.display = "none";

  adminPanel?.classList.add("hidden");
  if (adminPanel) adminPanel.style.display = "none";

  logoutDesktopBtn?.classList.add("hidden");
  logoutMobileBtn?.classList.add("hidden");

  if (logoutDesktopBtn) logoutDesktopBtn.style.display = "none";
  if (logoutMobileBtn) logoutMobileBtn.style.display = "none";
};

const showDenied = () => {
  loginBox?.classList.add("hidden");
  if (loginBox) loginBox.style.display = "none";

  accessDenied?.classList.remove("hidden");
  if (accessDenied) accessDenied.style.display = "block";

  adminPanel?.classList.add("hidden");
  if (adminPanel) adminPanel.style.display = "none";

  logoutDesktopBtn?.classList.add("hidden");
  logoutMobileBtn?.classList.add("hidden");

  if (logoutDesktopBtn) logoutDesktopBtn.style.display = "none";
  if (logoutMobileBtn) logoutMobileBtn.style.display = "none";
};

const showAllowed = () => {
  loginBox?.classList.add("hidden");
  if (loginBox) loginBox.style.display = "none";

  accessDenied?.classList.add("hidden");
  if (accessDenied) accessDenied.style.display = "none";

  adminPanel?.classList.remove("hidden");
  if (adminPanel) adminPanel.style.display = "block";

  logoutDesktopBtn?.classList.remove("hidden");
  logoutMobileBtn?.classList.remove("hidden");

  if (logoutDesktopBtn) logoutDesktopBtn.style.display = "inline-flex";
  if (logoutMobileBtn) logoutMobileBtn.style.display = "inline-flex";
};

const checkAdminRole = async (user) => {
  if (!user?.uid) return false;

  try {
    const adminRef = doc(db, "admins", user.uid);
    const adminSnap = await getDoc(adminRef);
    console.log("LOGIN USER:", user.email, user.uid);
    console.log("ADMIN EXISTS:", adminSnap.exists());
    return adminSnap.exists();
  } catch (e) {
    console.error("Admin tekshiruvda xatolik:", e);
    return false;
  }
};

const setAdminProfile = (user) => {
  if (adminEmailView) adminEmailView.textContent = user?.email || "—";
  if (adminNameView) adminNameView.textContent = user?.displayName || currentUser?.name || "Admin";
};

// ====== HELPERS ======
const formatDate = (value) => {
  const v = value?.toDate ? value.toDate() : value;
  if (!v) return "—";
  return new Date(v).toLocaleString("uz-UZ");
};

const safe = (v, fallback = "—") => {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s ? s : fallback;
};

const sortByCreatedAtDesc = (a, b) => {
  const ta = a?.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a?.createdAt || 0).getTime();
  const tb = b?.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b?.createdAt || 0).getTime();
  return tb - ta;
};

const getItemsCount = (items = []) =>
  Array.isArray(items) ? items.reduce((sum, item) => sum + Number(item.qty || 0), 0) : 0;

const buildReceiptUrl = (order) => {
  return order?.receiptUrl || order?.receiptBase64 || order?.receipt?.url || "";
};

const buildBuyerName = (order) => order?.userName || order?.user?.name || "Noma'lum";
const buildBuyerPhone = (order) => order?.userPhone || order?.user?.phone || "Telefon: N/A";

const buildAddress = (order) => {
  const addr = order?.address || {};
  const region = addr.region || order?.region || "";
  const district = addr.district || order?.district || "";
  const home = addr.homeAddress || order?.address || "";
  const text = [region, district, home].filter(Boolean).join(", ");
  return text || "—";
};

const buildDelivery = (order) => {
  const d = order?.delivery || {};
  return d?.label || order?.deliveryType || "—";
};

const buildTotal = (order) => {
  const n = Number(order?.total ?? order?.subtotal ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const buildOrderLink = (orderId) => {
  const origin = window.location.origin;
  return `${origin}/searc.html?id=${encodeURIComponent(orderId)}`;
};

// ====== TELEGRAM (SERVER API via /api/telegram) ======
async function sendTelegram(text) {
  try {
    const res = await fetch("/api/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Telegramga yuborilmadi");
    console.log("Telegramga yuborildi", data.result);
  } catch (err) {
    console.error(err);
  }
}

// ====== STATE ======
let selectedFiles = [];
let selectedPreviews = [];
let adminProducts = [];
let editingId = null;
let productVariants = [];
let productsMap = new Map();

// ====== LOGIN ======
loginBtn?.addEventListener("click", async () => {
  const email = loginEmail?.value.trim();
  const password = loginPassword?.value.trim();

  if (!email || !password) {
    if (loginError) loginError.textContent = "Email va parolni kiriting.";
    return;
  }

  if (loginError) loginError.textContent = "";
  loginBtn.disabled = true;

  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error(err);
    if (loginError) loginError.textContent = "Email yoki parol noto‘g‘ri.";
  } finally {
    loginBtn.disabled = false;
  }
});

const logoutAdmin = async () => {
  try {
    await signOut(auth);
    isAdmin = false;
    hasInitialized = false;
    if (loginError) loginError.textContent = "";
    showLogin();
    showToast("Admin tizimdan chiqdi");
  } catch (e) {
    console.error(e);
    showToast("Logoutda xatolik", "error");
  }
};

logoutDesktopBtn?.addEventListener("click", logoutAdmin);
logoutMobileBtn?.addEventListener("click", logoutAdmin);

// ====== ORDERS (FIRESTORE) ======
const fetchPendingOrders = async () => {
  if (!isAdmin) return [];

  const q = query(
    collection(db, "orders"),
    where("status", "in", ["pending", "pending_verification"])
  );

  const snap = await getDocs(q);
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  items.sort(sortByCreatedAtDesc);
  return items;
};

const renderOrderCard = (order) => {
  const buyerName = buildBuyerName(order);
  const buyerPhone = buildBuyerPhone(order);

  const receiptUrl = buildReceiptUrl(order);

  const rejectReason = order?.rejectReason
    ? `<p class="mt-2 text-xs text-rose-200">Sabab: ${order.rejectReason}</p>`
    : "";

  const statusChip = statusLabel(order.status);
  const total = buildTotal(order);

  return `
    <article class="rounded-2xl glass p-4 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-[220px]">
          <p class="text-xs text-slate-400">Buyurtma ID</p>
          <p class="text-sm font-semibold text-white break-all">${order.id}</p>

          <p class="mt-2 text-xs text-slate-400">Foydalanuvchi</p>
          <p class="text-sm text-slate-200">Kimdan: ${safe(buyerName)} (${safe(buyerPhone)})</p>
        </div>

        <div class="min-w-[180px]">
          <p class="text-xs text-slate-400">Sana</p>
          <p class="text-sm text-slate-200">${formatDate(order.createdAt || order.date)}</p>

          <p class="mt-2 text-xs text-slate-400">Mahsulotlar soni</p>
          <p class="text-sm text-slate-200">${getItemsCount(order.items)}</p>
        </div>

        <div class="min-w-[180px]">
          <p class="text-xs text-slate-400">Jami</p>
          <p class="text-sm font-semibold text-white">${total.toLocaleString("uz-UZ")} so'm</p>

          <p class="mt-2 text-xs text-slate-400">Yetkazish</p>
          <p class="text-sm text-slate-200">${safe(buildDelivery(order))}</p>
        </div>

        <div class="min-w-[180px]">
          <p class="text-xs text-slate-400">Holat</p>
          <span class="${statusChip.cls}">${statusChip.text || order.status}</span>
          ${rejectReason}
        </div>

        <div class="min-w-[240px]">
          <p class="text-xs text-slate-400">Manzil</p>
          <p class="text-sm text-slate-200">${safe(buildAddress(order))}</p>
        </div>
      </div>

      ${
        receiptUrl
          ? `
        <a href="${receiptUrl}" target="_blank" rel="noreferrer"
           class="receipt-open mt-3 inline-flex items-center gap-2 rounded-xl glass-soft px-3 py-2 text-xs text-white/80"
           data-href="${receiptUrl}">
          <img src="${receiptUrl}" alt="Receipt" class="h-16 w-16 rounded-lg object-cover" />
          <span>Chekni ko‘rish</span>
        </a>
      `
          : `<p class="mt-3 text-xs text-slate-500">Chek mavjud emas.</p>`
      }

      <div class="mt-4 flex flex-wrap gap-3">
        <button class="confirm-btn neon-btn rounded-xl px-4 py-2 text-xs font-semibold" data-id="${order.id}">
          ✅ Qabul
        </button>
        <button class="reject-btn rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:border-white/40"
                data-id="${order.id}">
          ❌ Rad
        </button>
      </div>
    </article>
  `;
};

const renderOrders = async () => {
  if (!isAdmin) return;

  pendingOrdersList.innerHTML = "";
  pendingEmpty?.classList.add("hidden");

  try {
    const orders = await fetchPendingOrders();

    if (!orders.length) {
      pendingEmpty?.classList.remove("hidden");
      pendingOrdersList.innerHTML = "";
      return;
    }

    pendingEmpty?.classList.add("hidden");
    pendingOrdersList.innerHTML = orders.map(renderOrderCard).join("");
  } catch (e) {
    console.error(e);
    pendingEmpty?.classList.remove("hidden");
    pendingOrdersList.innerHTML = "";
    showToast("Buyurtmalarni yuklashda xatolik", "error");
  }
};

const updateOrderStatus = async (orderId, status, rejectReason = null) => {
  const ref = doc(db, "orders", orderId);

  await setDoc(
    ref,
    {
      status,
      rejectReason: rejectReason || null,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await renderOrders();
};

// ====== RECEIPT MODAL + ORDER ACTIONS ======
adminPanel?.addEventListener("click", async (event) => {
  const receiptOpen = event.target.closest(".receipt-open");
  const confirmBtn = event.target.closest(".confirm-btn");
  const rejectBtn = event.target.closest(".reject-btn");

  if (receiptOpen) {
    event.preventDefault();
    const href = receiptOpen.dataset.href || receiptOpen.getAttribute("href");
    if (!href) return;

    const isImage =
      /\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/i.test(href) || href.includes("imgbb.com");

    if (isImage && receiptImage && receiptModal) {
      receiptImage.src = href;
      receiptModal.classList.remove("hidden");
      receiptModal.classList.add("flex");
    } else {
      window.open(href, "_blank", "noopener");
    }
    return;
  }

 if (confirmBtn) {
  const id = confirmBtn.dataset.id;
  if (!id) return;

  confirmBtn.disabled = true;
  try {
    await updateOrderStatus(id, "approved");

    const link = buildOrderLink(id);

    // ====== BUYURTMANING ITEMLARI VA VARIANTINI OLISH ======
    const orderSnap = await getDoc(doc(db, "orders", id));
    const orderData = orderSnap.data();

    let itemsText = "";
    if (Array.isArray(orderData.items) && orderData.items.length) {
      itemsText = orderData.items
        .map((item) => {
          const variant = item.variant ? ` (${item.variant})` : "";
          return `• ${item.title || item.name || "Mahsulot"}${variant} x${item.qty || 1}`;
        })
        .join("\n");
    } else {
      itemsText = "Mahsulotlar ma'lumotlari mavjud emas.";
    }

    // ====== TELEGRAMGA XABAR YUBORISH ======
    try {
      await sendTelegram(
        `✅ Buyurtma qabul qilindi\n\nID: ${id}\n\n🛍 Mahsulotlar:\n${itemsText}\n\nLink: ${link}`
      );
    } catch (e) {
      console.error(e);
      showToast("Telegramga yuborilmadi (token/chatId tekshir)", "error");
    }

    showToast("Buyurtma qabul qilindi");
  } catch (e) {
    console.error(e);
    showToast("Tasdiqlashda xatolik", "error");
  } finally {
    confirmBtn.disabled = false;
  }
  return;
}

  if (rejectBtn) {
    const id = rejectBtn.dataset.id;
    if (!id) return;

    const reason = prompt("Rad etish sababi (ixtiyoriy):") || null;

    rejectBtn.disabled = true;
    try {
      await updateOrderStatus(id, "rejected", reason);

      const link = buildOrderLink(id);
      try {
        await sendTelegram(
          `❌ Buyurtma rad etildi\nID: ${id}\nSabab: ${reason || "-"}\nLink: ${link}`
        );
      } catch (e) {
        console.error(e);
        showToast("Telegramga yuborilmadi (token/chatId tekshir)", "error");
      }

      showToast("Buyurtma rad etildi", "error");
    } catch (e) {
      console.error(e);
      showToast("Rad etishda xatolik", "error");
    } finally {
      rejectBtn.disabled = false;
    }
    return;
  }
});

receiptClose?.addEventListener("click", () => {
  receiptModal?.classList.add("hidden");
  receiptModal?.classList.remove("flex");
});

receiptModal?.addEventListener("click", (event) => {
  if (event.target === receiptModal) {
    receiptModal.classList.add("hidden");
    receiptModal.classList.remove("flex");
  }
});

// ====== PRODUCTS ======
const renderAdminProducts = () => {
  if (!adminProducts.length) {
    adminProductsEmpty?.classList.remove("hidden");
    adminProductsList.innerHTML = "";
    return;
  }

  adminProductsEmpty?.classList.add("hidden");
  adminProductsList.innerHTML = adminProducts
    .map(
      (product) => `
      <article class="rounded-2xl border border-slate-700 bg-slate-800/60 p-4 text-sm text-slate-200">
        <img src="${product.images?.[0] || product.img || ""}"
             alt="${safe(product.title, "Mahsulot")}"
             class="h-32 w-full rounded-xl object-cover" />
        <div class="mt-3 space-y-1">
          <p class="font-semibold text-white">${safe(product.title, "—")}</p>
          <p class="text-xs text-slate-400">${safe(product.category, "—")}</p>
        </div>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span class="text-sm font-semibold text-white">${Number(product.price || 0).toLocaleString("uz-UZ")} so'm</span>
          ${
            product.discount
              ? `<span class="text-xs font-semibold text-emerald-200">-${product.discount}%</span>`
              : ""
          }
        </div>
        <div class="mt-3 flex justify-end gap-2">
          <button type="button"
                  class="edit-product-btn rounded-lg border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:border-slate-400"
                  data-id="${product.id}">
            ✏️ Edit
          </button>
          <button type="button"
                  class="delete-product-btn rounded-lg border border-rose-500/60 px-3 py-1 text-xs text-rose-200 hover:border-rose-400"
                  data-id="${product.id}">
            🗑 Delete
          </button>
        </div>
      </article>
    `
    )
    .join("");
};

const loadAdminProducts = async () => {
  const snap = await getDocs(query(collection(db, "products")));
  adminProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  adminProducts.sort((a, b) => sortByCreatedAtDesc(a, b));
  renderAdminProducts();

  productsMap = new Map(adminProducts.map((p) => [String(p.id), p]));
};

const updateImagePreview = () => {
  if (!imagePreview) return;
  imagePreview.innerHTML = selectedPreviews
    .map(
      (image, index) => `
      <div class="relative overflow-hidden rounded-xl border border-slate-700 bg-slate-800/60">
        <img src="${image}" alt="preview" class="h-32 w-full object-cover" />
        <button type="button"
                class="remove-image absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs text-white"
                data-index="${index}">
          ❌
        </button>
      </div>
    `
    )
    .join("");
};

const renderVariants = () => {
  if (!variantList) return;

  if (!productVariants.length) {
    variantList.innerHTML =
      '<p class="text-xs text-white/50">Variantlar qoshilmagan. Narx uchun asosiy price ishlatiladi.</p>';
    return;
  }

  variantList.innerHTML = productVariants
    .map(
      (variant, index) => `
      <div class="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm">
        <div>
          <p class="font-medium text-white">${safe(variant.name)}</p>
          <p class="text-xs text-white/60">${Number(variant.price).toLocaleString("uz-UZ")} so'm</p>
        </div>
        <button type="button"
                class="remove-variant rounded-lg border border-rose-400/50 px-2 py-1 text-xs text-rose-200"
                data-index="${index}">
          ❌
        </button>
      </div>
    `
    )
    .join("");
};

const resetProductForm = () => {
  selectedFiles.forEach((_, index) => {
    const preview = selectedPreviews[index];
    if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview);
  });

  selectedFiles = [];
  selectedPreviews = [];
  editingId = null;
  productVariants = [];

  imageLimitError?.classList.add("hidden");
  updateImagePreview();
  renderVariants();

  if (productVariantName) productVariantName.value = "";
  if (productVariantPrice) productVariantPrice.value = "";
  if (saveButton) saveButton.textContent = "Saqlash";

  productForm?.reset();
};

productImages?.addEventListener("change", (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  if (files.length + selectedFiles.length > 10) {
    showToast("Maksimum 10 ta rasm yuklash mumkin", "error");
    imageLimitError?.classList.remove("hidden");
    productImages.value = "";
    return;
  }

  imageLimitError?.classList.add("hidden");
  files.forEach((file) => {
    selectedFiles.push(file);
    selectedPreviews.push(URL.createObjectURL(file));
  });

  updateImagePreview();
  productImages.value = "";
});

imagePreview?.addEventListener("click", (event) => {
  const removeBtn = event.target.closest(".remove-image");
  if (!removeBtn) return;

  const index = Number(removeBtn.dataset.index);
  const [removed] = selectedPreviews.splice(index, 1);
  if (removed && removed.startsWith("blob:")) URL.revokeObjectURL(removed);
  selectedFiles.splice(index, 1);

  updateImagePreview();
});

addVariantBtn?.addEventListener("click", () => {
  const name = productVariantName?.value.trim();
  const price = Number(productVariantPrice?.value);

  if (!name) return showToast("Variant nomini kiriting", "error");
  if (!Number.isFinite(price) || price <= 0)
    return showToast("Variant narxi musbat bo‘lishi kerak", "error");

  productVariants.push({ name, price });
  renderVariants();

  if (productVariantName) productVariantName.value = "";
  if (productVariantPrice) productVariantPrice.value = "";
});

variantList?.addEventListener("click", (event) => {
  const removeBtn = event.target.closest(".remove-variant");
  if (!removeBtn) return;

  const index = Number(removeBtn.dataset.index);
  productVariants = productVariants.filter((_, idx) => idx !== index);
  renderVariants();
});

productForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedFiles.length && !selectedPreviews.length) {
    showToast("Kamida 1 ta rasm yuklang", "error");
    return;
  }

  const title = productTitle.value.trim();
  const price = Number(productPrice.value);
  const stock = Number(productStock?.value);
  const oldPrice = Number(productOldPrice.value);
  const discount = Number(productDiscount.value);
  const rating = Number(productRating?.value);
  const description = productDescription?.value.trim();

  if (!title) return showToast("Mahsulot nomini kiriting", "error");

  try {
    const payload = {
      title,
      category: productCategory.value,
      price: Number.isFinite(price) ? price : 0,
      stock: Number.isFinite(stock) && stock >= 0 ? stock : null,
      oldPrice: Number.isFinite(oldPrice) && oldPrice > 0 ? oldPrice : null,
      discount: Number.isFinite(discount) && discount > 0 ? discount : null,
      rating: Number.isFinite(rating) && rating >= 0 ? rating : null,
      desc: description || null,
      updatedAt: serverTimestamp(),
      active: true,
      variants: productVariants,
    };

    const imageUrls = selectedFiles.length
      ? await Promise.all(selectedFiles.map((file) => imgbbUpload(file, IMGBB_API_KEY)))
      : [...selectedPreviews];

    if (editingId) {
      await updateDoc(doc(db, "products", editingId), {
        ...payload,
        images: imageUrls,
      });
      showToast("Mahsulot yangilandi");
    } else {
      await addDoc(collection(db, "products"), {
        ...payload,
        images: imageUrls,
        createdAt: serverTimestamp(),
      });
      showToast("Mahsulot muvaffaqiyatli qo‘shildi");
    }

    resetProductForm();
    await loadAdminProducts();
  } catch (e) {
    console.error(e);
    showToast("Mahsulotni saqlashda xatolik yuz berdi", "error");
  }
});

adminProductsList?.addEventListener("click", async (event) => {
  const editBtn = event.target.closest(".edit-product-btn");
  const deleteBtn = event.target.closest(".delete-product-btn");

  if (deleteBtn) {
    const id = deleteBtn.dataset.id;
    if (!id) return;
    if (!window.confirm("Mahsulotni o‘chirishni tasdiqlaysizmi?")) return;

    try {
      await deleteDoc(doc(db, "products", id));
      showToast("Mahsulot o‘chirildi");
      await loadAdminProducts();
    } catch (e) {
      console.error(e);
      showToast("O‘chirishda xatolik yuz berdi", "error");
    }
    return;
  }

  if (!editBtn) return;

  const product = adminProducts.find((p) => String(p.id) === String(editBtn.dataset.id));
  if (!product) return;

  editingId = product.id;
  productTitle.value = product.title || "";
  productCategory.value = product.category || "Telefon";
  productPrice.value = product.price ?? "";
  productStock.value = product.stock ?? "";
  productOldPrice.value = product.oldPrice ?? "";
  productDiscount.value = product.discount ?? "";
  if (productRating) productRating.value = product.rating ?? "";
  if (productDescription) productDescription.value = product.desc || product.description || "";

  selectedFiles = [];
  selectedPreviews.forEach((preview) => {
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
  });
  selectedPreviews = product.images?.length ? [...product.images] : [];
  productVariants = Array.isArray(product.variants) ? [...product.variants] : [];
  renderVariants();
  updateImagePreview();
  if (saveButton) saveButton.textContent = "Yangilash";
});

// ====== COMMENTS (LOCAL STORAGE) ======
const renderAdminComments = () => {
  const comments = getProductComments();
  const entries = Object.values(comments).flat();

  if (!entries.length) {
    commentsEmpty?.classList.remove("hidden");
    adminComments.innerHTML = "";
    return;
  }

  commentsEmpty?.classList.add("hidden");
  adminComments.innerHTML = entries
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((comment) => {
      const product = productsMap.get(comment.productId);

      return `
        <article class="rounded-2xl border border-slate-700 bg-[#0f2f52] p-4 text-sm text-slate-200">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-xs text-slate-400">Mahsulot</p>
              <p class="font-semibold text-white">${safe(product?.title, "Noma'lum")} (${comment.productId})</p>
            </div>
            <div class="text-xs text-slate-400">${formatDate(comment.createdAt)}</div>
          </div>

          <p class="mt-2">Kimdan: ${safe(comment.userName)} (${safe(comment.userPhone, "Telefon: N/A")})</p>
          <p class="mt-2 text-slate-300">${safe(comment.text, "")}</p>
          ${comment.rating ? `<p class="mt-2 text-xs text-amber-400">Reyting: ${comment.rating}/5</p>` : ""}

          <form class="reply-form mt-3 flex flex-col gap-2" data-id="${comment.id}" data-product-id="${comment.productId}">
            <textarea rows="2" required class="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-white" placeholder="Javob yozing..."></textarea>
            <button class="self-start rounded-xl bg-blue-500 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-600">Javob berish</button>
          </form>
        </article>
      `;
    })
    .join("");
};

adminComments?.addEventListener("submit", (event) => {
  const form = event.target.closest(".reply-form");
  if (!form) return;

  event.preventDefault();
  const textarea = form.querySelector("textarea");
  const text = textarea.value.trim();
  if (!text) return;

  const productId = form.dataset.productId;
  const commentId = form.dataset.id;

  const allComments = getProductComments();
  const list = allComments[productId] || [];

  const updatedList = list.map((comment) => {
    if (comment.id !== commentId) return comment;
    return {
      ...comment,
      replies: [
        {
          id: `r-${Date.now()}`,
          adminId: currentUser?.id || "admin",
          adminName: currentUser?.name || "Admin",
          text,
          createdAt: new Date().toISOString(),
        },
        ...(comment.replies || []),
      ],
    };
  });

  allComments[productId] = updatedList;
  saveProductComments(allComments);
  renderAdminComments();
});

// ====== PAYMENTS (Firestore settings/payment) ======
const loadPayments = async () => {
  if (!payOwner || !payCard || !payBank) return;

  try {
    const ref = doc(db, "settings", "payment");
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};

    payOwner.value = data?.ownerFullName || "";
    payCard.value = data?.cardNumber || "";
    payBank.value = data?.bank || "";
    if (payStatus) payStatus.textContent = "✅ Yuklandi";
  } catch (e) {
    console.error(e);
    if (payStatus) payStatus.textContent = "❌ Yuklashda xatolik";
  }
};

const savePayments = async () => {
  if (!payOwner || !payCard || !payBank) return;

  try {
    await setDoc(
      doc(db, "settings", "payment"),
      {
        ownerFullName: payOwner.value.trim(),
        cardNumber: payCard.value.trim(),
        bank: payBank.value.trim(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    showToast("Payments saqlandi");
    if (payStatus) payStatus.textContent = "✅ Saqlandi";
  } catch (e) {
    console.error(e);
    showToast("Payments saqlashda xatolik", "error");
    if (payStatus) payStatus.textContent = "❌ Saqlashda xatolik";
  }
};

paySaveBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  savePayments();
});

// ====== START ======
const init = async () => {
  if (!isAdmin) return;

  await loadAdminProducts();
  await renderOrders();
  renderAdminComments();
  renderVariants();
  await loadPayments();
};

// ====== AUTH OBSERVER ======
onAuthStateChanged(auth, async (user) => {
  try {
    if (!user) {
      isAdmin = false;
      currentUser = readLocalUser();
      hasInitialized = false;
      if (loginError) loginError.textContent = "";
      showLogin();
      return;
    }

    const localUser = readLocalUser();

    currentUser = {
      ...(localUser || {}),
      id: user.uid,
      name: user.displayName || localUser?.name || "Admin",
      email: user.email || localUser?.email || "",
    };

    isAdmin = await checkAdminRole(user);

    if (!isAdmin) {
      console.warn("Bu user admin emas:", user.email, user.uid);

      await signOut(auth);
      isAdmin = false;
      hasInitialized = false;

      if (loginError) {
        loginError.textContent = "Bu account admin emas yoki admins collectionda UID noto‘g‘ri.";
      }

      showLogin();
      return;
    }

    setAdminProfile(user);
    if (loginError) loginError.textContent = "";
    showAllowed();

    if (!hasInitialized) {
      hasInitialized = true;
      await init();
    }
  } catch (e) {
    console.error("Auth tekshiruvda xatolik:", e);
    hasInitialized = false;
    if (loginError) loginError.textContent = "Auth tekshiruvda xatolik yuz berdi.";
    showLogin();
  }
});