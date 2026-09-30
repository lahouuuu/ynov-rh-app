import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCcoDomnUQxHKyD4IbFZ8j8Uo4miBOttO8",
  authDomain: "ynov-rh-app.firebaseapp.com",
  projectId: "ynov-rh-app",
  storageBucket: "ynov-rh-app.firebasestorage.app",
  messagingSenderId: "303019933316",
  appId: "1:303019933316:web:76cf7ff3b6b0c72e890cd1"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);