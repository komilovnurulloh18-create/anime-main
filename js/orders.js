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
const ordBadge = document.querySelector("#ord-badge");
const ordSummary = document.querySelector("#ord-summary");
const sumTotal = document.querySelector("#sum-total");
const sumApproved = document.querySelector("#sum-approved");
const sumPending = document.querySelector("#sum-pending");

// ====== HELPERS ======
const CACHE_KEY = "orders_cache_v2";
const LS_FALLBACK_KEY = "orders";

const safeJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) ?? fallback;
  } catch {
    return fallback;
  }
};

const toDateObj = (value) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
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
  return d.toLocaleDateString(getLang() === "ru" ? "ru-RU" : "uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const normalizeForCache = (order) => ({
  ...order,
  createdAt: toDateObj(order.createdAt)?.toISOString?.() || order.createdAt || null,
  updatedAt: toDateObj(order.updatedAt)?.toISOString?.() || order.updatedAt || null,
});

const formatStatus = (status) => {
  if (status === "pending" || status === "pending_verification") return "Ko'rib chiqilyapti";
  if (status === "approved" || status === "accepted") return "Buyurtma qabul qilindi";
  if (status === "rejected") return "Rad etildi";
  return statusLabel(status).text || status || "—";
};

// ── Status → premium badge styling map ──
const STATUS_STYLE = {
  pending: { ico: "⏳", cls: "approved-pending", color: "rgba(245,158,11,.12)", border: "rgba(245,158,11,.28)", text: "#fcd34d", strip: "linear-gradient(90deg,#f59e0b,#fcd34d)" },
  pending_verification: { ico: "⏳", cls: "approved-pending", color: "rgba(245,158,11,.12)", border: "rgba(245,158,11,.28)", text: "#fcd34d", strip: "linear-gradient(90deg,#f59e0b,#fcd34d)" },
  approved: { ico: "✅", cls: "approved-ok", color: "rgba(34,197,94,.12)", border: "rgba(34,197,94,.28)", text: "#4ade80", strip: "linear-gradient(90deg,#22c55e,#4ade80)" },
  accepted: { ico: "✅", cls: "approved-ok", color: "rgba(34,197,94,.12)", border: "rgba(34,197,94,.28)", text: "#4ade80", strip: "linear-gradient(90deg,#22c55e,#4ade80)" },
  rejected: { ico: "❌", cls: "approved-bad", color: "rgba(239,68,68,.12)", border: "rgba(239,68,68,.28)", text: "#f87171", strip: "linear-gradient(90deg,#ef4444,#f87171)" },
};
const getStatusStyle = (status) =>
  STATUS_STYLE[status] || { ico: "📋", cls: "approved-default", color: "rgba(168,85,247,.12)", border: "rgba(168,85,247,.28)", text: "#c084fc", strip: "linear-gradient(90deg,#7c3aed,#c084fc)" };

const renderSkeleton = (count = 4) => {
  ordersList.innerHTML = ordersSkeletonListHTML(count);
};

// product title
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

const getItemImage = (item) => {
  return item?.image || item?.img || item?.photo || item?.thumbnail || "";
};

// ====== UPDATE SUMMARY ======
const updateSummary = (data) => {
  if (ordBadge) ordBadge.textContent = data.length;

  if (!data.length) {
    if (ordSummary) ordSummary.style.display = "none";
    return;
  }

  if (ordSummary) ordSummary.style.display = "grid";
  if (sumTotal) sumTotal.textContent = data.length;

  const approvedCount = data.filter((o) => o.status === "approved" || o.status === "accepted").length;
  const pendingCount = data.filter((o) => o.status === "pending" || o.status === "pending_verification").length;

  if (sumApproved) sumApproved.textContent = approvedCount;
  if (sumPending) sumPending.textContent = pendingCount;
};

