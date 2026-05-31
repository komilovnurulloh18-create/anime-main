import {
  ensureSeedData,
  getUsers,
  saveUsers,
  setCurrentUserId,
  clearCart,
  getCurrentUser,
  getWishlist,
  saveWishlist,
} from './storage.js';
import { renderProductCard, showToast, updateCartBadge } from './ui.js';
import { fetchProducts } from './api.js';
import { applyTranslations, initLangSwitcher, getLang, setLang, t } from './i18n.js';
import { auth } from './firebase.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';

// ====== INIT ======
ensureSeedData();
applyTranslations();
initLangSwitcher();
updateCartBadge();

const authSection = document.querySelector('#auth-section');
const profileSection = document.querySelector('#profile-section');
const loginForm = document.querySelector('#login-form');
const registerForm = document.querySelector('#register-form');
const loginBox = document.querySelector('#login-box');
const registerBox = document.querySelector('#register-box');
const showRegisterBtn = document.querySelector('#show-register');
const showLoginBtn = document.querySelector('#show-login');
const logoutBtn = document.querySelector('#logout-btn');
const wishlistList = document.querySelector('#wishlist-list');
const wishlistEmpty = document.querySelector('#wishlist-empty');
const settingsForm = document.querySelector('#settings-form');
const adminShortcuts = document.querySelector('#admin-shortcuts');
const userWishlist = document.querySelector('#user-wishlist');
const userSettings = document.querySelector('#user-settings');
const googleLoginBtn = document.querySelector('#google-login-btn');
const googleRegisterBtn = document.querySelector('#google-register-btn');

// ====== ADMIN CHECK ======
const ADMIN_EMAIL = 'nurullohkomilov163@gmail.com';
const ADMIN_PASSWORD = 'nur123mm';

// ====== HELPERS ======
const persistCurrentUser = (user) => {
  localStorage.setItem('currentUser', JSON.stringify(user));
};

const clearCurrentUserStorage = () => {
  localStorage.removeItem('currentUser');
  localStorage.removeItem('CURRENT_USER');
  localStorage.removeItem('user');
  localStorage.removeItem('USER');
  localStorage.removeItem('authUser');
  localStorage.removeItem('AUTH_USER');
  localStorage.setItem('isAdmin', 'false');
};

const showLogin = () => {
  loginBox?.classList.remove('hidden');
  registerBox?.classList.add('hidden');
};

const showRegister = () => {
  registerBox?.classList.remove('hidden');
  loginBox?.classList.add('hidden');
};

const buildUserPayload = (user) => {
  const isAdmin = (user?.email || '').toLowerCase() === ADMIN_EMAIL;

  return {
    id: user.id,
    name: user.name || 'Foydalanuvchi',
    phone: user.phone || '',
    email: user.email || '',
    password: user.password || '',
    photo: user.photo || '',
    cart: Array.isArray(user.cart) ? user.cart : [],
    wishlist: Array.isArray(user.wishlist) ? user.wishlist : [],
    orders: Array.isArray(user.orders) ? user.orders : [],
    role: isAdmin ? 'admin' : 'user',
    isAdmin,
  };
};

const saveAndLoginUser = (user) => {
  const users = getUsers();
  const normalizedUser = buildUserPayload(user);

  const existingIndex = users.findIndex(
    (item) =>
      item.id === normalizedUser.id ||
      (
        (item.email || '').toLowerCase() &&
        (item.email || '').toLowerCase() === (normalizedUser.email || '').toLowerCase()
      )
  );

  if (existingIndex >= 0) {
    users[existingIndex] = {
      ...users[existingIndex],
      ...normalizedUser,
      cart: Array.isArray(users[existingIndex].cart) ? users[existingIndex].cart : [],
      wishlist: Array.isArray(users[existingIndex].wishlist) ? users[existingIndex].wishlist : [],
      orders: Array.isArray(users[existingIndex].orders) ? users[existingIndex].orders : [],
    };
  } else {
    users.push(normalizedUser);
  }

  saveUsers(users);
  setCurrentUserId(normalizedUser.id);
  persistCurrentUser(normalizedUser);
  localStorage.setItem('isAdmin', normalizedUser.isAdmin ? 'true' : 'false');

  return normalizedUser;
};

const createGoogleProvider = () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: 'select_account',
  });
  return provider;
};

const loginWithGoogle = async () => {
  try {
    // oldingi sessiyani tozalab, account tanlashni majbur qilamiz
    try {
      await signOut(auth);
    } catch (_) {}

    const provider = createGoogleProvider();
    const result = await signInWithPopup(auth, provider);
    const firebaseUser = result.user;

    const savedUser = saveAndLoginUser({
      id: firebaseUser.uid,
      name: firebaseUser.displayName || 'Google User',
      email: firebaseUser.email || '',
      phone: firebaseUser.phoneNumber || '',
      photo: firebaseUser.photoURL || '',
      password: '',
    });

    showToast(t('welcome'));
    window.location.href = savedUser.isAdmin ? 'admin.html' : 'index.html';
  } catch (error) {
    console.error('Google login error:', error);

    if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
      return;
    }

    showToast('Google orqali kirishda xatolik', 'error');
  }
};

// ====== PROFILE ======
const renderProfile = () => {
  const user = getCurrentUser();

  if (!user) {
    authSection.classList.remove('hidden');
    profileSection.classList.add('hidden');
    return;
  }

  authSection.classList.add('hidden');
  profileSection.classList.remove('hidden');

  profileSection.querySelector('[data-profile-name]').textContent = user.name || '—';
  profileSection.querySelector('[data-profile-email]').textContent = user.email || '—';
  profileSection.querySelector('[data-profile-phone]').textContent = user.phone || '—';

  if (user?.isAdmin === true) {
    adminShortcuts?.classList.remove('hidden');
    userWishlist?.classList.add('hidden');
    userSettings?.classList.add('hidden');
  } else {
    adminShortcuts?.classList.add('hidden');
    userWishlist?.classList.remove('hidden');
    userSettings?.classList.remove('hidden');
  }
};

