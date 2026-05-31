import { ensureSeedData, getCurrentUser } from "./storage.js";
import {
  formatPrice,
  updateCartBadge,
  statusLabel,
  ordersSkeletonListHTML,
  offlineBlockHTML,
} from "./ui.js";
import { applyTranslations, initLangSwitcher, t, getLang } from "./i18n.js";
import { db, collection, query, where, getDocs, orderBy, limit } from "./firebase.js";

// ====== INIT ======
ensureSeedData();
applyTranslations();
initLangSwitcher();
updateCartBadge();

const ordersList = document.querySelector("#orders-list");
const emptyState = document.querySelector("#orders-empty");
const offlineNotice = document.querySelector("#orders-offline");
const modal = document.querySelector("#order-modal");
const modalContent = document.querySelector("#modal-content");
const modalClose = document.querySelector("#modal-close");

// ====== HELPERS ======
const CACHE_KEY = "orders_cache_v2"; // eski cache bilan urishmasin
const LS_FALLBACK_KEY = "orders"; // sizda bor

const safeJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) ?? fallback;
  } catch {
    return fallback;
  }
};

// createdAt har xil formatda kelishi mumkin: Timestamp | ISO | number | null
const toDateObj = (value) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate(); // Firestore Timestamp
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (value instanceof Date) return value;
  return null;
};

const toDisplayDateTime = (value) => {
  const d = toDateObj(value);
  if (!d) return "—";
  return d.toLocaleString(getLang() === "ru" ? "ru-RU" : "uz-UZ");
};

const toDisplayDate = (value) => {
  const d = toDateObj(value);
  if (!d) return "—";
  return d.toLocaleDateString(getLang() === "ru" ? "ru-RU" : "uz-UZ");
};

const normalizeForCache = (order) => ({
  ...order,
  // cache ichida Timestamp saqlamaymiz, string qilamiz
  createdAt: toDateObj(order.createdAt)?.toISOString?.() || order.createdAt || null,
  updatedAt: toDateObj(order.updatedAt)?.toISOString?.() || order.updatedAt || null,
});

const formatStatus = (status) => {
  if (status === "pending" || status === "pending_verification") return "Ko'rib chiqilyapti";
  if (status === "approved" || status === "accepted") return "Buyurtma qabul qilindi";
  if (status === "rejected") return "Rad etildi";
  return statusLabel(status).text || status || "—";
};

const renderSkeleton = (count = 6) => {
  ordersList.innerHTML = ordersSkeletonListHTML(count);
};

const renderReceiptThumb = (order, size = "h-8 w-8") => {
  const src = order.receiptUrl || order.receipt?.url || order.receiptBase64 || "";
  if (!src) return "";
  return `
    <a href="${src}" target="_blank" rel="noreferrer"
       class="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/85">
      <img src="${src}" alt="Chek" class="${size} rounded object-cover" />
      <span>${t("details") || "Receipt"}</span>
    </a>
  `;
};

// product title chiqishi uchun item ichida title bo‘lsa ishlatamiz, bo‘lmasa `Product #id`
const getItemTitle = (item) => {
  if (!item) return "—";

  const base =
    item.title ||
    item.name ||
    item.productTitle ||
    (item.id ? `Product #${item.id}` : "Product");

  const variant =
    item.variant ||
    item.variantName ||
    item.size ||
    item.selectedVariant ||
    item.selectedOptions?.size ||
    "";

  return variant ? `${base} (${variant})` : base;
};
// ====== RENDER ======
const renderOrders = () => {
  const data = window.__orders || [];

  if (!data.length) {
    emptyState.classList.remove("hidden");
    ordersList.innerHTML = "";
    return;
  }

  emptyState.classList.add("hidden");

  ordersList.innerHTML = data
    .map((order) => {
      const shownId = order.id || order.docId || "—";
      const total = Number(order.total || 0);

      return `
        <div class="rounded-2xl glass p-4 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-xs text-slate-400">${t("order_id") || "ID"}</p>
              <p class="font-semibold text-white">${shownId}</p>
              <p class="mt-1 text-xs text-slate-400">docId: ${order.docId || "—"}</p>
            </div>

            <div>
              <p class="text-xs text-slate-400">${t("order_date") || "Sana"}</p>
              <p class="text-sm text-slate-300">${toDisplayDate(order.createdAt || order.date)}</p>
            </div>

            <div>
              <p class="text-xs text-slate-400">${t("order_status") || "Status"}</p>
              <span class="${statusLabel(order.status).cls}">
                ${formatStatus(order.status)}
              </span>
              ${
                order.status === "rejected" && order.rejectReason
                  ? `<p class="mt-2 text-xs text-rose-200">Sabab: ${order.rejectReason}</p>`
                  : ""
              }
            </div>

            <div>
              <p class="text-xs text-slate-400">${t("total") || "Jami"}</p>
              <p class="font-semibold text-white">${formatPrice(total)} so'm</p>
            </div>

            ${renderReceiptThumb(order)}

            <button class="order-detail-btn neon-btn rounded-lg px-3 py-1 text-xs font-semibold"
                    data-docid="${order.docId || ""}">
              ${t("details") || "Details"}
            </button>
          </div>
        </div>
      `;
    })
    .join("");
};