// ====== RENDER ======
const renderOrders = () => {
  const data = window.__orders || [];

  updateSummary(data);

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
      const items = Array.isArray(order.items) ? order.items : [];
      const ss = getStatusStyle(order.status);

      // Item thumbnails (max 3 + counter)
      const thumbsHtml = items
        .slice(0, 3)
        .map((item) => {
          const img = getItemImage(item);
          return `<div class="ord-thumb">${
            img
              ? `<img src="${img}" alt="" onerror="this.parentElement.innerHTML='🛍️'">`
              : "🛍️"
          }</div>`;
        })
        .join("");
      const extraCount =
        items.length > 3 ? `<div class="ord-thumb ord-thumb-more">+${items.length - 3}</div>` : "";

      const rejectReasonHtml =
        order.status === "rejected" && order.rejectReason
          ? `<div class="ord-reject-reason">⚠️ Sabab: ${order.rejectReason}</div>`
          : "";

      return `
        <div class="ord-card">
          <div class="ord-strip" style="background:${ss.strip}"></div>
          <div class="ord-card-body">

            <div class="ord-top-row">
              <div>
                <div class="ord-id-lbl">${t("order_id") || "Buyurtma ID"}</div>
                <div class="ord-id-val">${shownId}</div>
              </div>
              <div class="ord-date-wrap">
                <div class="ord-date-lbl">${t("order_date") || "Sana"}</div>
                <div class="ord-date-val">${toDisplayDate(order.createdAt || order.date)}</div>
              </div>
            </div>

            <div class="ord-mid-row">
              <span class="ord-status" style="background:${ss.color};border:1px solid ${ss.border};color:${ss.text}">
                ${ss.ico} ${formatStatus(order.status)}
              </span>
              <div style="text-align:right;">
                <div class="ord-price-lbl">${t("total") || "Jami"}</div>
                <div class="ord-price-val">${formatPrice(total)} so'm</div>
              </div>
            </div>

            ${rejectReasonHtml}

            ${
              items.length
                ? `<div class="ord-thumbs-row">${thumbsHtml}${extraCount}<span class="ord-items-count">${items.length} ta mahsulot</span></div>`
                : ""
            }

            <div class="ord-footer">
              <button class="order-detail-btn ord-detail-btn" data-docid="${order.docId || ""}">
                Batafsil
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>

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
  const items = Array.isArray(order.items) ? order.items : [];
  const ss = getStatusStyle(order.status);
  const total = Number(order.total || 0);

  // Receipt
  const receiptSrc = order.receiptUrl || order.receipt?.url || order.receiptBase64 || "";
  const receiptHtml = receiptSrc
    ? `
      <div class="m-sec">
        <div class="m-sec-hd">🧾 To'lov cheki</div>
        <a href="${receiptSrc}" target="_blank" rel="noreferrer" class="m-receipt">
          <img src="${receiptSrc}" alt="Chek" />
          <span>Chekni ko'rish</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </a>
      </div>`
    : "";

  // Reject reason
  const rejectHtml =
    order.status === "rejected" && order.rejectReason
      ? `
      <div class="m-sec">
        <div class="m-card" style="background:rgba(239,68,68,.06);border-color:rgba(239,68,68,.18);">
          <div style="font-size:12.5px;color:#fca5a5;font-weight:700;">⚠️ Rad etilish sababi</div>
          <div style="font-size:13px;color:rgba(247,244,255,.75);margin-top:4px;line-height:1.5;">${order.rejectReason}</div>
        </div>
      </div>`
      : "";

  // Products
  const productsHtml = items.length
    ? items
        .map((item) => {
          const img = getItemImage(item);
          const qty = Number(item.qty || 1);
          const price = Number(item.price || item.totalPrice || 0);
          return `
          <div class="m-product">
            <div class="m-prod-img">${
              img ? `<img src="${img}" alt="" onerror="this.parentElement.innerHTML='🛍️'">` : "🛍️"
            }</div>
            <div style="flex:1;min-width:0;">
              <div class="m-prod-name">${getItemTitle(item)}</div>
              <div class="m-prod-meta">${qty} dona${price ? ` × ${formatPrice(price)} so'm` : ""}</div>
            </div>
            ${price ? `<div class="m-prod-price">${formatPrice(price * qty)} so'm</div>` : `<div class="m-prod-qty">×${qty}</div>`}
          </div>`;
        })
        .join("")
    : `<div style="color:rgba(247,244,255,.4);font-size:13px;padding:8px 0;">Mahsulot ma'lumoti yo'q</div>`;

  // Delivery / contact info (agar order ichida bo'lsa)
  const name = order.name || order.customerName || order.fullName || "";
  const phone = order.phone || order.userPhone || "";
  const address = order.address || order.deliveryAddress || "";

  const deliveryHtml =
    name || phone || address
      ? `
      <div class="m-sec">
        <div class="m-sec-hd">🚚 Yetkazib berish</div>
        <div class="m-card">
          ${name ? `<div class="m-row"><span class="m-row-lbl">Ism</span><span class="m-row-val">${name}</span></div>` : ""}
          ${phone ? `<div class="m-row"><span class="m-row-lbl">Telefon</span><span class="m-row-val">${phone}</span></div>` : ""}
          ${address ? `<div class="m-row"><span class="m-row-lbl">Manzil</span><span class="m-row-val">${address}</span></div>` : ""}
        </div>
      </div>`
      : "";

  modalContent.innerHTML = `
    <!-- Status banner -->
    <div class="m-status-banner" style="background:${ss.color};border:1px solid ${ss.border};">
      <span style="font-size:24px;">${ss.ico}</span>
      <div>
        <div style="font-size:14px;font-weight:800;color:#fff;">${formatStatus(order.status)}</div>
        <div style="font-size:11px;color:rgba(247,244,255,.42);margin-top:1px;">Buyurtma holati</div>
      </div>
    </div>

    <!-- Order info -->
    <div class="m-sec">
      <div class="m-sec-hd">📋 Buyurtma ma'lumoti</div>
      <div class="m-card">
        <div class="m-row">
          <span class="m-row-lbl">ID</span>
          <span class="m-row-val" style="font-size:11px;color:#a5b4fc;">${order.id || order.docId || "—"}</span>
        </div>
        <div class="m-row">
          <span class="m-row-lbl">Sana</span>
          <span class="m-row-val">${toDisplayDateTime(created)}</span>
        </div>
      </div>
    </div>

    ${rejectHtml}

    ${deliveryHtml}

    <!-- Products -->
    <div class="m-sec">
      <div class="m-sec-hd">🛍️ Mahsulotlar${items.length ? ` (${items.length} ta)` : ""}</div>
      <div class="m-card">${productsHtml}</div>
    </div>

    ${receiptHtml}

    <!-- Total -->
    <div class="m-total">
      <span class="m-total-lbl">💰 Jami summa</span>
      <span class="m-total-val">${formatPrice(total)} so'm</span>
    </div>

    <!-- Admin contact -->
    <a href="https://t.me/animeshopuz_admin" target="_blank" class="m-admin-btn">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#29b6f6"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.26 13.447l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.888.112z"/></svg>
      Admin bilan bog'lanish
    </a>
  `;

  modal.classList.remove("hidden");
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
};

const closeModal = () => {
  modal.classList.remove("open");
  modal.classList.add("hidden");
  document.body.style.overflow = "";
};

ordersList?.addEventListener("click", (event) => {
  const button = event.target.closest(".order-detail-btn");
  if (!button) return;
  const docId = button.dataset.docid;
  if (docId) openModal(docId);
});

modalClose?.addEventListener("click", closeModal);
modal?.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

// ====== FIRESTORE LOAD ======
const mapDocs = (snap) =>
  snap.docs.map((d) => {
    const data = d.data() || {};
    return { docId: d.id, ...data, id: data.id || d.id };
  });

const fetchOrdersFromFirestore = async (currentUser) => {
  if (!currentUser) return [];

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

  const cached = safeJson(CACHE_KEY, null);
  if (cached?.items?.length) {
    window.__orders = cached.items;
    renderOrders();
  }

  const currentUser = getCurrentUser();
  if (!currentUser) {
    emptyState.classList.remove("hidden");
    ordersList.innerHTML = "";
    if (ordBadge) ordBadge.textContent = "0";
    if (ordSummary) ordSummary.style.display = "none";
    return;
  }

  // "Internet yo'q" bandlovchi notice — endi ko'rsatilmaydi (dizayn talabi)
  // if (!navigator.onLine && offlineNotice) offlineNotice.classList.remove("hidden");

  try {
    const firebaseOrders = await fetchOrdersFromFirestore(currentUser);
    window.__orders = firebaseOrders;

    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ts: Date.now(), items: firebaseOrders.map(normalizeForCache) })
    );

    renderOrders();
  } catch (error) {
    console.error("Firestore orders load failed:", error);

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
      window.__orders = [];
      updateSummary([]);
      emptyState.classList.remove("hidden");
      ordersList.innerHTML = "";
    }
  }
};

init();

window.addEventListener("langChanged", () => renderOrders());

window.addEventListener("online", () => {
  if (offlineNotice) offlineNotice.classList.add("hidden");
});

window.addEventListener("offline", () => {
  // "Internet yo'q" notice ko'rsatilmaydi
});