// js/searc.js
import { db, doc, getDoc, collection, getDocs } from "./firebase.js";

const $app = document.querySelector("#app");
const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const getParam = (k) => new URLSearchParams(location.search).get(k);
const toDateText = (v) => {
  const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
  if (!d || isNaN(d.getTime())) return "—";
  return d.toLocaleString("uz-UZ");
};
const price = (n) => Number(n || 0).toLocaleString("uz-UZ");

const getReceiptUrl = (order) =>
  order?.receiptUrl || order?.receiptBase64 || order?.receipt?.url || order?.receipt?.base64 || "";

const normalizeAddress = (order) => ({
  region: order?.region || "—",
  district: order?.district || "—",
  home: order?.address || order?.homeAddress || "—",
});

const buildProductsMap = async () => {
  const snap = await getDocs(collection(db, "products"));
  const map = new Map();
  snap.docs.forEach((d) => map.set(String(d.id), { id: d.id, ...(d.data() || {}) }));
  return map;
};

async function load() {
  const id = getParam("id");
  if (!id) {
    $app.innerHTML = `<div class="wrap"><h1 class="text-3xl font-bold">Buyurtma</h1><p>ID yo‘q</p></div>`;
    return;
  }

  const orderDoc = await getDoc(doc(db, "orders", id));
  if (!orderDoc.exists()) {
    $app.innerHTML = `
      <div class="wrap">
        <h1 class="text-3xl font-bold">Buyurtma</h1>
        <p><b>ID:</b> ${esc(id)}</p>
        <p style="color:#b91c1c">Buyurtma topilmadi.</p>
      </div>`;
    return;
  }

  const order = { id: orderDoc.id, ...orderDoc.data() };
  const addr = normalizeAddress(order);
  const receiptUrl = getReceiptUrl(order);

  let productsMap = new Map();
  try { productsMap = await buildProductsMap(); } catch {}

  const items = Array.isArray(order.items) ? order.items : [];
  const itemsHtml = items.length
    ? items.map((it) => {
        const pid = String(it.id ?? it.productId ?? "");
        const p = productsMap.get(pid);

        const title = it.title || p?.title || "Mahsulot";

        // --- YANGILANDI: variant/size/options birlashtirish ---
        const variant =
          it.variant ||
          it.variantName ||
          it.size ||
          it.selectedVariant ||
          it.selectedOption || 
          (Array.isArray(it.options) ? it.options.join(", ") : "") || 
          "";

        const img = (p?.images && p.images[0]) || p?.img || "";
        const qty = Number(it.qty || 1);
        const one = Number(it.variantPrice ?? it.price ?? p?.price ?? 0);
        const sum = one * qty;

        return `
          <div style="display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid #eee;">
            ${img ? `<img src="${esc(img)}" style="width:60px;height:60px;object-fit:cover;border-radius:10px;">` : ""}
            <div style="flex:1">
              <div style="font-weight:700">
                ${esc(title)} ${variant ? `(${esc(variant)})` : ""}
              </div>
              <div style="color:#555;font-size:14px;">
                ${qty} x ${price(one)} so'm
              </div>
            </div>
            <div style="font-weight:700">${price(sum)} so'm</div>
          </div>`;
      }).join("")
    : `<p>—</p>`;

  const userName = order.userName || order.user?.name || "—";
  const userPhone = order.userPhone || order.user?.phone || "—";
  const payment = order.payment || "—";
  const deliveryLabel = order.delivery?.label || order.deliveryType || "—";
  const total = order.total ?? 0;

  $app.innerHTML = `
    <div class="wrap">
      <h1 class="text-4xl font-bold" style="margin:10px 0 20px;">Buyurtma</h1>

      <div style="margin:0 0 14px;">
        <div><b>ID:</b> ${esc(order.id)}</div>
        <div><b>Status:</b> ${esc(order.status || "—")}</div>
        <div><b>Sana:</b> ${esc(toDateText(order.createdAt || order.date))}</div>
        <div><b>Jami:</b> ${esc(price(total))} so'm</div>
        <div><b>Foydalanuvchi:</b> ${esc(userName)} (${esc(userPhone)})</div>
        <div><b>Manzil:</b> ${esc(addr.region)}, ${esc(addr.district)}, ${esc(addr.home)}</div>
        <div><b>Yetkazish:</b> ${esc(deliveryLabel)}</div>
        <div><b>To'lov:</b> ${esc(payment)}</div>
      </div>

      <div style="margin:18px 0;">
        <h2 class="text-2xl font-bold" style="margin:0 0 10px;">Chek</h2>
        ${
          receiptUrl
            ? `<a href="${esc(receiptUrl)}" target="_blank" rel="noreferrer">
                <img src="${esc(receiptUrl)}" style="max-width:360px;width:100%;border-radius:14px;border:1px solid #eee;" />
              </a>`
            : `<p>—</p>`
        }
      </div>

      <div style="margin:18px 0;">
        <h2 class="text-2xl font-bold" style="margin:0 0 10px;">Mahsulotlar</h2>
        ${itemsHtml}
      </div>

      <div style="margin:22px 0;">
        <h2 class="text-2xl font-bold">Raw JSON</h2>
        <pre style="background:#0b1020;color:#c7ffb5;padding:14px;border-radius:14px;overflow:auto;">${esc(JSON.stringify(order, null, 2))}</pre>
      </div>
    </div>`;
}

load();