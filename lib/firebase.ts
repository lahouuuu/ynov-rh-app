/**
 * Initialisation du SDK Firebase côté navigateur (authentification uniquement).
 * Les données ne sont JAMAIS lues directement dans Firestore depuis le
 * navigateur : tout passe par l'API, qui applique les contrôles d'accès.
 *
 * Configuration : variables NEXT_PUBLIC_* des fichiers .env.*.local (non
 * versionnés). Si aucune clé n'est fournie, l'application bascule sur le
 * projet de démonstration « demo-ynov-rh » et les émulateurs locaux : ainsi
 * `npm run dev` fonctionne sans configuration (émulateurs + `npm run seed`).
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { browserSessionPersistence, connectAuthEmulator, getAuth, setPersistence } from 'firebase/auth';
import { AppCheck, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

const cleFournie = !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

export const PROJET_DEMO = 'demo-ynov-rh';

/** Émulateur de fonctions (développement local uniquement, sur la machine du développeur). */
export const EMULATEUR_FONCTIONS = 'http://127.0.0.1:5001';

/** Émulateurs : demandés explicitement, ou par défaut faute de configuration réelle. */
export const utiliseEmulateurs =
  process.env.NEXT_PUBLIC_UTILISER_EMULATEURS === 'true' ||
  (!cleFournie && process.env.NEXT_PUBLIC_UTILISER_EMULATEURS !== 'false');

const firebaseConfig = cleFournie
  ? {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    }
  : {
      // Valeurs factices acceptées par l'émulateur d'authentification
      apiKey: 'demo-cle-locale',
      authDomain: `${PROJET_DEMO}.firebaseapp.com`,
      projectId: PROJET_DEMO,
      appId: 'demo-app',
    };

if (!cleFournie && typeof window !== 'undefined') {
  console.warn(
    '[Ynov RH] NEXT_PUBLIC_FIREBASE_API_KEY absente : utilisation des émulateurs locaux (projet demo-ynov-rh). ' +
      'Lancez `npm run configurer` puis complétez .env.production.local pour le projet réel.',
  );
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
auth.languageCode = 'fr';

// Session limitée à l'onglet / au navigateur ouvert : fermer le navigateur
// déconnecte (postes partagés). Une déconnexion après inactivité complète ce
// dispositif (voir lib/session.tsx).
if (typeof window !== 'undefined') void setPersistence(auth, browserSessionPersistence);

/**
 * Firebase App Check (facultatif) : atteste que les appels proviennent de
 * l'application officielle. Activé si NEXT_PUBLIC_APPCHECK_CLE_SITE (clé
 * reCAPTCHA Enterprise) est fournie ; l'API l'exige si APPCHECK_OBLIGATOIRE=true.
 */
export let appCheck: AppCheck | null = null;
const cleAppCheck = process.env.NEXT_PUBLIC_APPCHECK_CLE_SITE;
if (typeof window !== 'undefined' && cleAppCheck && !utiliseEmulateurs) {
  appCheck = initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(cleAppCheck), isTokenAutoRefreshEnabled: true });
}

if (utiliseEmulateurs && typeof window !== 'undefined' && !(auth as unknown as { _emulateur?: boolean })._emulateur) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  (auth as unknown as { _emulateur?: boolean })._emulateur = true;
}
