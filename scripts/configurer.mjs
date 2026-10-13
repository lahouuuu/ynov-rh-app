/**
 * Prépare les fichiers de configuration locaux (non versionnés) :
 *  - .env.development.local : frontend branché sur les émulateurs (npm run dev) ;
 *  - .env.production.local  : copie de .env.example à compléter avec la
 *    configuration web du projet Firebase (npm run build / deploy).
 * Les fichiers existants ne sont jamais écrasés.
 */
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';

const DEV = `# Généré par scripts/configurer.mjs — développement local avec les émulateurs
NEXT_PUBLIC_FIREBASE_API_KEY=demo-cle-locale
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-ynov-rh.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-ynov-rh
NEXT_PUBLIC_FIREBASE_APP_ID=demo-app
NEXT_PUBLIC_API_URL=http://127.0.0.1:5001/demo-ynov-rh/europe-west1/api
NEXT_PUBLIC_UTILISER_EMULATEURS=true
`;

if (existsSync('.env.development.local')) console.log('• .env.development.local existe déjà (conservé).');
else {
  writeFileSync('.env.development.local', DEV);
  console.log('✓ .env.development.local créé (émulateurs).');
}

if (existsSync('.env.production.local')) console.log('• .env.production.local existe déjà (conservé).');
else {
  copyFileSync('.env.example', '.env.production.local');
  console.log('✓ .env.production.local créé : renseignez NEXT_PUBLIC_FIREBASE_API_KEY et NEXT_PUBLIC_FIREBASE_APP_ID');
  console.log('  (Console Firebase › Paramètres du projet › Vos applications).');
}
