/**
 * Crée (ou promeut) le PREMIER compte administrateur d'un projet Firebase en
 * ligne de commande. Alternative à la page /installation du site (qui exige la
 * clé CLE_INSTALLATION) ; ferme l'installation en ligne.
 *
 * Usage :
 *   GOOGLE_APPLICATION_CREDENTIALS=cle-service.json GCLOUD_PROJECT=<projet> \
 *   npm run creer-admin -- admin@exemple.ma Prénom Nom casablanca direction
 *
 * Un lien de définition du mot de passe est affiché à la fin.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { auth, COL, db } from '../infra/firebase';

async function principal() {
  const [email, prenom = 'Admin', nom = 'Ynov', campusId = 'casablanca', serviceId = 'direction'] = process.argv.slice(2);
  if (!email) throw new Error('Usage : creer-admin <email> [prénom] [nom] [campusId] [serviceId]');

  await db().collection(COL.campus).doc(campusId).set({ nom: campusId.charAt(0).toUpperCase() + campusId.slice(1) }, { merge: true });
  await db().collection(COL.services).doc(serviceId).set({ nom: serviceId.charAt(0).toUpperCase() + serviceId.slice(1) }, { merge: true });

  let uid: string;
  try {
    uid = (await auth().getUserByEmail(email)).uid;
  } catch {
    uid = (await auth().createUser({ email, displayName: `${prenom} ${nom}` })).uid;
  }
  const ref = db().collection(COL.users).doc(uid);
  const existant = await ref.get();
  const roles = new Set<string>([...(existant.get('roles') ?? []), 'collaborateur', 'admin']);
  await ref.set(
    {
      email, prenom, nom, roles: [...roles], campusId, serviceId, managerId: existant.get('managerId') ?? null,
      actif: true, perimetreRh: existant.get('perimetreRh') ?? { tous: false, campusIds: [] },
      updatedAt: FieldValue.serverTimestamp(), ...(existant.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
  await db().collection(COL.config).doc('installation').set({ installeeLe: FieldValue.serverTimestamp(), premierAdministrateur: uid }, { merge: true });
  console.log(`Administrateur prêt : ${email} (uid ${uid})`);
  console.log(`Lien de définition du mot de passe : ${await auth().generatePasswordResetLink(email)}`);
}

principal().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
