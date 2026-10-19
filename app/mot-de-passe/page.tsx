'use client';
/**
 * Choix du mot de passe personnel.
 *  - Première connexion : l'employé saisit l'adresse et le mot de passe provisoire
 *    reçus par e-mail, puis son mot de passe personnel.
 *  - Changement volontaire : l'utilisateur connecté confirme son mot de passe actuel.
 * Le mot de passe actuel est toujours redemandé (ré-authentification) : l'API
 * refuse le changement sans saisie récente.
 */
import Image from 'next/image';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EmailAuthProvider, reauthenticateWithCredential, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { api, ErreurApi, messageErreur } from '../../lib/api';
import { useSession } from '../../lib/session';
import { Alerte, Bouton, Champ, classeSaisie } from '../../components/ui';

const REGLES: Array<{ libelle: string; test: (m: string) => boolean }> = [
  { libelle: '12 caractères minimum', test: (m) => m.length >= 12 },
  { libelle: 'une lettre minuscule', test: (m) => /[a-z]/.test(m) },
  { libelle: 'une lettre majuscule', test: (m) => /[A-Z]/.test(m) },
  { libelle: 'un chiffre', test: (m) => /\d/.test(m) },
];

function messageConnexion(code?: string): string {
  if (code === 'auth/too-many-requests') return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.';
  if (code === 'auth/user-disabled') return 'Ce compte est désactivé. Contactez l’administrateur.';
  if (code === 'auth/network-request-failed') return 'Connexion au serveur impossible. Vérifiez votre réseau.';
  return 'Adresse e-mail ou mot de passe actuel incorrect.';
}

function Formulaire() {
  const router = useRouter();
  const { utilisateur, profil, rafraichir } = useSession();
  const emailInitial = useSearchParams().get('email') ?? '';
  const [email, setEmail] = useState(emailInitial);
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const connecte = !!utilisateur;
  const premiereConnexion = !connecte || !!profil?.motDePasseProvisoire;
  const identifiant = (utilisateur?.email ?? email).split('@')[0].toLowerCase();
  const contientIdentifiant = identifiant.length >= 4 && nouveau.toLowerCase().includes(identifiant);
  const reglesOk = REGLES.every((r) => r.test(nouveau)) && !contientIdentifiant;
  const identiques = nouveau === confirmation;
  const valide = (connecte || email.trim()) && actuel && reglesOk && identiques && nouveau !== actuel;

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    setErreur('');
    setEnCours(true);
    const adresse = (utilisateur?.email ?? email).trim();
    try {
      // 1. Vérification du mot de passe actuel (provisoire ou personnel)
      try {
        if (utilisateur) await reauthenticateWithCredential(utilisateur, EmailAuthProvider.credential(adresse, actuel));
        else await signInWithEmailAndPassword(auth, adresse, actuel);
      } catch (err) {
        setErreur(messageConnexion((err as { code?: string }).code));
        return;
      }
      // 2. Enregistrement du nouveau mot de passe par l'API (politique vérifiée côté serveur)
      try {
        await api.post('/moi/mot-de-passe', { nouveau });
      } catch (err) {
        setErreur(messageErreur(err));
        if (err instanceof ErreurApi && err.code === 'MOT_DE_PASSE_PROVISOIRE_EXPIRE') await signOut(auth);
        return;
      }
      // 3. Les anciennes sessions sont fermées : reconnexion avec le nouveau mot de passe
      await signInWithEmailAndPassword(auth, adresse, nouveau);
      await rafraichir();
      router.replace('/dashboard');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={valider} className="space-y-5" noValidate>
      <div>
        <h1 className="text-2xl font-bold">{premiereConnexion ? 'Choisir mon mot de passe' : 'Changer mon mot de passe'}</h1>
        <p className="mt-1 text-sm text-gris-600">
          {premiereConnexion
            ? 'Saisissez le mot de passe provisoire reçu par e-mail, puis choisissez votre mot de passe personnel. Il ne sera connu que de vous.'
            : 'Confirmez votre mot de passe actuel, puis choisissez le nouveau.'}
        </p>
      </div>
      {erreur && <Alerte>{erreur}</Alerte>}
      {connecte ? (
        <p className="text-sm">Compte : <strong>{utilisateur?.email}</strong></p>
      ) : (
        <Champ label="Adresse e-mail" obligatoire>
          {(id) => <input id={id} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={classeSaisie} />}
        </Champ>
      )}
      <Champ label={premiereConnexion ? 'Mot de passe provisoire (reçu par e-mail)' : 'Mot de passe actuel'} obligatoire>
        {(id) => <input id={id} type="password" autoComplete="current-password" required value={actuel} onChange={(e) => setActuel(e.target.value)} className={classeSaisie} />}
      </Champ>
      <Champ label="Nouveau mot de passe" obligatoire>
        {(id) => <input id={id} type="password" autoComplete="new-password" required value={nouveau} onChange={(e) => setNouveau(e.target.value)} className={classeSaisie} />}
      </Champ>
      <ul className="grid grid-cols-2 gap-1 text-xs" aria-label="Règles du mot de passe">
        {REGLES.map((r) => (
          <li key={r.libelle} className={r.test(nouveau) ? 'text-emerald-700' : 'text-gris-500'}>
            {r.test(nouveau) ? '✓' : '○'} {r.libelle}
          </li>
        ))}
      </ul>
      <Champ label="Confirmation" obligatoire erreur={confirmation && !identiques ? 'Les deux mots de passe ne correspondent pas.' : null}>
        {(id) => <input id={id} type="password" autoComplete="new-password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={classeSaisie} />}
      </Champ>
      {nouveau && actuel && nouveau === actuel && <p className="text-xs text-red-700">Le nouveau mot de passe doit être différent de l’actuel.</p>}
      {contientIdentifiant && <p className="text-xs text-red-700">Le mot de passe ne doit pas contenir votre identifiant ({identifiant}).</p>}
      <Bouton type="submit" enCours={enCours} disabled={!valide} className="w-full py-2.5">
        Enregistrer mon mot de passe
      </Bouton>
      <p className="text-center text-sm">
        {connecte && !profil?.motDePasseProvisoire ? (
          <Link href="/dashboard" className="font-semibold text-ynov-turquoise-fonce hover:underline">← Retour à l’application</Link>
        ) : (
          <Link href="/" className="font-semibold text-ynov-turquoise-fonce hover:underline">← Retour à la connexion</Link>
        )}
      </p>
    </form>
  );
}

export default function PageMotDePasse() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gris-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-gris-200 bg-white p-6 shadow-sm sm:p-8">
        <Image src="/logo-ynov.png" alt="Maroc Ynov Campus" width={86} height={48} priority className="mb-6 h-10 w-auto" />
        <Suspense fallback={null}>
          <Formulaire />
        </Suspense>
      </div>
    </div>
  );
}
