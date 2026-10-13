'use client';
/**
 * Connexion par courriel et mot de passe (Firebase Authentication) et
 * récupération du mot de passe. Aucune inscription publique : les comptes sont
 * créés par l'administrateur.
 */
import Image from 'next/image';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useSession } from '../lib/session';
import { Alerte, Bouton, Champ, classeSaisie } from '../components/ui';

function messageAuth(code?: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-email':
      return 'Adresse e-mail ou mot de passe incorrect.';
    case 'auth/user-disabled':
      return 'Ce compte est désactivé. Contactez l’administrateur.';
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.';
    case 'auth/network-request-failed':
      return 'Connexion au serveur impossible. Vérifiez votre réseau.';
    default:
      return 'La connexion a échoué. Réessayez.';
  }
}

function PageConnexion() {
  const router = useRouter();
  const sessionExpiree = useSearchParams().get('session') === 'expiree';
  const { utilisateur, profil, erreur: erreurSession } = useSession();
  const [mode, setMode] = useState<'connexion' | 'oubli'>('connexion');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (utilisateur && profil) router.replace('/dashboard');
  }, [utilisateur, profil, router]);

  async function connecter(e: React.FormEvent) {
    e.preventDefault();
    setErreur('');
    setEnCours(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), motDePasse);
    } catch (err) {
      setErreur(messageAuth((err as { code?: string }).code));
    } finally {
      setEnCours(false);
    }
  }

  async function reinitialiser(e: React.FormEvent) {
    e.preventDefault();
    setErreur('');
    setEnCours(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch {
      /* Même message dans tous les cas pour ne pas révéler l'existence d'un compte */
    } finally {
      setEnCours(false);
      setInfo('Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d’être envoyé.');
    }
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="flex flex-col justify-between bg-ynov-noir px-8 py-10 text-white lg:w-[44%] lg:px-14 lg:py-14">
        <Image src="/logo-ynov-blanc.png" alt="Maroc Ynov Campus" width={160} height={90} priority className="h-auto w-36" />
        <div className="my-10 lg:my-0">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-ynov-turquoise">Espace du personnel</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight lg:text-4xl">
            Congés, absences
            <br />
            et retards
          </h1>
          <p className="mt-4 max-w-sm text-sm text-white/70">
            Consultez votre solde, déposez vos demandes et suivez leur traitement, au même endroit.
          </p>
        </div>
        <p className="hidden text-xs text-white/50 lg:block">Maroc Ynov Campus · Application interne</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          {mode === 'connexion' ? (
            <form onSubmit={connecter} className="space-y-5" noValidate>
              <div>
                <h2 className="text-2xl font-bold">Connexion</h2>
                <p className="mt-1 text-sm text-gris-600">Utilisez l’adresse e-mail fournie par l’administration.</p>
              </div>
              {sessionExpiree && !erreur && <Alerte ton="info">Vous avez été déconnecté après une période d’inactivité.</Alerte>}
              {(erreur || (utilisateur && erreurSession)) && <Alerte>{erreur || erreurSession}</Alerte>}
              <Champ label="Adresse e-mail">
                {(id) => <input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={classeSaisie} />}
              </Champ>
              <Champ label="Mot de passe">
                {(id) => <input id={id} type="password" autoComplete="current-password" required value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} className={classeSaisie} />}
              </Champ>
              <Bouton type="submit" enCours={enCours} disabled={!email || !motDePasse} className="w-full py-2.5">
                Se connecter
              </Bouton>
              <button type="button" onClick={() => { setMode('oubli'); setErreur(''); setInfo(''); }} className="w-full text-center text-sm font-semibold text-ynov-turquoise-fonce hover:underline">
                Mot de passe oublié ?
              </button>
            </form>
          ) : (
            <form onSubmit={reinitialiser} className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold">Mot de passe oublié</h2>
                <p className="mt-1 text-sm text-gris-600">Saisissez votre adresse : vous recevrez un lien pour choisir un nouveau mot de passe.</p>
              </div>
              {info && <Alerte ton="succes">{info}</Alerte>}
              <Champ label="Adresse e-mail">
                {(id) => <input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={classeSaisie} />}
              </Champ>
              <Bouton type="submit" enCours={enCours} disabled={!email} className="w-full py-2.5">
                Envoyer le lien
              </Bouton>
              <button type="button" onClick={() => { setMode('connexion'); setInfo(''); }} className="w-full text-center text-sm font-semibold text-ynov-turquoise-fonce hover:underline">
                ← Retour à la connexion
              </button>
            </form>
          )}
          <p className="mt-10 text-center text-xs text-gris-500">
            <Link href="/confidentialite" className="hover:underline">Protection des données personnelles</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PageAccueil() {
  return (
    <Suspense fallback={null}>
      <PageConnexion />
    </Suspense>
  );
}
