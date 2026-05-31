import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js';
import {
  getFirestore,
  serverTimestamp,
  collection,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';

// Firestore must be enabled in Firebase Console (test mode is fine for now).
const firebaseConfig = {
  apiKey: 'AIzaSyB8Bdb48shjwEuu8r5bi4FIhZZhxM8abpk',
  authDomain: 'anime-shop-18e2d.firebaseapp.com',
  projectId: 'anime-shop-18e2d',
  storageBucket: 'anime-shop-18e2d.appspot.com',
  messagingSenderId: '864687916195',
  appId: '1:864687916195:web:9800944521fdac6df9ab16',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const nowTs = serverTimestamp;

export {
  collection,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onAuthStateChanged,
};