// ====== WISHLIST ======
const renderWishlist = async () => {
  const { products } = await fetchProducts();
  const wishlist = getWishlist();
  const items = products.filter((product) => wishlist.some((entry) => entry.id === product.id));

  if (!items.length) {
    wishlistEmpty.classList.remove('hidden');
    wishlistList.innerHTML = '';
    return;
  }

  wishlistEmpty.classList.add('hidden');
  wishlistList.innerHTML = items.map(renderProductCard).join('');
};

// ====== AUTH ======
loginForm?.addEventListener('submit', (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const email = formData.get('email')?.toString().trim().toLowerCase() || '';
  const password = formData.get('password')?.toString().trim() || '';
  const users = getUsers();

  const adminCredentialsMatch = email === ADMIN_EMAIL && password === ADMIN_PASSWORD;

  if (adminCredentialsMatch) {
    const existingAdmin = users.find((item) => (item.email || '').toLowerCase() === ADMIN_EMAIL);

    const adminUser = existingAdmin
      ? { ...existingAdmin, password: ADMIN_PASSWORD, role: 'admin', isAdmin: true }
      : {
          id: 'admin-fixed',
          name: 'Admin',
          phone: '',
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          cart: [],
          wishlist: [],
          orders: [],
          role: 'admin',
          isAdmin: true,
          photo: '',
        };

    const nextUsers = existingAdmin
      ? users.map((item) => ((item.email || '').toLowerCase() === ADMIN_EMAIL ? adminUser : item))
      : [adminUser, ...users];

    saveUsers(nextUsers);
    setCurrentUserId(adminUser.id);
    persistCurrentUser(adminUser);
    localStorage.setItem('isAdmin', 'true');
    showToast(t('welcome'));
    window.location.href = 'admin.html';
    return;
  }

  const user = users.find(
    (item) => (item.email || '').toLowerCase() === email && item.password === password
  );

  if (!user) {
    showToast(t('login_error'), 'error');
    return;
  }

  const updatedUser = {
    ...user,
    role: (user.email || '').toLowerCase() === ADMIN_EMAIL ? 'admin' : 'user',
    isAdmin: (user.email || '').toLowerCase() === ADMIN_EMAIL,
  };

  saveUsers(users.map((item) => (item.id === user.id ? updatedUser : item)));
  setCurrentUserId(updatedUser.id);
  persistCurrentUser(updatedUser);
  localStorage.setItem('isAdmin', updatedUser.isAdmin ? 'true' : 'false');
  showToast(t('welcome'));
  window.location.href = updatedUser.isAdmin ? 'admin.html' : 'index.html';
});

registerForm?.addEventListener('submit', (event) => {
  event.preventDefault();

  const formData = new FormData(registerForm);
  const name = formData.get('name')?.toString().trim() || '';
  const email = formData.get('email')?.toString().trim().toLowerCase() || '';
  const password = formData.get('password')?.toString().trim() || '';
  const users = getUsers();

  if (!email) {
    showToast('Email kiriting', 'error');
    return;
  }

  if (users.some((user) => (user.email || '').toLowerCase() === email)) {
    showToast('Bu email allaqachon mavjud', 'error');
    return;
  }

  const newUser = {
    id: `u-${Date.now()}`,
    name,
    phone: '',
    email,
    password,
    cart: [],
    wishlist: [],
    orders: [],
    role: 'user',
    isAdmin: false,
    photo: '',
  };

  users.push(newUser);
  saveUsers(users);
  setCurrentUserId(newUser.id);
  persistCurrentUser(newUser);
  localStorage.setItem('isAdmin', 'false');
  showToast(t('profile_created'));
  window.location.href = 'index.html';
});

googleLoginBtn?.addEventListener('click', loginWithGoogle);
googleRegisterBtn?.addEventListener('click', loginWithGoogle);

logoutBtn?.addEventListener('click', async () => {
  clearCart();
  setCurrentUserId(null);
  clearCurrentUserStorage();

  try {
    await signOut(auth);
  } catch (error) {
    console.warn('Firebase signOut warning:', error);
  }

  showToast(t('logout_done'));
  renderProfile();
  showLogin();
});

// ====== SETTINGS ======
settingsForm?.addEventListener('submit', (event) => {
  event.preventDefault();

  const formData = new FormData(settingsForm);
  const lang = formData.get('language');

  setLang(lang);
  applyTranslations();

  const headerSwitch = document.querySelector('[data-lang-switch]');
  if (headerSwitch) headerSwitch.value = lang;

  showToast(t('settings_saved'));
});

wishlistList?.addEventListener('click', (event) => {
  const button = event.target.closest('.wishlist-btn');
  if (!button) return;

  const id = Number(button.dataset.id);
  const wishlist = getWishlist().filter((item) => item.id !== id);
  saveWishlist(wishlist);
  showToast(t('wishlist_removed'));
  renderWishlist();
});

const initSettingsForm = () => {
  const languageSelect = settingsForm?.querySelector('[name="language"]');
  if (languageSelect) languageSelect.value = getLang();
};

renderProfile();
renderWishlist();
initSettingsForm();
showLogin();

showRegisterBtn?.addEventListener('click', () => {
  showRegister();
});

showLoginBtn?.addEventListener('click', () => {
  showLogin();
});

window.addEventListener('langChanged', () => {
  renderProfile();
  renderWishlist();
  initSettingsForm();
});