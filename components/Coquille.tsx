'use client';
/**
 * Coquille de l'application : en-tête, navigation adaptée aux rôles,
 * notifications. Les pages de connexion, d'installation et de choix du mot de
 * passe s'affichent sans coquille.
 * Les pages protégées redirigent vers / si l'utilisateur n'est pas connecté.
 */
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from '../lib/session';
import { aLeRole } from '../lib/roles';
import { ROLES } from '../lib/libelles';
import { Alerte, Chargement, cx } from './ui';
import type { Profil, Role } from '../lib/types';

interface Lien {
  href: string;
  libelle: string;
  role?: Role;
}

const SECTIONS: Array<{ titre: string; role?: Role; liens: Lien[] }> = [
  {
    titre: 'Mon espace',
    liens: [
      { href: '/dashboard', libelle: 'Tableau de bord' },
      { href: '/conges', libelle: 'Mes congés' },
      { href: '/signalements', libelle: 'Absences et retards' },
      { href: '/planning', libelle: 'Planning' },
    ],
  },
  { titre: 'Responsable', role: 'responsable', liens: [{ href: '/equipe', libelle: 'Mon équipe' }] },
  {
    titre: 'Ressources humaines',
    role: 'rh',
    liens: [
      { href: '/rh', libelle: 'Demandes de congé' },
      { href: '/rh/signalements', libelle: 'Signalements' },
      { href: '/rh/droits', libelle: 'Droits annuels' },
      { href: '/rh/export', libelle: 'États et export' },
      { href: '/verifier-fiche', libelle: 'Vérifier une fiche' },
      { href: '/rh/parametres', libelle: 'Paramètres' },
    ],
  },
  {
    titre: 'Direction régionale',
    role: 'direction',
    liens: [
      { href: '/direction', libelle: 'Fiches à signer' },
      { href: '/verifier-fiche', libelle: 'Vérifier une fiche' },
    ],
  },
  {
    titre: 'Administration',
    role: 'admin',
    liens: [
      { href: '/admin/comptes', libelle: 'Comptes' },
      { href: '/admin/referentiels', libelle: 'Campus et services' },
    ],
  },
  { titre: 'Mon compte', liens: [{ href: '/mot-de-passe', libelle: 'Changer mon mot de passe' }] },
];

function estActif(pathname: string, href: string) {
  if (href === '/rh') return pathname === '/rh' || pathname === '/rh/';
  // Les fiches et dossiers sont consultés depuis plusieurs espaces : pas de surlignage de « Mes congés »
  if (href === '/conges') return pathname === '/conges' || pathname.startsWith('/conges/nouvelle');
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Navigation({ profil, pathname, onNaviguer }: { profil: Profil; pathname: string; onNaviguer?: () => void }) {
  return (
    <nav aria-label="Navigation principale" className="space-y-6">
      {SECTIONS.filter((s) => !s.role || aLeRole(profil, s.role)).map((s) => (
        <div key={s.titre}>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gris-400">{s.titre}</p>
          <ul className="space-y-0.5">
            {s.liens.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={onNaviguer}
                  aria-current={estActif(pathname, l.href) ? 'page' : undefined}
                  className={cx(
                    'block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    estActif(pathname, l.href) ? 'bg-ynov-noir text-white' : 'text-gris-700 hover:bg-gris-100',
                  )}
                >
                  {l.libelle}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Coquille({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { utilisateur, profil, chargement, erreur, deconnecter, rafraichir } = useSession();
  const [menuOuvert, setMenuOuvert] = useState(false);
  // Pages sans coquille : connexion, installation, choix du mot de passe, confidentialité
  const pagePublique = pathname === '/' || ['/confidentialite', '/installation', '/mot-de-passe'].some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (!chargement && !utilisateur && !pagePublique) router.replace('/');
    // Mot de passe provisoire : aucun autre écran avant le choix du mot de passe personnel
    if (profil?.motDePasseProvisoire && !pathname.startsWith('/mot-de-passe')) router.replace('/mot-de-passe');
  }, [chargement, utilisateur, profil, pagePublique, pathname, router]);

  // Actualise le compteur de notifications à chaque changement de page
  useEffect(() => {
    if (utilisateur && !pagePublique) void rafraichir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (pagePublique) return <>{children}</>;
  if (chargement || !utilisateur) return <Chargement texte="Vérification de la session…" />;
  if (!profil) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Alerte titre="Accès impossible">{erreur ?? 'Profil indisponible.'}</Alerte>
      </div>
    );
  }

  if (profil.motDePasseProvisoire) return <Chargement texte="Choix du mot de passe…" />;

  const nonLues = profil.notificationsNonLues ?? 0;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-gris-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg p-2 text-ynov-noir hover:bg-gris-100 lg:hidden"
              onClick={() => setMenuOuvert((v) => !v)}
              aria-label={menuOuvert ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={menuOuvert}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                {menuOuvert ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
            <Link href="/dashboard" className="flex items-center gap-3">
              <Image src="/logo-ynov.png" alt="Maroc Ynov Campus" width={86} height={48} priority className="h-9 w-auto" />
              <span className="hidden border-l border-gris-200 pl-3 text-sm font-bold tracking-wide sm:inline">Espace RH</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/notifications"
              className="relative rounded-lg p-2 text-ynov-noir hover:bg-gris-100"
              aria-label={`Notifications${nonLues ? ` (${nonLues} non lues)` : ''}`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
              </svg>
              {nonLues > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-ynov-turquoise px-1 text-[11px] font-bold text-white">
                  {nonLues > 99 ? '99+' : nonLues}
                </span>
              )}
            </Link>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight">{profil.nomComplet}</p>
              <p className="text-xs text-gris-500">{profil.roles.filter((r) => r !== 'collaborateur').map((r) => ROLES[r]).join(' · ') || ROLES.collaborateur}</p>
            </div>
            <button
              onClick={async () => {
                await deconnecter();
                router.replace('/');
              }}
              className="rounded-lg border border-gris-300 px-3 py-1.5 text-sm font-semibold hover:bg-gris-100"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-22">
            <Navigation profil={profil} pathname={pathname} />
          </div>
        </aside>
        {menuOuvert && (
          <div className="fixed inset-0 top-16 z-20 overflow-y-auto bg-white p-4 lg:hidden">
            <Navigation profil={profil} pathname={pathname} onNaviguer={() => setMenuOuvert(false)} />
          </div>
        )}
        <main className="min-w-0 flex-1">
          {children}
          <footer className="mt-12 border-t border-gris-200 pt-4 text-xs text-gris-500">
            Maroc Ynov Campus · Application interne · <Link href="/confidentialite" className="hover:underline">Protection des données personnelles</Link>
          </footer>
        </main>
      </div>
    </div>
  );
}
