import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCcoDomnUQxHKyD4IbFZ8j8Uo4miBOttO8",
  authDomain: "ynov-rh-app.firebaseapp.com",
  projectId: "ynov-rh-app",
  storageBucket: "ynov-rh-app.firebasestorage.app",
  messagingSenderId: "303019933316",
  appId: "1:303019933316:web:76cf7ff3b6b0c72e890cd1"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);