// ====== MODAL ======
const openModal = (docId) => {
  const order = window.__orders?.find((o) => o.docId === docId);
  if (!order) return;

  const created = order.createdAt || order.date;

  modalContent.innerHTML = `
    <div class="space-y-2">
      <h3 class="text-lg font-semibold text-white">${order.id || order.docId}</h3>
      <p class="text-sm text-slate-400">${toDisplayDateTime(created)}</p>

      <div class="mt-2">
        <div class="text-sm text-slate-300">
          <b>${t("order_status") || "Status"}:</b> ${formatStatus(order.status)}
        </div>
        <div class="text-sm text-slate-300">
          <b>${t("total") || "Jami"}:</b> ${formatPrice(Number(order.total || 0))} so'm
        </div>
      </div>

      <div class="mt-3">
        ${renderReceiptThumb(order, "h-10 w-10")}
      </div>

      <div class="mt-4">
        <p class="text-xs text-slate-400 mb-2">Mahsulotlar</p>
        <div class="space-y-2">
          ${(order.items || [])
            .map((item) => {
              const title = getItemTitle(item);
              const qty = Number(item.qty || 1);
              return `
                <div class="flex items-center justify-between text-sm text-slate-300 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <span class="truncate pr-2">
                     ${title}
                  </span>
                  <span class="shrink-0">${qty}x</span>
                </div>
              `;
            })
            .join("") || `<p class="text-sm text-white/70">—</p>`}
        </div>
      </div>
    </div>
  `;

  modal.classList.remove("hidden");
};

ordersList?.addEventListener("click", (event) => {
  const button = event.target.closest(".order-detail-btn");
  if (!button) return;
  const docId = button.dataset.docid;
  if (docId) openModal(docId);
});

modalClose?.addEventListener("click", () => modal.classList.add("hidden"));
modal?.addEventListener("click", (event) => {
  if (event.target === modal) modal.classList.add("hidden");
});

// ====== FIRESTORE LOAD ======
const mapDocs = (snap) =>
  snap.docs.map((d) => {
    const data = d.data() || {};
    // docId alohida; id esa payloaddagi ord_ bo‘lsa shuni qoldiramiz
    return { docId: d.id, ...data, id: data.id || d.id };
  });

const fetchOrdersFromFirestore = async (currentUser) => {
  if (!currentUser) return [];

  // 1) userId bo‘yicha
  if (currentUser.id) {
    try {
      const q1 = query(
        collection(db, "orders"),
        where("userId", "==", currentUser.id),
        orderBy("createdAt", "desc"),
        limit(50)
      );
      const s1 = await getDocs(q1);
      const items = mapDocs(s1);
      if (items.length) return items;
    } catch (e) {
      // createdAt yo‘q bo‘lsa orderBy yiqilishi mumkin, fallback
      console.warn("userId query failed, fallback:", e);
      const q1 = query(collection(db, "orders"), where("userId", "==", currentUser.id), limit(50));
      const s1 = await getDocs(q1);
      return mapDocs(s1).sort((a, b) => {
        const da = toDateObj(a.createdAt || a.date)?.getTime?.() || 0;
        const dbb = toDateObj(b.createdAt || b.date)?.getTime?.() || 0;
        return dbb - da;
      });
    }
  }

  // 2) phone bo‘yicha
  if (currentUser.phone) {
    try {
      const q2 = query(
        collection(db, "orders"),
        where("userPhone", "==", currentUser.phone),
        orderBy("createdAt", "desc"),
        limit(50)
      );
      const s2 = await getDocs(q2);
      return mapDocs(s2);
    } catch (e) {
      console.warn("phone query failed, fallback:", e);
      const q2 = query(collection(db, "orders"), where("userPhone", "==", currentUser.phone), limit(50));
      const s2 = await getDocs(q2);
      return mapDocs(s2).sort((a, b) => {
        const da = toDateObj(a.createdAt || a.date)?.getTime?.() || 0;
        const dbb = toDateObj(b.createdAt || b.date)?.getTime?.() || 0;
        return dbb - da;
      });
    }
  }

  return [];
};

// ====== INIT ======
const init = async () => {
  renderSkeleton();

  // cache ko‘rsatib turamiz
  const cached = safeJson(CACHE_KEY, null);
  if (cached?.items?.length) {
    window.__orders = cached.items;
    renderOrders();
  }

  const currentUser = getCurrentUser();
  if (!currentUser) {
    emptyState.classList.remove("hidden");
    ordersList.innerHTML = "";
    return;
  }

  if (!navigator.onLine && offlineNotice) offlineNotice.classList.remove("hidden");

  try {
    const firebaseOrders = await fetchOrdersFromFirestore(currentUser);
    window.__orders = firebaseOrders;

    // cache saqlaymiz
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ts: Date.now(), items: firebaseOrders.map(normalizeForCache) })
    );

    renderOrders();
  } catch (error) {
    console.error("Firestore orders load failed:", error);

    // localStorage fallback (eski orderlar uchun)
    const localFallback = safeJson(LS_FALLBACK_KEY, []);
    const fallbackOrders = (Array.isArray(localFallback) ? localFallback : [])
      .filter((order) => {
        return (
          (currentUser.id && order.userId === currentUser.id) ||
          (currentUser.phone && order.userPhone === currentUser.phone)
        );
      })
      .sort((a, b) => {
        const da = toDateObj(a.createdAt || a.date)?.getTime?.() || 0;
        const dbb = toDateObj(b.createdAt || b.date)?.getTime?.() || 0;
        return dbb - da;
      })
      .map((o) => ({ docId: o.docId || o.id || "", ...o, id: o.id || o.docId || "" }));

    if (fallbackOrders.length) {
      window.__orders = fallbackOrders;
      renderOrders();
    } else if (!cached?.items?.length) {
      emptyState.classList.remove("hidden");
      ordersList.innerHTML = offlineBlockHTML(
        "Buyurtmalar yuklanmadi",
        "Internetga ulanib qayta urinib ko‘ring."
      );
    }
  }
};

init();

window.addEventListener("langChanged", () => renderOrders());

window.addEventListener("online", () => {
  if (offlineNotice) offlineNotice.classList.add("hidden");
});

window.addEventListener("offline", () => {
  if (offlineNotice) offlineNotice.classList.remove("hidden");
});