'use client';
/**
 * Installation de l'application : création du premier super-utilisateur
 * (administrateur). Disponible une seule fois, tant qu'aucun administrateur
 * n'existe, et protégée par la clé d'installation (CLE_INSTALLATION) définie
 * par la personne qui déploie l'application.
 */
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { apiPublique, messageErreur } from '../../lib/api';
import { Alerte, Bouton, Champ, Chargement, classeSaisie } from '../../components/ui';

interface Etat {
  necessaire: boolean;
  disponible: boolean;
}

interface Saisie {
  cle: string;
  prenom: string;
  nom: string;
  email: string;
  motDePasse: string;
  confirmation: string;
  campusNom: string;
  serviceNom: string;
}

/** « Rabat Agdal » → « rabat-agdal » (identifiant technique du référentiel). */
function identifiant(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+)|(-+$)/g, '')
    .slice(0, 40);
}

const politiqueOk = (m: string) => m.length >= 12 && /[a-z]/.test(m) && /[A-Z]/.test(m) && /\d/.test(m);

function Formulaire() {
  const router = useRouter();
  const [s, setS] = useState<Saisie>({ cle: '', prenom: '', nom: '', email: '', motDePasse: '', confirmation: '', campusNom: 'Casablanca', serviceNom: 'Direction' });
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const maj = (p: Partial<Saisie>) => setS((x) => ({ ...x, ...p }));
  const valide =
    s.cle && s.prenom.trim() && s.nom.trim() && s.email.trim() && politiqueOk(s.motDePasse) && s.motDePasse === s.confirmation &&
    identifiant(s.campusNom).length >= 2 && identifiant(s.serviceNom).length >= 2;

  async function installer(e: React.FormEvent) {
    e.preventDefault();
    setErreur('');
    setEnCours(true);
    try {
      await apiPublique.post('/installation', {
        cle: s.cle,
        prenom: s.prenom.trim(),
        nom: s.nom.trim(),
        email: s.email.trim(),
        motDePasse: s.motDePasse,
        campus: { id: identifiant(s.campusNom), nom: s.campusNom.trim() },
        service: { id: identifiant(s.serviceNom), nom: s.serviceNom.trim() },
      });
      await signInWithEmailAndPassword(auth, s.email.trim(), s.motDePasse);
      router.replace('/admin/comptes');
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={installer} className="space-y-4" noValidate>
      {erreur && <Alerte>{erreur}</Alerte>}
      <Champ label="Clé d’installation" obligatoire aide="Fournie par la personne qui a déployé l’application (variable CLE_INSTALLATION).">
        {(id) => <input id={id} type="password" autoComplete="off" required value={s.cle} onChange={(e) => maj({ cle: e.target.value })} className={classeSaisie} />}
      </Champ>
      <fieldset className="space-y-4 rounded-lg border border-gris-200 p-4">
        <legend className="px-1 text-sm font-semibold">Super-administrateur</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Prénom" obligatoire>{(id) => <input id={id} required value={s.prenom} onChange={(e) => maj({ prenom: e.target.value })} className={classeSaisie} />}</Champ>
          <Champ label="Nom" obligatoire>{(id) => <input id={id} required value={s.nom} onChange={(e) => maj({ nom: e.target.value })} className={classeSaisie} />}</Champ>
        </div>
        <Champ label="Adresse e-mail professionnelle" obligatoire>
          {(id) => <input id={id} type="email" autoComplete="username" required value={s.email} onChange={(e) => maj({ email: e.target.value })} className={classeSaisie} />}
        </Champ>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Mot de passe" obligatoire aide="12 caractères, majuscule, minuscule et chiffre.">
            {(id) => <input id={id} type="password" autoComplete="new-password" required value={s.motDePasse} onChange={(e) => maj({ motDePasse: e.target.value })} className={classeSaisie} />}
          </Champ>
          <Champ label="Confirmation" obligatoire erreur={s.confirmation && s.confirmation !== s.motDePasse ? 'Les mots de passe diffèrent.' : null}>
            {(id) => <input id={id} type="password" autoComplete="new-password" required value={s.confirmation} onChange={(e) => maj({ confirmation: e.target.value })} className={classeSaisie} />}
          </Champ>
        </div>
      </fieldset>
      <fieldset className="grid gap-4 rounded-lg border border-gris-200 p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Premier rattachement</legend>
        <Champ label="Campus" obligatoire>{(id) => <input id={id} required value={s.campusNom} onChange={(e) => maj({ campusNom: e.target.value })} className={classeSaisie} />}</Champ>
        <Champ label="Service" obligatoire>{(id) => <input id={id} required value={s.serviceNom} onChange={(e) => maj({ serviceNom: e.target.value })} className={classeSaisie} />}</Champ>
      </fieldset>
      <p className="text-xs text-gris-500">
        Ce compte administre les comptes et les référentiels. Il ne donne accès à aucun dossier : créez ensuite les comptes RH, direction et
        collaborateurs, qui recevront leurs identifiants provisoires par e-mail.
      </p>
      <Bouton type="submit" enCours={enCours} disabled={!valide} className="w-full py-2.5">Installer et créer le compte</Bouton>
    </form>
  );
}

export default function PageInstallation() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    apiPublique.get<Etat>('/installation').then(setEtat).catch((e) => setErreur(messageErreur(e)));
  }, []);

  let contenu: React.ReactNode;
  if (erreur) contenu = <Alerte>{erreur}</Alerte>;
  else if (!etat) contenu = <Chargement />;
  else if (!etat.necessaire) {
    contenu = (
      <Alerte ton="info" titre="Application déjà installée">
        Un administrateur existe déjà. <Link href="/" className="font-semibold underline">Se connecter</Link>
      </Alerte>
    );
  } else if (!etat.disponible) {
    contenu = (
      <Alerte ton="attente" titre="Installation en ligne désactivée">
        Définissez la clé CLE_INSTALLATION dans la configuration de la fonction, ou créez le premier administrateur avec la commande
        <code className="mx-1">npm run creer-admin</code>.
      </Alerte>
    );
  } else contenu = <Formulaire />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gris-50 px-4 py-10">
      <div className="w-full max-w-xl rounded-2xl border border-gris-200 bg-white p-6 shadow-sm sm:p-8">
        <Image src="/logo-ynov.png" alt="Maroc Ynov Campus" width={86} height={48} priority className="mb-6 h-10 w-auto" />
        <h1 className="text-2xl font-bold">Installation</h1>
        <p className="mb-5 mt-1 text-sm text-gris-600">Création du premier compte super-administrateur. Cette étape n’est possible qu’une seule fois.</p>
        {contenu}
      </div>
    </div>
  );
}
