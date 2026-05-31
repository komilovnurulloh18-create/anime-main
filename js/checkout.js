import {
  ensureSeedData,
  getCart,
  saveCart,
  getCurrentUser,
  getCachedProducts,
  setCachedProducts,
} from './storage.js';
import { formatPrice, showToast, updateCartBadge } from './ui.js';
import { applyTranslations, initLangSwitcher, t } from './i18n.js';
import { STORE_PAYMENT } from './config.js';
import { imgbbUpload } from "./imgbb.js";
import { db, nowTs, collection, doc, setDoc, getDocs, query, orderBy } from './firebase.js';

ensureSeedData();
applyTranslations();
initLangSwitcher();
updateCartBadge();

const API_KEY = "9a6bc6256c8f61ac7df85be0514643b8";

const uid = () => `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const form = document.querySelector('#checkout-form');
const summaryBox = document.querySelector('#checkout-summary');
const paymentDoneBtn = document.querySelector('#payment-done');
const receiptStep = document.querySelector('#receipt-step');
const receiptInput = document.querySelector('#receipt-input');
const receiptPreview = document.querySelector('#receipt-preview');
const receiptFilename = document.querySelector('#receipt-filename');
const receiptSubmit = document.querySelector('#receipt-submit');
const copyButtons = document.querySelectorAll('.copy-btn');
const citySelect = document.querySelector('#citySelect');
const phoneInput = document.querySelector('#phoneInput');

let districtSelect = document.querySelector('#districtSelect');
let districtInput = null;

const REGIONS = {
  Toshkent: ["Mirzo Ulug‘bek", 'Yunusobod', 'Chilonzor', 'Olmazor'],
  Andijon: ['Andijon tumani', 'Asaka', 'Baliqchi'],
  "Farg‘ona": ["Farg‘ona tumani", 'Quva', 'Marg‘ilon'],
  Namangan: ['Namangan tumani', 'Chortoq', 'Pop'],
  Samarqand: ['Samarqand tumani', 'Urgut', 'Jomboy'],
  Buxoro: ['Buxoro tumani', 'G‘ijduvon', 'Kogon'],
  Xorazm: ['Urganch', 'Xiva', 'Hazorasp'],
  Qashqadaryo: ['Qarshi', 'Shahrisabz', 'Kitob'],
  Surxondaryo: ['Termiz', 'Denov', 'Sherobod'],
  Jizzax: ['Jizzax tumani', 'Zomin', 'G‘allaorol'],
  Navoiy: ['Navoiy tumani', 'Zarafshon', 'Karmana'],
  Sirdaryo: ['Guliston', 'Yangiyer', 'Boyovut'],
};

const DELIVERY_OPTIONS = {
  standard: { label: 'Standart (14–18 kun)', perKgUsd: 5, weightKg: 1, price: Math.round(5 * 13000) },
  fast: { label: 'Tezkor (7–10 kun)', perKgUsd: 9, weightKg: 1, price: Math.round(9 * 13000) },
};

let productsMap = new Map();
let receiptFile = null;
let receiptPreviewUrl = null;
let selectedDelivery = 'standard';

/* ===== PHONE ===== */
const normalizePhone = (value) => (value || '').toString().replace(/\D/g, '').replace(/^998?/, '998').slice(0,12);
const isValidPhone = (value) => /^\d{12}$/.test(value) && value.startsWith('998');
const getValidatedPhone = () => {
  const phone = normalizePhone(phoneInput.value);
  if (!phone || phone === '998') { showToast('Telefon raqamingizni kiriting', 'error'); return null; }
  if (!isValidPhone(phone)) { showToast('Telefon raqami noto‘g‘ri', 'error'); return null; }
  return `+${phone}`;
};

/* ===== BUTTON LOADING ===== */
const setButtonLoading = (button, loadingText, isLoading) => {
  if (!button) return;
  if (isLoading) { button.dataset.originalText = button.textContent; button.textContent = loadingText; button.disabled = true; }
  else { button.textContent = button.dataset.originalText || button.textContent; button.disabled = false; }
};

/* ===== PHONE MASK ===== */
const initPhoneMask = () => {
  if (!phoneInput) return;
  const formatPhone = (value) => {
    let digits = value.replace(/\D/g, '');
    if (digits.startsWith('998')) digits = digits.slice(3);
    digits = digits.slice(0,9);
    let result = '+998';
    if (digits.length>0) result += ' ' + digits.slice(0,2);
    if (digits.length>=3) result += ' ' + digits.slice(2,5);
    if (digits.length>=6) result += ' ' + digits.slice(5,7);
    if (digits.length>=8) result += ' ' + digits.slice(7,9);
    return result;
  };
  phoneInput.addEventListener('input', ()=>phoneInput.value = formatPhone(phoneInput.value));
  phoneInput.addEventListener('focus', ()=>{ if(!phoneInput.value) phoneInput.value='+998 '; });
  phoneInput.addEventListener('keydown', (e)=>{ if(phoneInput.selectionStart<=4 && ['Backspace','Delete'].includes(e.key)) e.preventDefault(); });
};

/* ===== FETCH PRODUCTS ===== */
const fetchProductsFromFirestore = async () => {
  const cached = getCachedProducts();
  if (cached?.length) return cached;
  try {
    let snapshot;
    try { snapshot = await getDocs(query(collection(db,'products'),orderBy('createdAt','desc')));
      if (!snapshot.docs.length) snapshot = await getDocs(collection(db,'products'));
    } catch { snapshot = await getDocs(collection(db,'products')); }

    const products = snapshot.docs.map(docSnap=>{
      const data = docSnap.data() || {};
      const images = Array.isArray(data.images) ? data.images : data.img ? [data.img] : [];
      return { id: docSnap.id, ...data, images, img: data.img || images[0] || '' };
    });
    setCachedProducts(products);
    return products;
  } catch { return []; }
};


/* ===== SUMMARY ===== */
const calculateSummary = () => {
  const cart = getCart();
  const subtotal = cart.reduce((sum,item)=>{
    const itemKey = String(item.productId||item.id||'');
    const product = productsMap.get(itemKey);
    const price = Number(item.variantPrice??item.price??product?.price??0);
    return sum + price * (Number(item.qty)||1);
  },0);

  const deliveryMeta = DELIVERY_OPTIONS[selectedDelivery];
  summaryBox.innerHTML = `
    <div class="space-y-2 text-sm text-slate-300">
      <div class="flex justify-between"><span>${t('subtotal')}</span><span>${formatPrice(subtotal)} so'm</span></div>
      <div class="flex justify-between"><span>Yetkazish</span><span>${deliveryMeta.label}</span></div>
    </div>
    <div class="mt-4 flex justify-between text-lg font-bold text-white">
      <span>${t('total')}</span><span>${formatPrice(subtotal)} so'm</span>
    </div>
  `;
  return { total: subtotal, subtotal, deliveryMeta };
};

const setDeliveryType = (type)=>{
  selectedDelivery=type;
  form.querySelectorAll('input[name="shipping"]').forEach(radio=>{
    radio.checked = radio.value===type;
    const card = radio.closest('label');
    if(card){
      card.classList.toggle('border-emerald-400/60', radio.checked);
      card.classList.toggle('bg-emerald-500/10', radio.checked);
      card.classList.toggle('shadow-lg', radio.checked);
      card.classList.toggle('shadow-emerald-500/20', radio.checked);
    }
  });
  calculateSummary();
};

  /* ===== BUILD ITEMS ===== */
const buildOrderItems = (cart) => cart.map(item => {
  const itemKey = String(item.productId || item.id || '');
  const p = productsMap.get(itemKey);

  const price = Number(item.variantPrice ?? p?.price ?? item.price ?? 0);
  const img =
    item.image ||
    item.selectedImage ||
    item.selectedImageUrl ||
    p?.images?.[0] ||
    p?.img ||
    item.img ||
    '';

  const title = item.title || p?.title || 'Mahsulot';

  const variantValue =
    item.variantName ||
    item.variant ||
    item.size ||
    item.selectedVariant ||
    item.selectedOption ||
    item.option ||
    item.variantText ||
    (Array.isArray(item.options) ? item.options.join(", ") : "") ||
    "";

  return {
    id: itemKey,
    qty: Number(item.qty) || 1,
    price,
    title,
    img,
    variant: String(variantValue),
  };
});

/* ===== CREATE ORDER ===== */
const createOrder = async ({ paymentMethod, receiptUrl='', contactPhone })=>{
  const cart = getCart();
  if(!cart.length){ showToast(t('cart_empty'),'error'); return; }
  const { total, subtotal, deliveryMeta } = calculateSummary();
  const currentUser = getCurrentUser();
  const orderId = uid();
  const items = buildOrderItems(cart);

  // ===== GET ADDRESS =====
  const formData = new FormData(form);
  const region = formData.get('city') || '';
  const district = districtInput?.value || '';
  const addressText = formData.get('address') || '';

  const payload = {
    id: orderId,
    docId: orderId,
    date: new Date().toISOString(),
    createdAt: nowTs(),
    updatedAt: nowTs(),
    userId: currentUser?.id||null,
    userName: String(currentUser?.name||'Guest'),
    userPhone: String(contactPhone||currentUser?.phone||''),
    subtotal,
    totalProductsSum: subtotal,
    total,
    payment: paymentMethod,
    receiptUrl,
    status: 'pending',
    deliveryType: selectedDelivery||null,
    delivery: { type:selectedDelivery, ...deliveryMeta },
    region,       // region qo‘shildi
    district,     // district qo‘shildi
    address: addressText, // home address qo‘shildi
    items
  };

  await setDoc(doc(db,'orders',orderId),payload,{merge:true});
  saveCart([]);
  updateCartBadge();
  showToast(paymentMethod==='card_transfer'?'Chek yuborildi. Tekshirilmoqda...':'Buyurtma yuborildi!');
  receiptInput.value=''; receiptFile=null;
  if(receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
  receiptPreviewUrl=null;
  receiptPreview.innerHTML=t('receipt_preview');
  receiptFilename.textContent='Fayl tanlanmagan';
  setTimeout(()=>{window.location.href='orders.html';},700);
};

/* ===== DISTRICT INPUT ===== */
const replaceDistrictSelectWithInput = () => {
  if(!districtSelect) return;
  const input = document.createElement('input');
  input.type='text'; input.id=districtSelect.id||'districtSelect';
  input.name=districtSelect.name||'district';
  input.placeholder='Tumanni yozing';
  input.autocomplete='address-level2';
  input.value=districtSelect.value||'';
  input.className = districtSelect.className || 'w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none';
  districtSelect.parentNode?.replaceChild(input,districtSelect);
  districtInput = input; districtSelect=null;
};

const initAddressSelectors = () => {
  if(!citySelect) return;
  citySelect.innerHTML='<option value="">Hududni tanlang</option>'+Object.keys(REGIONS).map(r=>`<option value="${r}">${r}</option>`).join('');
  replaceDistrictSelectWithInput();
};

/* ===== SHOW RECEIPT ===== */
const showReceiptStep = ()=>{ receiptStep?.classList.remove('hidden'); receiptStep?.scrollIntoView({behavior:'smooth',block:'center'}); };

/* ===== INIT ===== */
const init = async ()=>{
  const products = await fetchProductsFromFirestore();
  productsMap = new Map(products.map(p=>[String(p.id),p]));
  if(!getCart().length) summaryBox.innerHTML=`<p class="text-sm text-slate-300">${t('cart_empty')}</p>`;
  else calculateSummary();
  const owner=document.querySelector('#store-owner');
  const card=document.querySelector('#store-card');
  const bank=document.querySelector('#store-bank');
  if(owner) owner.textContent=STORE_PAYMENT.ownerFullName;
  if(card) card.textContent=STORE_PAYMENT.cardNumber;
  if(bank) bank.textContent=STORE_PAYMENT.bank;
  initAddressSelectors();
  initPhoneMask();
  setDeliveryType('standard');
  form?.querySelectorAll('input[name="shipping"]').forEach(radio=>radio.addEventListener('change',()=>setDeliveryType(radio.value)));
};

/* ===== FORM SUBMIT ===== */
form?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const phone=getValidatedPhone(); if(!phone) return;
  const payment = form.querySelector('input[name="payment"]:checked')?.value||'card_transfer';
  if(payment==='card_transfer'){ showReceiptStep(); return; }
  try{ await createOrder({paymentMethod:payment, contactPhone:phone}); } catch{ showToast('Buyurtma yaratishda xatolik','error'); }
});

paymentDoneBtn?.addEventListener('click',()=>{
  const phone=getValidatedPhone(); if(!phone) return;
  showReceiptStep();
});

receiptInput?.addEventListener('change',()=>{
  const file=receiptInput.files?.[0];
  if(!file){ receiptFile=null; if(receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl); receiptPreviewUrl=null; receiptPreview.innerHTML=t('receipt_preview'); receiptFilename.textContent='Fayl tanlanmagan'; return; }
  receiptFile=file; if(receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
  receiptPreviewUrl=URL.createObjectURL(file);
  receiptPreview.innerHTML=`<img src="${receiptPreviewUrl}" alt="Chek" class="h-full w-full rounded-2xl object-cover" />`;
  receiptFilename.textContent=file.name;
});

receiptSubmit?.addEventListener('click', async ()=>{
  const phone=getValidatedPhone(); if(!phone) return;
  if(!receiptFile){ showToast('Chek faylini tanlang','error'); return; }
  try{
    setButtonLoading(receiptSubmit,'Yuborilmoqda...',true);
    const imageUrl=await imgbbUpload(receiptFile,API_KEY);
    await createOrder({paymentMethod:'receipt', receiptUrl:imageUrl, contactPhone:phone});
    showToast('Tekshiruvga yuborildi');
  } catch(e){ showToast(String(e?.message||'Chekni yuborishda xatolik'),'error'); }
  finally{ setButtonLoading(receiptSubmit,'',false); }
});

copyButtons.forEach(btn=>{
  btn.addEventListener('click', async ()=>{
    const id = btn.dataset.copyTarget;
    const target = document.getElementById(id);
    if(!target) return;
    try{ await navigator.clipboard.writeText(target.textContent.trim()); showToast(t('copied')); } catch{ showToast('Nusxalab bo‘lmadi','error'); }
  });
});

init();