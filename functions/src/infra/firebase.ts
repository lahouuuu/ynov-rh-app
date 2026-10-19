/**
 * Initialisation du SDK Admin. En local, les variables FIRESTORE_EMULATOR_HOST,
 * FIREBASE_AUTH_EMULATOR_HOST et FIREBASE_STORAGE_EMULATOR_HOST (posées
 * automatiquement par les émulateurs) redirigent les appels vers ceux-ci.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

if (!getApps().length) {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const storageBucket =
    process.env.STORAGE_BUCKET || (projectId ? `${projectId}.firebasestorage.app` : undefined);
  initializeApp({ projectId, storageBucket });
}

let firestore: Firestore | null = null;

export function db(): Firestore {
  if (!firestore) {
    firestore = getFirestore();
    firestore.settings({ ignoreUndefinedProperties: true });
  }
  return firestore;
}

export const auth = () => getAuth();
export const bucket = () => getStorage().bucket();

/** Noms des collections Firestore (source unique pour éviter les fautes de frappe). */
export const COL = {
  users: 'users',
  campus: 'campus',
  services: 'services',
  parametres: 'parametres',
  dotations: 'dotations',
  mouvements: 'mouvements',
  demandes: 'demandes',
  signalements: 'signalements',
  justificatifs: 'justificatifs',
  notifications: 'notifications',
  historique: 'historique',
  idempotence: 'idempotence',
  config: 'config',
} as const;
