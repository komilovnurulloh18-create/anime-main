import { readStorage } from './storage.js';
import { t } from './i18n.js';
import { db, collection, getDocs, query, orderBy } from './firebase.js';

const normalizeProduct = (product, fallbackId) => {
  const images = Array.isArray(product.images)
    ? product.images.slice(0, 10)
    : product.img
      ? [product.img]
      : [];
  const id = String(product.id ?? product.docId ?? fallbackId ?? '');
  return {
    ...product,
    id,
    title: product.title || product.name || '',
    category: product.category || '',
    price: Number(product.price || 0),
    oldPrice: product.oldPrice ? Number(product.oldPrice) : null,
    rating: product.rating ?? null,
    desc: product.desc || product.description || '',
    images,
    img: product.img || images[0] || '',
  };
};

const loadFirestoreProducts = async () => {
  try {
    let snapshot;
    try {
      snapshot = await getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc')));
    } catch (orderErr) {
      snapshot = await getDocs(collection(db, 'products'));
    }
    return snapshot.docs.map((docSnap) =>
      normalizeProduct({ docId: docSnap.id, id: docSnap.id, ...docSnap.data() }, docSnap.id)
    );
  } catch (error) {
    console.error('Firestore products load error', error);
    return [];
  }
};

const loadJsonProducts = async () => {
  try {
    const response = await fetch('products.json');
    if (!response.ok) return [];
    const products = await response.json();
    return products.map((product, index) => normalizeProduct(product, `json-${index}`));
  } catch (error) {
    return [];
  }
};

export const fetchProducts = async () => {
  try {
    const firestoreProducts = await loadFirestoreProducts();
    const jsonProducts = await loadJsonProducts();
    const sellerProducts = readStorage('sellerProducts', []).map((p, i) => normalizeProduct(p, `seller-${i}`));
    const adminProducts = readStorage('adminProducts', []).map((p, i) => normalizeProduct(p, `admin-${i}`));

    const merged = [...firestoreProducts, ...jsonProducts, ...sellerProducts, ...adminProducts];
    const unique = [];
    const seen = new Set();
    for (const product of merged) {
      const key = String(product.id);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(product);
    }

    return { products: unique, error: null };
  } catch (error) {
    console.error('Fetch error', error);
    return { products: [], error: t('fetch_error') };
  }
};
